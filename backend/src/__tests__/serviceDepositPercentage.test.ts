import { describe, it, expect } from 'vitest';
import { toServiceDto } from '../services/serviceSerializer.js';

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
