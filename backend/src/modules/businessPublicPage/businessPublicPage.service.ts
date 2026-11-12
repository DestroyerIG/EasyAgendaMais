import { AppError, ConflictError, ValidationError } from '../../utils/errors.js';
import { getSupabaseAdminClient } from '../../services/supabaseAuthService.js';
import { businessPublicPageRepository } from './businessPublicPage.repository.js';
import type { PublicPageSettings, UpdatePublicPageInput, UploadImageInput } from './businessPublicPage.types.js';

// Mesmo bucket já usado por ServiceProfessionalModal (frontend) para fotos de
// profissional. O upload passa por aqui (admin/service-role, ignora RLS) porque o
// cliente Supabase do navegador nunca tem uma sessão autenticada própria — o login
// do app é por cookie/JWT nosso, não pelo SDK do Supabase — então um upload direto
// do navegador sempre falha com "row-level security policy".
const IMAGE_BUCKET = 'professional-photos';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const EXTENSION_BY_CONTENT_TYPE: Record<UploadImageInput['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const isValidSlug = (value: string): boolean => /^[a-z0-9-]+$/.test(value) && value.length >= 3;

export const businessPublicPageService = {
  async get(businessId: string): Promise<PublicPageSettings> {
    const settings = await businessPublicPageRepository.findByBusinessId(businessId);
    if (!settings) throw new ValidationError('Negócio não encontrado');
    return settings;
  },

  async update(businessId: string, data: UpdatePublicPageInput): Promise<PublicPageSettings> {
    if (data.slug) {
      if (!isValidSlug(data.slug)) {
        throw new ValidationError('Slug inválido', ['Use apenas letras minúsculas, números e hífen']);
      }
      const taken = await businessPublicPageRepository.slugExists(data.slug, businessId);
      if (taken) throw new ConflictError('Este link já está em uso por outro negócio');
    }

    if (data.botCobraSinal === true) {
      const current = await businessPublicPageRepository.findByBusinessId(businessId);
      if (!data.pixKey && !current?.pixKey) {
        throw new ValidationError('Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô');
      }
      const pct = data.sinalPadraoPct ?? current?.sinalPadraoPct ?? null;
      if (!pct || pct <= 0) throw new ValidationError('Informe a porcentagem do sinal geral');
    }

    return businessPublicPageRepository.update(businessId, data);
  },

  async checkSlugAvailability(slug: string, businessId: string): Promise<boolean> {
    if (!isValidSlug(slug)) return false;
    const taken = await businessPublicPageRepository.slugExists(slug, businessId);
    return !taken;
  },

  async uploadImage(businessId: string, input: UploadImageInput): Promise<string> {
    const buffer = Buffer.from(input.imageBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new ValidationError('Imagem inválida ou maior que 4MB');
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
    const path = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const client = getSupabaseAdminClient();
    const { error } = await client.storage
      .from(IMAGE_BUCKET)
      .upload(path, buffer, { contentType: input.contentType, upsert: true });
    if (error) {
      throw new AppError(`Falha ao enviar imagem: ${error.message}`, 502, 'IMAGE_UPLOAD_FAILED');
    }

    const { data } = client.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },
};
