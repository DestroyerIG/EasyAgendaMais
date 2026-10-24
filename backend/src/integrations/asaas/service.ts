import { AppError } from '../../utils/errors.js';
import { PLAN_PRICES } from '../../config/planCatalog.js';
import {
  isValidCpf as validateCpf,
  isValidCnpj as validateCnpj,
  isValidCpfCnpj as validateCpfCnpj,
  normalizeDocumentDigits,
} from '../../utils/cpfCnpj.js';
import logger from '../../utils/logger.js';
import {
  asaasClient,
  normalizeAsaasApiKey,
  removeEmptyFields as removeAsaasEmptyFields,
} from './client.js';
import { asaasMapper, type AsaasWebhookPayment, type AsaasPixQrCodePayload, type AsaasPixData } from './mapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsaasBusinessInput {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  cpf_cnpj?: string | null;
  cpfCnpj?: string | null;
  document?: string | null;
  documentNumber?: string | null;
  owner_name?: string | null;
  ownerName?: string | null;
  responsible_name?: string | null;
  responsibleName?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  asaas_customer_id?: string | null;
  asaasCustomerId?: string | null;
  provider_customer_id?: string | null;
  customer_id?: string | null;
  customerId?: string | null;
  provider?: string | null;
  payment_method?: string | null;
  notificationDisabled?: boolean | null;
  metadata?: {
    ownerName?: string | null;
    responsibleName?: string | null;
    cpfCnpj?: string | null;
    document?: string | null;
    asaas?: {
      customerId?: string | null;
      notificationDisabled?: boolean | null;
    } | null;
    billing?: {
      asaas?: {
        customerId?: string | null;
        notificationDisabled?: boolean | null;
      } | null;
    } | null;
  } | null;
  [key: string]: unknown;
}

export interface AsaasCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  mobilePhone?: string | null;
  externalReference?: string | null;
  [key: string]: unknown;
}

export interface AsaasPayment {
  id?: string | null;
  status?: string | null;
  subscription?: string | null;
  customer?: string | null;
  externalReference?: string | null;
  value?: number | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
  clientPaymentDate?: string | null;
  paymentDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  billingType?: string | null;
  [key: string]: unknown;
}

export interface AsaasPixChargeResult {
  customer: AsaasCustomer;
  subscription: null;
  payment: AsaasPayment;
  pixQrCode: AsaasPixQrCodePayload | null;
  pixData: AsaasPixData;
}

export interface AsaasCancelResult {
  canceled: boolean;
  subscriptionId: string;
}

export interface AsaasReactivateResult {
  restored: boolean;
  subscription: unknown;
}

export interface AsaasBillingPeriod {
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface AsaasCustomerPayload {
  name: string;
  cpfCnpj: string;
  mobilePhone: string;
  email?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

interface AsaasProviderContext {
  provider: 'asaas';
  statusCode: number | null;
  method: string | null;
  path: string | null;
  url: string | null;
  requestPayload: unknown;
  responseText: string;
  responseBody: unknown;
  responseJson: unknown;
  responseHeaders: unknown;
  responseErrors: Array<{ code?: string; description?: string; message?: string }>;
}

interface AsaasErrorContextOptions {
  method?: string | null;
  path?: string | null;
  requestPayload?: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_VALUES = PLAN_PRICES as Record<string, number>;

const GENERIC_CUSTOMER_NAMES = new Set([
  'equipe easyagenda',
  'equipe easy agenda',
  'easyagenda',
  'easy agenda',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseJsonSafely = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
};

const safeJSONStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
};

const maskDigitsTail = (value: unknown, visibleDigits = 4): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const digits = String(value).replace(/\D+/g, '');
  if (!digits) {
    return '***';
  }

  if (digits.length <= visibleDigits) {
    return digits;
  }

  return `${'*'.repeat(Math.max(0, digits.length - visibleDigits))}${digits.slice(-visibleDigits)}`;
};

const maskEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return (value as string | null) || null;
  }

  const normalized = value.trim();
  const atIndex = normalized.indexOf('@');

  if (atIndex <= 0) {
    return normalized;
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  if (!domain) {
    return `${local.slice(0, 1) || '*'}***`;
  }

  const maskedLocal = `${local.slice(0, 1) || '*'}***`;

  return `${maskedLocal}@${domain}`;
};

const maskSensitiveByKey = (key: string, value: unknown): unknown => {
  const normalizedKey = String(key || '').toLowerCase();

  if (normalizedKey.includes('email')) {
    return maskEmail(value);
  }

  if (
    normalizedKey.includes('cpf') ||
    normalizedKey.includes('cnpj') ||
    normalizedKey.includes('phone') ||
    normalizedKey.includes('whatsapp') ||
    normalizedKey.includes('mobile')
  ) {
    return maskDigitsTail(value);
  }

  return value;
};

const maskSensitiveData = (value: unknown, key = ''): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        maskSensitiveData(entryValue, entryKey),
      ])
    );
  }

  return maskSensitiveByKey(key, value);
};

const maskSensitiveText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return (value as string | null) || null;
  }

  const parsed = parseJsonSafely(value);
  if (parsed && typeof parsed === 'object') {
    return safeJSONStringify(maskSensitiveData(parsed));
  }

  const maskedEmails = value.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (email) => maskEmail(email) ?? email
  );

  return maskedEmails.replace(/\d{10,14}/g, (digits) => maskDigitsTail(digits) ?? digits);
};

