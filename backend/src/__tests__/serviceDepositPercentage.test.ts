import { vi, describe, it, expect } from 'vitest';
import { toServiceDto } from '../services/serviceSerializer.js';

const mockServiceRepository = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../repositories/serviceRepository.js', () => ({
  serviceRepository: mockServiceRepository,
}));

const { serviceService } = await import('../services/serviceService.js');

describe('toServiceDto — depositPercentage', () => {
  it('inclui deposit_percentage no DTO quando configurado', () => {
    const dto = toServiceDto({
      id: 'srv-1',
      businessId: 'biz-1',
      name: 'Manutenção',
      price: 130 as unknown as never,
      durationMinutes: 105,
      depositPercentage: 30 as unknown as never,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(dto.deposit_percentage).toBe(30);
  });

  it('retorna null quando o serviço não tem sinal configurado', () => {
    const dto = toServiceDto({
      id: 'srv-2',
      businessId: 'biz-1',
      name: 'Corte',
      price: 40 as unknown as never,
      durationMinutes: 30,
      depositPercentage: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(dto.deposit_percentage).toBeNull();
  });
});

describe('serviceService — forwarding de depositPercentage ao repositório', () => {
  const fakeCreated = {
    id: 'srv-3',
    businessId: 'biz-1',
    name: 'Coloração',
    price: 200,
    durationMinutes: 90,
    depositPercentage: 25,
    active: true,
    createdAt: new Date(),
  };

  it('createService repassa depositPercentage para serviceRepository.create', async () => {
    mockServiceRepository.create.mockResolvedValueOnce(fakeCreated);

    await serviceService.createService('biz-1', {
      name: 'Coloração',
      price: 200,
      duration_minutes: 90,
      depositPercentage: 25,
    });

    expect(mockServiceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ depositPercentage: 25 })
    );
  });

  it('updateService repassa depositPercentage para serviceRepository.update', async () => {
    mockServiceRepository.update.mockResolvedValueOnce(fakeCreated);

    await serviceService.updateService('srv-3', 'biz-1', {
      name: 'Coloração',
      price: 200,
      duration_minutes: 90,
      depositPercentage: 25,
    });

    expect(mockServiceRepository.update).toHaveBeenCalledWith(
      'srv-3',
      'biz-1',
      expect.objectContaining({ depositPercentage: 25 })
    );
  });
});
