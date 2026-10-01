import { businessSettingsRepository } from '../../repositories/businessSettingsRepository.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

const INSTANCE_PREFIX = 'easyagenda';
const INSTANCE_MAX_LENGTH = 80;
const INSTANCE_SUFFIX_LENGTH = 8;

export const normalizeWhatsAppInstanceName = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .trim();

  return normalized || null;
};

const sanitizeInstanceToken = (value: string | null | undefined, fallback: string = INSTANCE_PREFIX): string =>
  normalizeWhatsAppInstanceName(value) || fallback;

const buildBusinessSuffix = (businessId: string | number | null | undefined): string => {
  const compactId = String(businessId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (!compactId) {
    return 'tenant';
  }

  return compactId.slice(-INSTANCE_SUFFIX_LENGTH);
};

export const buildDeterministicWhatsAppInstanceName = ({
  businessId,
  shopName,
}: {
  businessId: string | number | null | undefined;
  shopName: string | null | undefined;
}): string => {
  const suffix = buildBusinessSuffix(businessId);
  const baseSlug = sanitizeInstanceToken(shopName, INSTANCE_PREFIX);
  const fixedSuffixLength = suffix.length + 1;
  const maxBaseLength = Math.max(12, INSTANCE_MAX_LENGTH - fixedSuffixLength);
  const truncatedBase = baseSlug.slice(0, maxBaseLength).replace(/[-_.]+$/g, '') || INSTANCE_PREFIX;

  return `${truncatedBase}_${suffix}`;
};

interface WhatsAppInstanceContext {
  whatsappInstanceName: string | null;
  active: boolean;
  [key: string]: unknown;
}

export const getBusinessWhatsAppInstanceContext = async (
  businessId: string,
): Promise<WhatsAppInstanceContext> => {
  const context = await businessSettingsRepository.findWhatsAppInstanceContextByBusinessId(businessId);

  if (!context || context.active !== true) {
    throw new NotFoundError('Negócio');
  }

  return {
    ...context,
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName as string | null),
  } as WhatsAppInstanceContext;
};

export const ensureBusinessWhatsAppInstanceName = async (
  businessId: string,
): Promise<WhatsAppInstanceContext> => {
  let context: WhatsAppInstanceContext;

  try {
    context = await businessSettingsRepository.ensureWhatsAppInstanceName(
      businessId,
      ({ id, name }: { id: unknown; name: unknown }) => buildDeterministicWhatsAppInstanceName({
        businessId: id as string,
        shopName: name as string,
      })
    ) as WhatsAppInstanceContext;
  } catch (error) {
    const err = error as Record<string, unknown>;
    const uniqueViolation = err?.code === '23505';
    const constraint = String(err?.constraint || '').trim();

    if (uniqueViolation && constraint === 'uq_businesses_whatsapp_instance_name_norm') {
      throw new ValidationError(
        'Não foi possível reservar a instância WhatsApp',
        ['Já existe outro negócio usando o identificador gerado. Tente novamente.']
      );
    }

    throw error;
  }

  if (!context || context.active !== true) {
    throw new NotFoundError('Negócio');
  }

  return {
    ...context,
    whatsappInstanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName as string | null),
  } as WhatsAppInstanceContext;
};