const removeEmptyFields = (payload: Record<string, unknown> = {}): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(payload)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => {
        if (value === null || value === undefined) {
          return false;
        }

        if (typeof value === 'string') {
          return value.length > 0;
        }

        return true;
      })
  );
};

const extractAsaasErrors = (responseBody: unknown): Array<{ code?: string; description?: string; message?: string }> => {
  const body = responseBody as Record<string, unknown> | null;
  if (Array.isArray(body?.errors)) {
    return body.errors as Array<{ code?: string; description?: string; message?: string }>;
  }

  if (Array.isArray(body?.error)) {
    return body.error as Array<{ code?: string; description?: string; message?: string }>;
  }

  return [];
};

const hasInvalidAccessTokenError = (providerContext: Partial<AsaasProviderContext>, error: unknown = null): boolean => {
  const err = error as { code?: string } | null;
  if (String(err?.code || '').toUpperCase() === 'ASAAS_INVALID_ACCESS_TOKEN') {
    return true;
  }

  const responseErrors = Array.isArray(providerContext?.responseErrors)
    ? providerContext.responseErrors
    : [];

  return responseErrors.some(
    (item) => String(item?.code || '').toLowerCase() === 'invalid_access_token'
  );
};

const buildAsaasErrorContext = (
  error: unknown,
  { method = null, path = null, requestPayload = null }: AsaasErrorContextOptions = {}
): AsaasProviderContext => {
  const err = error as {
    details?: Record<string, unknown>;
    providerData?: Record<string, unknown>;
    response?: { data?: unknown };
    providerStatus?: number | null;
    statusCode?: number | null;
    code?: string;
    message?: string;
  } | null;

  const details = (err?.details || {}) as Record<string, unknown>;
  const providerData = (err?.providerData || null) as Record<string, unknown> | null;
  const responseTextFromProvider =
    typeof providerData?.responseText === 'string' ? providerData.responseText : null;
  const responseBodyRawFromProvider =
    typeof providerData?.responseBodyRaw === 'string' ? providerData.responseBodyRaw : null;
  const responseTextFromDetails =
    typeof details?.responseText === 'string' ? details.responseText : null;
  const responseBodyRawFromDetails =
    typeof details?.responseBodyRaw === 'string' ? details.responseBodyRaw : null;
  const responseTextFromResponseData =
    typeof err?.response?.data === 'string' ? err.response.data : null;
  const responseText =
    responseBodyRawFromProvider ||
    responseTextFromProvider ||
    responseBodyRawFromDetails ||
    responseTextFromDetails ||
    responseTextFromResponseData ||
    '';
  const responsePayloadFromString = parseJsonSafely(responseText);
  const responseBody =
    providerData?.payload ||
    err?.response?.data ||
    details?.payload ||
    responsePayloadFromString ||
    (responseText ? { rawBody: responseText } : null);
  const responseJson =
    providerData?.responseJson ||
    details?.responseJson ||
    (responseBody && typeof responseBody === 'object' && !Object.prototype.hasOwnProperty.call(responseBody, 'rawBody')
      ? responseBody
      : responsePayloadFromString) ||
    null;
  const responseBodyRaw =
    responseText ||
    (responseJson ? safeJSONStringify(responseJson) : '');
  const responseHeaders =
    providerData?.responseHeaders ||
    (err?.response as Record<string, unknown>)?.headers ||
    details?.responseHeaders ||
    null;
  const parsedRequestBody = parseJsonSafely(details?.requestBody as string);
  const resolvedRequestPayload =
    requestPayload ||
    providerData?.requestPayload ||
    parsedRequestBody ||
    details?.requestBody ||
    null;

  return {
    provider: 'asaas',
    statusCode:
      err?.providerStatus ||
      (err?.response as { status?: number } | null)?.status ||
      (details?.statusCode as number | null) ||
      err?.statusCode ||
      null,
    method: (providerData?.method || details?.method || method) as string | null,
    path: (providerData?.path || details?.path || path) as string | null,
    url: (providerData?.url || details?.url || null) as string | null,
    requestPayload: resolvedRequestPayload,
    responseText: responseBodyRaw ?? '',
    responseBody,
    responseJson,
    responseHeaders,
    responseErrors: providerData?.errors
      ? (providerData.errors as Array<{ code?: string; description?: string; message?: string }>)
      : extractAsaasErrors(responseJson || responseBody),
  };
};

const onlyNumbers = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const digits = String(value).replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
};

const normalizeBrazilPhone = (value: unknown): string | null => {
  const digits = onlyNumbers(value);

  if (!digits) {
    return null;
  }

  const nationalDigits =
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  return nationalDigits.length === 10 || nationalDigits.length === 11
    ? nationalDigits
    : null;
};

const isValidCpf = (value: unknown): boolean => {
  const digits = onlyNumbers(value);
  return digits ? validateCpf(digits) : false;
};

const isValidCnpj = (value: unknown): boolean => {
  const digits = onlyNumbers(value);
  return digits ? validateCnpj(digits) : false;
};

const isValidCpfCnpj = (value: unknown): boolean => {
  const digits = onlyNumbers(value);
  return digits ? validateCpfCnpj(digits) : false;
};

