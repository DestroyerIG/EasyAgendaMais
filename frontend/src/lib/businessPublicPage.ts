import api from '@/lib/api';

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  address: string | null;
  coverUrl: string | null;
  description: string | null;
  comodidades: string[];
  mostrarNota: boolean;
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

  async uploadImage(file: File): Promise<string> {
    const imageBase64 = await fileToBase64(file);
    const response = await api.post('/business-public-page/upload-image', {
      imageBase64,
      contentType: file.type,
    });
    return response.data.url;
  },
};

/** Base64 puro (sem o prefixo "data:...;base64,") do conteúdo do arquivo. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}
