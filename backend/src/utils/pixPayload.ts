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

const formatPixKey = (pixKey: string, pixKeyType: PixKeyType): string => {
  // Runtime validation: pixKeyType must be one of the known types
  const validKeyTypes: PixKeyType[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];
  if (!validKeyTypes.includes(pixKeyType)) {
    throw new Error(`Tipo de chave Pix inválido: ${pixKeyType}`);
  }

  if (pixKeyType === 'telefone') {
    const digits = pixKey.replace(/\D/g, '');
    return `+55${digits}`;
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

  // Normalize and bound txId to prevent overflow and encoding issues
  const normalizedTxId = normalizeAscii(txId || '***').slice(0, 25);
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