const resolvePlanValue = (plan: unknown): number => {
  const normalizedPlan = typeof plan === 'string' ? plan.trim().toLowerCase() : '';

  if (!(normalizedPlan in PLAN_VALUES)) {
    throw new AppError('Plano inválido para cobrança Pix', 400, 'INVALID_PLAN');
  }

  return PLAN_VALUES[normalizedPlan]!;
};

const addDays = (referenceDate: Date, days: number): Date => {
  const date = new Date(referenceDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const toAsaasDate = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(value as string);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Data inválida para cobrança no Asaas', 400, 'INVALID_BILLING_DATE');
  }

  return date.toISOString().slice(0, 10);
};

const resolveServerDateYYYYMMDD = (referenceDate: Date = new Date()): string =>
  referenceDate.toISOString().slice(0, 10);

const resolvePixDueDate = (value: unknown, referenceDate: Date = new Date()): string => {
  const today = resolveServerDateYYYYMMDD(referenceDate);
  const candidate = value ? toAsaasDate(value) : toAsaasDate(addDays(referenceDate, 1));

  return candidate < today ? today : candidate;
};

const normalizeCurrencyAmount = (value: unknown): number => {
  const amount = Number(Number(value).toFixed(2));

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Valor inválido para cobrança Pix no Asaas', 400, 'INVALID_PIX_AMOUNT');
  }

  return amount;
};

const maskApiKey = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length <= 10) {
    return '***';
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
};

const buildAsaasHeadersLog = (): Record<string, unknown> => ({
  accept: 'application/json',
  'content-type': 'application/json',
  'user-agent': 'EasyAgenda/1.0',
  access_token: maskApiKey(normalizeAsaasApiKey(process.env.ASAAS_API_KEY)),
});

const buildFieldTypes = (payload: Record<string, unknown> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, typeof value])
  );

interface MinimalPixPaymentPayload {
  customer: string;
  billingType: 'PIX';
  value: number;
  dueDate: string;
}

const buildMinimalPixPaymentPayload = ({
  customerId,
  amount,
  dueDate,
  externalReference,
}: {
  customerId: string;
  amount: number;
  dueDate?: unknown;
  externalReference?: string | null;
}): Record<string, unknown> => {
  const customer = typeof customerId === 'string' ? customerId.trim() : String(customerId || '').trim();

  if (!/^cus_[A-Za-z0-9_]+$/.test(customer)) {
    throw new AppError('Customer Asaas inválido para cobrança Pix', 400, 'INVALID_ASAAS_CUSTOMER');
  }

  const payload: MinimalPixPaymentPayload & { externalReference?: string } = {
    customer,
    billingType: 'PIX',
    value: normalizeCurrencyAmount(amount),
    dueDate: resolvePixDueDate(dueDate),
    ...(externalReference ? { externalReference } : {}),
  };

  return removeAsaasEmptyFields(payload as unknown as Record<string, unknown>) as Record<string, unknown>;
};

const resolveBillingDescription = ({ plan, businessName }: { plan: string; businessName?: string | null }): string => {
  const template =
    process.env.ASAAS_BILLING_DESCRIPTION ||
    'EasyAgenda+ - Plano {plan} ({business})';

  return template
    .replaceAll('{plan}', plan)
    .replaceAll('{business}', businessName || 'Negócio')
    .slice(0, 500);
};

const buildExternalReference = ({ businessId, plan }: { businessId: string; plan: string }): string => {
  return `business:${businessId}:plan:${plan}`;
};

const parseAsaasDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value as string);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof value === 'string' && dateOnlyRegex.test(value)) {
    const parsedDateOnly = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsedDateOnly.getTime()) ? null : parsedDateOnly;
  }

  return null;
};

const addMonths = (value: unknown, months = 1): Date | null => {
  const date = value instanceof Date ? new Date(value) : parseAsaasDate(value);
  if (!date) {
    return null;
  }

  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
};

const findCustomerByCpfCnpj = async (cpfCnpj: string): Promise<AsaasCustomer | null> => {
  if (!cpfCnpj) {
    return null;
  }

  const response = await asaasClient.get('/customers', {
    query: {
      cpfCnpj,
      limit: 1,
      offset: 0,
    },
  }) as { data?: AsaasCustomer[] } | null;

  return response?.data?.[0] || null;
};

const resolvePixQrCode = async (paymentId: string): Promise<AsaasPixQrCodePayload | null> => {
  try {
    return await asaasClient.get(`/payments/${paymentId}/pixQrCode`) as AsaasPixQrCodePayload;
  } catch {
    return null;
  }
};

const resolveCustomerNameCandidates = (business: AsaasBusinessInput): string[] => {
  return [
    business?.owner_name,
    business?.ownerName,
    business?.responsible_name,
    business?.responsibleName,
    business?.metadata?.ownerName,
    business?.metadata?.responsibleName,
    business?.name,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean) as string[];
};

const isGenericCustomerName = (value: string): boolean => {
  const normalized = normalizeText(value).toLowerCase();
  return GENERIC_CUSTOMER_NAMES.has(normalized);
};

const resolveCustomerName = (business: AsaasBusinessInput): string | null => {
  const candidates = resolveCustomerNameCandidates(business);
  if (candidates.length === 0) {
    return null;
  }

  const withGivenAndFamilyName = candidates.find(
    (value) =>
      !isGenericCustomerName(value) &&
      value.split(/\s+/).filter(Boolean).length >= 2
  );
  const nonGeneric =
    withGivenAndFamilyName || candidates.find((value) => !isGenericCustomerName(value));
  const resolved = nonGeneric || candidates[0] || null;

  if (!resolved) return null;
  return resolved.length >= 3 ? resolved : null;
};

