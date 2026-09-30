import { ConflictError, ValidationError } from '../../utils/errors.js';
import { businessPublicPageRepository } from './businessPublicPage.repository.js';
import type { PublicPageSettings, UpdatePublicPageInput } from './businessPublicPage.types.js';

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

    return businessPublicPageRepository.update(businessId, data);
  },
};
