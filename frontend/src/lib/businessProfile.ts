import api from '@/lib/api';

export interface BusinessProfileResponse {
  cpfCnpj: string | null;
}

export const businessProfileApi = {
  async getProfile(): Promise<BusinessProfileResponse> {
    const response = await api.get('/business/profile');
    return response.data;
  },

  async updateProfile(cpfCnpj: string): Promise<BusinessProfileResponse> {
    const response = await api.put('/business/profile', { cpfCnpj });
    return response.data;
  },
};
