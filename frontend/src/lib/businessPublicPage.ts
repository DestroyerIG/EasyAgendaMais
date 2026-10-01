import api from '@/lib/api';

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
}

export const businessPublicPageApi = {
  async getSettings(): Promise<PublicPageSettings> {
    const response = await api.get('/business-public-page');
    return response.data;
  },

  async updateSettings(data: Partial<PublicPageSettings>): Promise<PublicPageSettings> {
    const response = await api.put('/business-public-page', data);
    return response.data;
  },

  async checkSlugAvailability(slug: string): Promise<boolean> {
    const response = await api.get('/business-public-page/slug-availability', { params: { slug } });
    return response.data.available;
  },
};
