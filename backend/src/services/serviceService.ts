import { serviceRepository } from '../repositories/serviceRepository.js';
import { NotFoundError } from '../utils/errors.js';

interface ServiceData {
  name: string;
  price: number;
  duration_minutes: number;
}

export const serviceService = {
  async getServices(businessId: string) {
    return serviceRepository.findAllActive(businessId);
  },

  async createService(businessId: string, data: ServiceData) {
    return (serviceRepository as unknown as {
      create(data: {
        business_id: string;
        name: string;
        price: number;
        duration_minutes: number;
      }): Promise<unknown>;
    }).create({
      business_id: businessId,
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
  },

  async updateService(id: string, businessId: string, data: ServiceData) {
    const result = await (serviceRepository as unknown as {
      update(
        id: string,
        businessId: string,
        data: { name: string; price: number; duration_minutes: number }
      ): Promise<unknown>;
    }).update(id, businessId, {
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
    if (!result) throw new NotFoundError('Serviço');
    return result;
  },

  async deleteService(id: string, businessId: string): Promise<void> {
    const result = await (serviceRepository as unknown as {
      softDelete(id: string, businessId: string): Promise<unknown>;
    }).softDelete(id, businessId);
    if (!result) throw new NotFoundError('Serviço');
  },
};