const isValidPublicEmail = (email: unknown): boolean => {
  if (typeof email !== 'string') {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicEmailRegex.test(normalizedEmail)) {
    return false;
  }

  const [, domain = ''] = normalizedEmail.split('@');
  if (!domain || domain.endsWith('.local')) {
    return false;
  }

  if (/^example(\.|-)/i.test(domain) || domain === 'example') {
    return false;
  }

  return true;
};

const resolveCustomerEmail = (business: AsaasBusinessInput): string | null => {
  const candidate = typeof business?.email === 'string' ? business.email.trim() : '';
  return isValidPublicEmail(candidate) ? candidate.toLowerCase() : null;
};

const resolveCustomerExternalReference = (business: AsaasBusinessInput): string | null => {
  const candidates = [
    business?.id,
    business?.tenantId,
    business?.tenant_id,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveSavedAsaasCustomerId = (business: AsaasBusinessInput): string | null => {
  const normalizedProvider = String(business?.provider || '').trim().toLowerCase();
  const normalizedPaymentMethod = String(business?.payment_method || '').trim().toLowerCase();
  const canTrustProviderCustomerId =
    normalizedProvider === 'asaas' || normalizedPaymentMethod === 'pix';

  const candidates = [
    business?.asaas_customer_id,
    business?.asaasCustomerId,
    canTrustProviderCustomerId ? business?.provider_customer_id : null,
    business?.customer_id,
    business?.customerId,
    business?.metadata?.asaas?.customerId,
    business?.metadata?.billing?.asaas?.customerId,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveCustomerCpfCnpjInput = (business: AsaasBusinessInput): string | null => {
  const candidates = [
    business?.cpf_cnpj,
    business?.cpfCnpj,
    business?.document,
    business?.documentNumber,
    business?.metadata?.cpfCnpj,
    business?.metadata?.document,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDocumentDigits(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const validateCustomerCpfCnpjOrThrow = (cpfCnpj: string | null): void => {
  if (!cpfCnpj) {
    throw new AppError(
      'CPF/CNPJ obrigatório para pagamento via Pix.',
      400,
      'CPF_CNPJ_REQUIRED'
    );
  }

  const length = cpfCnpj.length;
  if (length !== 11 && length !== 14) {
    throw new AppError(
      'CPF/CNPJ inválido. Verifique os dados cadastrais.',
      400,
      'INVALID_CPF_CNPJ'
    );
  }

  if (!isValidCpfCnpj(cpfCnpj)) {
    throw new AppError(
      'CPF/CNPJ inválido. Verifique os dados cadastrais.',
      400,
      'INVALID_CPF_CNPJ'
    );
  }
};

const buildCustomerPayload = (business: AsaasBusinessInput): AsaasCustomerPayload => {
  const name = resolveCustomerName(business);
  const email = resolveCustomerEmail(business);
  const mobilePhone = normalizeBrazilPhone(
    business?.whatsapp || business?.phone || business?.mobile_phone
  );
  const cpfCnpj = resolveCustomerCpfCnpjInput(business);
  const externalReference = resolveCustomerExternalReference(business);
  const notificationDisabledCandidates = [
    business?.notificationDisabled,
    business?.metadata?.asaas?.notificationDisabled,
    business?.metadata?.billing?.asaas?.notificationDisabled,
  ];
  const notificationDisabled = notificationDisabledCandidates.find(
    (value) => typeof value === 'boolean'
  );

  if (!name) {
    throw new AppError(
      'Nome é obrigatório para pagamento via Pix.',
      400,
      'CUSTOMER_NAME_REQUIRED'
    );
  }

  if (name.length < 3) {
    throw new AppError(
      'Nome é obrigatório para pagamento via Pix.',
      400,
      'CUSTOMER_NAME_REQUIRED'
    );
  }

  validateCustomerCpfCnpjOrThrow(cpfCnpj);

  if (!mobilePhone) {
    throw new AppError(
      'Telefone/WhatsApp inválido. Verifique os dados cadastrais.',
      400,
      'MOBILE_PHONE_INVALID'
    );
  }

  return removeEmptyFields({
    name,
    cpfCnpj: cpfCnpj!,
    mobilePhone,
    ...(email ? { email } : {}),
    ...(externalReference ? { externalReference } : {}),
    ...(typeof notificationDisabled === 'boolean'
      ? { notificationDisabled }
      : {}),
  }) as unknown as AsaasCustomerPayload;
};

const rethrowAsaasError = (
  error: unknown,
  fallbackMessage: string,
  fallbackCode = 'ASAAS_REQUEST_ERROR',
  contextOptions: AsaasErrorContextOptions = {}
): never => {
  const providerContext = buildAsaasErrorContext(error, contextOptions);
  if (hasInvalidAccessTokenError(providerContext, error)) {
    const appError = new AppError(
      'Configuração Asaas inválida. Verifique ASAAS_API_KEY no Render.',
      503,
      'ASAAS_INVALID_ACCESS_TOKEN'
    ) as AppError & {
      providerStatus?: number | null;
      providerData?: unknown;
      providerHeaders?: unknown;
    };
    appError.providerStatus = providerContext.statusCode || null;
    appError.providerData = {
      provider: providerContext.provider,
      method: providerContext.method || contextOptions.method || null,
      path: providerContext.path || contextOptions.path || null,
      url: providerContext.url || null,
      statusCode: providerContext.statusCode || null,
      requestBody: maskSensitiveData(providerContext.requestPayload),
      payload: maskSensitiveData(providerContext.responseBody),
      responseBodyRaw: maskSensitiveText(providerContext.responseText),
      responseJson: maskSensitiveData(providerContext.responseJson),
      errors: maskSensitiveData(providerContext.responseErrors),
      responseHeaders: providerContext.responseHeaders || null,
    };
    appError.providerHeaders = providerContext.responseHeaders || null;
    throw appError;
  }

  const responseData =
    providerContext.responseBody ||
    (providerContext.responseText ? { rawBody: providerContext.responseText } : null);
  const responseHeaders = providerContext.responseHeaders || null;
  const responseErrors = providerContext.responseErrors || [];
  const asaasMessage =
    responseErrors.map((item) => item?.description || item?.message).filter(Boolean).join(' | ') ||
    (typeof responseData === 'string' ? responseData : null) ||
    (responseData as { message?: string } | null)?.message ||
    (error as { message?: string } | null)?.message ||
    fallbackMessage;

  const appError = new AppError(
    asaasMessage || fallbackMessage,
    providerContext.statusCode || 502,
    fallbackCode
  ) as AppError & {
    providerStatus?: number | null;
    providerData?: unknown;
    providerHeaders?: unknown;
  };

  appError.details = maskSensitiveData(responseData) || null;
  appError.providerStatus = providerContext.statusCode || null;
  appError.providerData = {
    provider: providerContext.provider,
    method: providerContext.method || contextOptions.method || null,
    path: providerContext.path || contextOptions.path || null,
    url: providerContext.url || null,
    statusCode: providerContext.statusCode || null,
    requestBody: maskSensitiveData(providerContext.requestPayload),
    requestPayload: maskSensitiveData(providerContext.requestPayload),
    payload: maskSensitiveData(responseData),
    responseBodyRaw: maskSensitiveText(providerContext.responseText),
    responseText: maskSensitiveText(providerContext.responseText),
    responseJson: maskSensitiveData(providerContext.responseJson),
    errors: maskSensitiveData(responseErrors),
    responseHeaders: providerContext.responseHeaders || null,
  };
  appError.providerHeaders = responseHeaders || null;
  throw appError;
};

// ---------------------------------------------------------------------------
// Exported service
// ---------------------------------------------------------------------------

export const asaasService = {
  onlyNumbers,
  normalizeBrazilPhone,
  isValidCpf,
  isValidCnpj,
  isValidPublicEmail,
  isValidCpfCnpj,
  resolvePlanValue,

  async getOrCreateAsaasCustomer({
    business,
    idempotencyKey = null,
    onCustomerResolved = null,
  }: {
    business: AsaasBusinessInput;
    idempotencyKey?: string | null;
    onCustomerResolved?: ((customerId: string, meta?: unknown) => Promise<void> | void) | null;
  }): Promise<AsaasCustomer> {
    if (!business?.id) {
      throw new AppError(
        'Negócio inválido para criação de cliente Asaas',
        400,
        'INVALID_BUSINESS'
      );
    }

    const persistResolvedCustomer = async (customerId: string | null | undefined, source: string): Promise<void> => {
      if (!customerId || typeof onCustomerResolved !== 'function') {
        return;
      }

      try {
        await onCustomerResolved(customerId, {
          source,
          businessId: business.id,
        });
      } catch (persistError) {
        const err = persistError as { message?: string } | null;
        logger.warn(
          {
            event: 'asaas_customer_persist_warning',
            businessId: business.id,
            source,
            customerId,
            message: err?.message,
          },
          'Falha ao persistir customer Asaas localmente'
        );
      }
    };

    logger.info(
      {
        event: 'asaas_customer_lookup_db_start',
        businessId: business.id,
      },
      'Buscando customer Asaas salvo no banco'
    );

    const savedCustomerId = resolveSavedAsaasCustomerId(business);

    if (savedCustomerId) {
      logger.info(
        {
          event: 'asaas_customer_reuse_from_db',
          businessId: business.id,
          customerId: savedCustomerId,
        },
        'Customer Asaas reutilizado a partir do banco'
      );

      await persistResolvedCustomer(savedCustomerId, 'db');

      return {
        id: savedCustomerId,
      };
    }

    const payload = buildCustomerPayload(business);

    logger.info(
      {
        event: 'asaas_customer_payload_prepared',
        businessId: business.id,
        payload: maskSensitiveData(payload),
      },
      'Payload de cliente Asaas preparado'
    );

    logger.info(
      {
        event: 'asaas_customer_lookup_asaas_start',
        businessId: business.id,
        cpfCnpj: maskDigitsTail(payload.cpfCnpj),
      },
      'Buscando customer Asaas por CPF/CNPJ antes de criar'
    );

    if (payload.cpfCnpj) {
      try {
        const existingByDocument = await findCustomerByCpfCnpj(payload.cpfCnpj);
        if (existingByDocument?.id) {
          await persistResolvedCustomer(existingByDocument.id, 'asaas_lookup_before_create');

          logger.info(
            {
              event: 'asaas_customer_reuse_from_asaas_by_cpfcnpj',
              businessId: business.id,
              customerId: existingByDocument.id,
            },
            'Customer Asaas localizado por CPF/CNPJ'
          );

          return existingByDocument;
        }
      } catch (lookupError) {
        const err = lookupError as { message?: string } | null;
        logger.warn(
          {
            event: 'asaas_customer_lookup_warning',
            source: 'cpf_cnpj',
            businessId: business.id,
            message: err?.message,
            cpfCnpj: maskDigitsTail(payload.cpfCnpj),
          },
          'Falha ao buscar cliente Asaas por CPF/CNPJ'
        );
      }
    }

    logger.info(
      {
        event: 'asaas_customer_create_start',
        businessId: business.id,
        method: 'POST',
        path: '/customers',
        payload: maskSensitiveData(payload),
      },
      'Iniciando criacao de cliente Asaas'
    );

    try {
      const createdCustomer = await asaasClient.post('/customers', payload as unknown as Record<string, unknown>) as AsaasCustomer;

      logger.info(
        {
          event: 'asaas_customer_create_success',
          businessId: business.id,
          customerId: createdCustomer?.id || null,
          externalReference: payload.externalReference || null,
        },
        'Cliente Asaas criado com sucesso'
      );

      await persistResolvedCustomer(createdCustomer?.id || null, 'asaas_create_success');

      return createdCustomer;
    } catch (error) {
      const providerContext = buildAsaasErrorContext(error, {
        method: 'POST',
        path: '/customers',
        requestPayload: payload,
      });

      if (hasInvalidAccessTokenError(providerContext, error)) {
        rethrowAsaasError(
          error,
          'Configuração Asaas inválida. Verifique ASAAS_API_KEY no Render.',
          'ASAAS_INVALID_ACCESS_TOKEN',
          {
            method: 'POST',
            path: '/customers',
            requestPayload: payload,
          }
        );
      }

      logger.error(
        {
          event: 'asaas_customer_create_error',
          businessId: business.id,
          message: (error as { message?: string } | null)?.message,
          provider: providerContext.provider,
          statusCode: providerContext.statusCode,
          method: providerContext.method,
          path: providerContext.path,
          url: providerContext.url,
          requestBody: maskSensitiveData(providerContext.requestPayload),
          requestPayload: maskSensitiveData(providerContext.requestPayload),
          responseBodyRaw: maskSensitiveText(providerContext.responseText),
          responseJson: maskSensitiveData(providerContext.responseJson),
          responseBody: maskSensitiveData(providerContext.responseBody),
          responseErrors: maskSensitiveData(providerContext.responseErrors),
          providerHeaders: providerContext.responseHeaders,
          code: (error as { code?: string } | null)?.code || 'ASAAS_CUSTOMER_CREATE_ERROR',
        },
        'Falha ao criar cliente Asaas'
      );

      if (Number(providerContext.statusCode) === 400) {
        logger.info(
          {
            event: 'asaas_customer_lookup_after_create_error_start',
            businessId: business.id,
            cpfCnpj: maskDigitsTail(payload.cpfCnpj),
          },
          'Iniciando fallback de lookup de customer apos erro 400 no create'
        );

        try {
          const recoveredCustomer = await findCustomerByCpfCnpj(payload.cpfCnpj);

          if (recoveredCustomer?.id) {
            await persistResolvedCustomer(recoveredCustomer.id, 'asaas_lookup_after_create_error');

            logger.info(
              {
                event: 'asaas_customer_recovered_after_create_error',
                businessId: business.id,
                customerId: recoveredCustomer.id,
              },
              'Customer Asaas recuperado apos falha no create'
            );

            return recoveredCustomer;
          }
        } catch (lookupAfterCreateError) {
          const err = lookupAfterCreateError as { message?: string } | null;
          logger.warn(
            {
              event: 'asaas_customer_lookup_warning',
              source: 'lookup_after_create_error',
              businessId: business.id,
              message: err?.message,
              cpfCnpj: maskDigitsTail(payload.cpfCnpj),
            },
            'Falha ao buscar customer Asaas apos erro no create'
          );
        }

        logger.error(
          {
            event: 'asaas_customer_failed_after_fallback',
            businessId: business.id,
            provider: providerContext.provider,
            statusCode: providerContext.statusCode,
            method: providerContext.method,
            path: providerContext.path,
            url: providerContext.url,
            requestBody: maskSensitiveData(providerContext.requestPayload),
            responseBodyRaw: maskSensitiveText(providerContext.responseText),
            responseJson: maskSensitiveData(providerContext.responseJson),
            responseErrors: maskSensitiveData(providerContext.responseErrors),
          },
          'Falha definitiva ao resolver customer Asaas apos fallback'
        );

        const controlledError = new AppError(
          'Não foi possível criar o cliente no Asaas. Verifique os dados cadastrais e tente novamente.',
          400,
          'ASAAS_CUSTOMER_CREATE_ERROR'
        ) as AppError & {
          providerStatus?: number | null;
          providerData?: unknown;
          providerHeaders?: unknown;
        };
        controlledError.providerStatus = providerContext.statusCode || 400;
        controlledError.providerData = {
          provider: providerContext.provider,
          method: providerContext.method,
          path: providerContext.path,
          url: providerContext.url,
          statusCode: providerContext.statusCode || 400,
          requestBody: maskSensitiveData(providerContext.requestPayload),
          payload: maskSensitiveData(providerContext.responseBody),
          responseBodyRaw: maskSensitiveText(providerContext.responseText),
          responseJson: maskSensitiveData(providerContext.responseJson),
          errors: maskSensitiveData(providerContext.responseErrors),
          responseHeaders: providerContext.responseHeaders || null,
        };
        controlledError.providerHeaders = providerContext.responseHeaders || null;

        throw controlledError;
      }

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /customers)',
        'ASAAS_CUSTOMER_CREATE_ERROR',
        {
          method: 'POST',
          path: '/customers',
          requestPayload: payload,
        }
      );
      throw new Error('unreachable');
    }
  },

  async createOrGetCustomer({
    business,
    idempotencyKey = null,
    onCustomerResolved = null,
  }: {
    business: AsaasBusinessInput;
    idempotencyKey?: string | null;
    onCustomerResolved?: ((customerId: string, meta?: unknown) => Promise<void> | void) | null;
  }): Promise<AsaasCustomer> {
    return this.getOrCreateAsaasCustomer({
      business,
      idempotencyKey,
      onCustomerResolved,
    });
  },

  async createPixCharge({
    customerId,
    businessId,
    plan,
    amount,
    dueDate,
    idempotencyKey = null,
    description,
    externalReference,
  }: {
    customerId: string;
    businessId: string;
    plan: string;
    amount?: number | null;
    dueDate?: unknown;
    idempotencyKey?: string | null;
    description?: string | null;
    externalReference?: string | null;
  }): Promise<AsaasPayment> {
    const resolvedAmount = typeof amount === 'number' ? amount : resolvePlanValue(plan);
    const payload = buildMinimalPixPaymentPayload({
      customerId,
      amount: resolvedAmount,
      dueDate,
      externalReference: externalReference ?? null,
    });
    const fieldTypes = buildFieldTypes(payload);
    const serverCurrentDate = new Date();

    logger.info(
      {
        event: 'asaas_pix_payment_create_start',
        businessId,
        method: 'POST',
        path: '/payments',
        endpoint: '/payments',
        payload,
        fieldTypes,
        serverCurrentDate: serverCurrentDate.toISOString(),
        serverDateYYYYMMDD: resolveServerDateYYYYMMDD(serverCurrentDate),
        dueDate: payload.dueDate,
        headers: buildAsaasHeadersLog(),
      },
      'Iniciando criacao de cobranca Pix minima no Asaas'
    );

    try {
      const createdPayment = await asaasClient.post('/payments', payload) as AsaasPayment;

      logger.info(
        {
          event: 'asaas_pix_payment_create_success',
          businessId,
          paymentId: createdPayment?.id || null,
          status: createdPayment?.status || null,
        },
        'Cobranca Pix criada no Asaas'
      );

      return createdPayment;
    } catch (error) {
      const providerContext = buildAsaasErrorContext(error, {
        method: 'POST',
        path: '/payments',
        requestPayload: payload,
      });

      logger.error(
        {
          message: (error as { message?: string } | null)?.message,
          provider: providerContext.provider,
          statusCode: providerContext.statusCode,
          method: providerContext.method,
          path: providerContext.path,
          url: providerContext.url,
          requestBody: maskSensitiveData(providerContext.requestPayload),
          requestPayload: maskSensitiveData(providerContext.requestPayload),
          responseBodyRaw: maskSensitiveText(providerContext.responseText),
          responseJson: maskSensitiveData(providerContext.responseJson),
          responseBody: maskSensitiveData(providerContext.responseBody),
          responseErrors: maskSensitiveData(providerContext.responseErrors),
          providerHeaders: providerContext.responseHeaders,
          code: (error as { code?: string } | null)?.code || 'ASAAS_PIX_PAYMENT_CREATE_ERROR',
        },
        'ASAAS PAYMENT ERROR'
      );

      rethrowAsaasError(
        error,
        'Erro Asaas (POST /payments)',
        'ASAAS_PIX_PAYMENT_CREATE_ERROR',
        {
          method: 'POST',
          path: '/payments',
          requestPayload: payload,
        }
      );
      throw new Error('unreachable');
    }
  },

  async createPixSubscription({
    business,
    plan,
    nextDueDate,
    amount,
    idempotencyKey = null,
    onCustomerResolved = null,
  }: {
    business: AsaasBusinessInput;
    plan: string;
    nextDueDate?: unknown;
    amount?: number | null;
    idempotencyKey?: string | null;
    onCustomerResolved?: ((customerId: string, meta?: unknown) => Promise<void> | void) | null;
  }): Promise<AsaasPixChargeResult> {
    const payerCpfCnpj = resolveCustomerCpfCnpjInput(business);

    validateCustomerCpfCnpjOrThrow(payerCpfCnpj);

    const customer = await this.getOrCreateAsaasCustomer({
      business,
      idempotencyKey,
      onCustomerResolved,
    });

    const resolvedAmount = typeof amount === 'number' ? amount : resolvePlanValue(plan);
    const resolvedDueDate = resolvePixDueDate(nextDueDate || addDays(new Date(), 1));
    const payment = await this.createPixCharge({
      customerId: customer.id,
      businessId: business.id!,
      plan,
      amount: resolvedAmount,
      dueDate: resolvedDueDate,
      idempotencyKey,
      externalReference: buildExternalReference({ businessId: business.id!, plan }),
    });

    const pixQrCode = payment?.id ? await resolvePixQrCode(payment.id) : null;
    const pixData = asaasMapper.mapAsaasPaymentToPixData(payment as AsaasWebhookPayment, pixQrCode);

    return {
      customer,
      subscription: null,
      payment,
      pixQrCode,
      pixData,
    };
  },

  async getPayment(paymentId: string): Promise<AsaasPayment> {
    if (!paymentId) {
      throw new AppError('paymentId é obrigatório', 400, 'INVALID_PAYMENT');
    }

    try {
      return await asaasClient.get(`/payments/${paymentId}`) as AsaasPayment;
    } catch (error) {
      const err = error as {
        message?: string;
        statusCode?: number;
        status?: number;
        response?: { status?: number; data?: unknown; headers?: unknown };
        details?: unknown;
        code?: string;
      } | null;

      logger.error(
        {
          message: err?.message,
          statusCode: err?.statusCode || err?.status || null,
          providerStatus: err?.response?.status || err?.statusCode || err?.status || null,
          providerData: err?.response?.data || err?.details || null,
          providerHeaders: err?.response?.headers || (err?.details as { responseHeaders?: unknown } | null)?.responseHeaders || null,
          code: err?.code || 'ASAAS_PAYMENT_FETCH_ERROR',
          details: err?.details || null,
          paymentId,
        },
        'ASAAS GET PAYMENT ERROR'
      );

      rethrowAsaasError(
        error,
        'Erro Asaas (GET /payments/:id)',
        'ASAAS_PAYMENT_FETCH_ERROR'
      );
      throw new Error('unreachable');
    }
  },

  async getPaymentWithPixData(paymentId: string): Promise<{
    payment: AsaasPayment;
    pixQrCode: AsaasPixQrCodePayload | null;
    pixData: AsaasPixData;
  }> {
    const payment = await this.getPayment(paymentId);
    const pixQrCode = await resolvePixQrCode(paymentId);
    const pixData = asaasMapper.mapAsaasPaymentToPixData(payment as AsaasWebhookPayment, pixQrCode);

    return {
      payment,
      pixQrCode,
      pixData,
    };
  },

  async cancelSubscription(subscriptionId: string): Promise<AsaasCancelResult> {
    if (!subscriptionId) {
      throw new AppError('subscriptionId é obrigatório', 400, 'INVALID_SUBSCRIPTION');
    }

    try {
      await asaasClient.delete(`/subscriptions/${subscriptionId}`);
    } catch (error) {
      const err = error as {
        message?: string;
        statusCode?: number;
        status?: number;
        response?: { status?: number; data?: unknown; headers?: unknown };
        details?: unknown;
        code?: string;
      } | null;

      logger.error(
        {
          message: err?.message,
          statusCode: err?.statusCode || err?.status || null,
          providerStatus: err?.response?.status || err?.statusCode || err?.status || null,
          providerData: err?.response?.data || err?.details || null,
          providerHeaders: err?.response?.headers || (err?.details as { responseHeaders?: unknown } | null)?.responseHeaders || null,
          code: err?.code || 'ASAAS_SUBSCRIPTION_CANCEL_ERROR',
          details: err?.details || null,
          subscriptionId,
        },
        'ASAAS CANCEL SUBSCRIPTION ERROR'
      );

      rethrowAsaasError(
        error,
        'Erro Asaas (DELETE /subscriptions/:id)',
        'ASAAS_SUBSCRIPTION_CANCEL_ERROR'
      );
    }

    return {
      canceled: true,
      subscriptionId,
    };
  },

  async reactivateSubscription(subscriptionId: string): Promise<AsaasReactivateResult> {
    if (!subscriptionId) {
      throw new AppError('subscriptionId é obrigatório', 400, 'INVALID_SUBSCRIPTION');
    }

    try {
      const restored = await asaasClient.post(
        `/subscriptions/${subscriptionId}/restore`,
        {},
        {
          idempotencyKey: `restore:${subscriptionId}`,
        }
      );

      return {
        restored: true,
        subscription: restored,
      };
    } catch (error) {
      const err = error as {
        message?: string;
        statusCode?: number;
        status?: number;
        response?: { status?: number; data?: unknown; headers?: unknown };
        details?: unknown;
        code?: string;
      } | null;

      logger.error(
        {
          message: err?.message,
          statusCode: err?.statusCode || err?.status || null,
          providerStatus: err?.response?.status || err?.statusCode || err?.status || null,
          providerData: err?.response?.data || err?.details || null,
          providerHeaders: err?.response?.headers || (err?.details as { responseHeaders?: unknown } | null)?.responseHeaders || null,
          code: err?.code || 'ASAAS_REACTIVATE_UNAVAILABLE',
          details: err?.details || null,
          subscriptionId,
        },
        'ASAAS REACTIVATE SUBSCRIPTION ERROR'
      );

      throw new AppError(
        'Não foi possível reativar a assinatura Pix no Asaas automaticamente',
        409,
        'ASAAS_REACTIVATE_UNAVAILABLE'
      );
    }
  },

  resolveBillingPeriodFromPayment(payment: AsaasWebhookPayment | null | undefined): AsaasBillingPeriod {
    const paidAt = parseAsaasDate(
      payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
    );

    if (!paidAt) {
      return {
        periodStart: null,
        periodEnd: null,
      };
    }

    return {
      periodStart: paidAt,
      periodEnd: addMonths(paidAt, 1),
    };
  },
};
