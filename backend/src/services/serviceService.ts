import { serviceRepository } from '../repositories/serviceRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { toServiceDto, type ServiceDto } from './serviceSerializer.js';

interface ServiceData {
  name: string;
  price: number;
  duration_minutes: number;
  depositPercentage?: number;
  description?: string;
}

export const serviceService = {
  async getServices(businessId: string): Promise<ServiceDto[]> {
    const services = await serviceRepository.findAllActive(businessId);
    return services.map(toServiceDto);
  },

  async createService(businessId: string, data: ServiceData): Promise<ServiceDto> {
    const created = await (serviceRepository as unknown as {
      create(data: {
        business_id: string;
        name: string;
        price: number;
        duration_minutes: number;
        depositPercentage?: number;
        description?: string;
      }): Promise<Parameters<typeof toServiceDto>[0]>;
    }).create({
      business_id: businessId,
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
      depositPercentage: data.depositPercentage,
      description: data.description,
    });
    return toServiceDto(created);
  },

  async updateService(id: string, businessId: string, data: ServiceData): Promise<ServiceDto> {
    const result = await (serviceRepository as unknown as {
      update(
        id: string,
        businessId: string,
        data: { name: string; price: number; duration_minutes: number; depositPercentage?: number; description?: string }
      ): Promise<Parameters<typeof toServiceDto>[0] | null>;
    }).update(id, businessId, {
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
      depositPercentage: data.depositPercentage,
      description: data.description,
    });
    if (!result) throw new NotFoundError('Serviço');
    return toServiceDto(result);
  },

  async deleteService(id: string, businessId: string): Promise<void> {
    const result = await (serviceRepository as unknown as {
      softDelete(id: string, businessId: string): Promise<unknown>;
    }).softDelete(id, businessId);
    if (!result) throw new NotFoundError('Serviço');
  },
};
