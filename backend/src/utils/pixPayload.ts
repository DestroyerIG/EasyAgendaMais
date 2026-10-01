export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface PixPayloadInput {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amount: number;
  description?: string;
  txId?: string;
}

const ID_PAYLOAD_FORMAT_INDICATOR = '00';
const ID_MERCHANT_ACCOUNT_INFO = '26';
const ID_MERCHANT_ACCOUNT_INFO_GUI = '00';
const ID_MERCHANT_ACCOUNT_INFO_KEY = '01';
const ID_MERCHANT_ACCOUNT_INFO_DESCRIPTION = '02';
const ID_MERCHANT_CATEGORY_CODE = '52';
const ID_TRANSACTION_CURRENCY = '53';
const ID_TRANSACTION_AMOUNT = '54';
const ID_COUNTRY_CODE = '58';
const ID_MERCHANT_NAME = '59';
const ID_MERCHANT_CITY = '60';
const ID_ADDITIONAL_DATA_FIELD = '62';
const ID_ADDITIONAL_DATA_FIELD_TX_ID = '05';
const ID_CRC16 = '63';

const field = (id: string, value: string): string => {
  // EMV spec: TLV length field must be exactly 2 digits (0-99)
  if (value.length > 99) {
    throw new Error(`Campo Pix excede o limite de 99 caracteres: ID ${id} tem ${value.length} chars`);
  }
  const length = String(value.length).padStart(2, '0');
  return `${id}${length}${value}`;
};

const normalizeAscii = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase();

/**
 * Reduz um telefone brasileiro aos dígitos nacionais (DDD + número), removendo o
 * código do país quando presente. Aceita "(83) 99999-0000", "83999990000",
 * "5583999990000" e "+55 (83) 99999-0000" — todos viram "83999990000".
 * O código "55" só é removido quando o total tem 12 ou 13 dígitos (55 + 10/11),
 * para não mutilar um número nacional cujo DDD seja 55 (ex.: "55 99999-0000").
 */
export const toNationalPhoneDigits = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
};

/** Limite da chave Pix no campo 26: 99 - "0014br.gov.bcb.pix"(18) - "01XX"(4) = 77. */
export const PIX_KEY_MAX_LENGTH = 77;

/**
 * Valida o formato de uma chave Pix de acordo com o tipo. Retorna uma mensagem de
 * erro em PT-BR, ou null quando a chave é válida.
 */
export const validatePixKeyFormat = (pixKey: string, pixKeyType: PixKeyType): string | null => {
  const trimmed = pixKey.trim();
  switch (pixKeyType) {
    case 'cpf':
      return /^\d{11}$/.test(trimmed.replace(/\D/g, '')) ? null : 'CPF deve ter 11 dígitos';
    case 'cnpj':
      return /^\d{14}$/.test(trimmed.replace(/\D/g, '')) ? null : 'CNPJ deve ter 14 dígitos';
    case 'telefone': {
      if (/[^\d\s()+-]/.test(trimmed)) return 'Telefone inválido';
      const national = toNationalPhoneDigits(trimmed);
      // DDD (11-99, sem zero) + fixo (8 dígitos, começa com 2-5) ou celular (9 dígitos, começa com 9)
      return /^[1-9][1-9](?:[2-5]\d{7}|9\d{8})$/.test(national)
        ? null
        : 'Telefone deve ser um número brasileiro válido com DDD';
    }
    case 'aleatoria':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
        ? null
        : 'Chave aleatória deve estar no formato UUID';
    case 'email':
      if (trimmed.length > PIX_KEY_MAX_LENGTH) {
        return `E-mail deve ter no máximo ${PIX_KEY_MAX_LENGTH} caracteres`;
      }
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? null : 'E-mail inválido';
    default:
      return 'Tipo de chave Pix inválido';
  }
};

const formatPixKey = (pixKey: string, pixKeyType: PixKeyType): string => {
  // Runtime validation: pixKeyType must be one of the known types
  const validKeyTypes: PixKeyType[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
  if (!validKeyTypes.includes(pixKeyType)) {
    throw new Error(`Tipo de chave Pix inválido: ${pixKeyType}`);
  }

  if (pixKeyType === 'telefone') {
    return `+55${toNationalPhoneDigits(pixKey)}`;
  }
  if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') {
    return pixKey.replace(/\D/g, '');
  }
  return pixKey.trim();
};

// CRC16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF) — exigido pelo
// padrão EMV do BR Code. Implementação bit a bit, sem dependência externa.
const crc16 = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export function buildPixPayload({
  pixKey,
  pixKeyType,
  merchantName,
  merchantCity,
  amount,
  description,
  txId = '***',
}: PixPayloadInput): string {
  // Validate amount is positive and has at most 2 decimal places
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor do Pix deve ser maior que zero');
  }
  // Check if amount can be represented exactly with 2 decimal places
  // by verifying that amount * 100 is an integer (within floating point tolerance)
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.001) {
    throw new Error('Valor do Pix deve ter no máximo 2 casas decimais');
  }

  // Build merchant account info with strict 99-character budget
  // Field 26 must be at most 99 chars total (includes all subfields: GUI + key + optional description)
  const guiField = field(ID_MERCHANT_ACCOUNT_INFO_GUI, 'br.gov.bcb.pix');
  const formattedKey = formatPixKey(pixKey, pixKeyType);
  const keyField = field(ID_MERCHANT_ACCOUNT_INFO_KEY, formattedKey);
  const currentLength = guiField.length + keyField.length;
  const remainingBudget = 99 - currentLength;

  let descriptionField = '';
  if (description && remainingBudget > 4) {
    // Reserve 4 chars minimum for "02XX" (ID + 2-digit length)
    const maxDescriptionLength = remainingBudget - 4;
    const normalizedDesc = normalizeAscii(description);
    const truncatedDesc = normalizedDesc.slice(0, maxDescriptionLength);
    if (truncatedDesc) {
      descriptionField = field(ID_MERCHANT_ACCOUNT_INFO_DESCRIPTION, truncatedDesc);
    }
  }

  const merchantAccountInfo = guiField + keyField + descriptionField;

  // Normalize and bound txId to prevent overflow and encoding issues.
  // Sem identificador de transação, o padrão BR Code exige o valor literal "***" —
  // ele NÃO pode passar por normalizeAscii (que removeria os asteriscos e geraria um
  // subcampo vazio "0500"). Um txid informado que normalize para vazio também cai no "***".
  const normalizedTxId = (txId && txId !== '***' ? normalizeAscii(txId).slice(0, 25) : '') || '***';
  const additionalData = field(ID_ADDITIONAL_DATA_FIELD_TX_ID, normalizedTxId);

  const payloadWithoutCrc =
    field(ID_PAYLOAD_FORMAT_INDICATOR, '01') +
    field(ID_MERCHANT_ACCOUNT_INFO, merchantAccountInfo) +
    field(ID_MERCHANT_CATEGORY_CODE, '0000') +
    field(ID_TRANSACTION_CURRENCY, '986') +
    field(ID_TRANSACTION_AMOUNT, amount.toFixed(2)) +
    field(ID_COUNTRY_CODE, 'BR') +
    field(ID_MERCHANT_NAME, normalizeAscii(merchantName).slice(0, 25) || 'RECEBEDOR') +
    field(ID_MERCHANT_CITY, normalizeAscii(merchantCity).slice(0, 15) || 'BRASIL') +
    field(ID_ADDITIONAL_DATA_FIELD, additionalData) +
    `${ID_CRC16}04`;

  return `${payloadWithoutCrc}${crc16(payloadWithoutCrc)}`;
}
