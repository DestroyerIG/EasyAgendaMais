import { describe, it, expect } from 'vitest';
import { toServiceDto } from '../services/serviceSerializer.js';

/**
 * Regressão: GET /business/services devolvia o objeto do Prisma em camelCase
 * (durationMinutes), mas o frontend lê duration_minutes — o seletor de serviço do
 * agendamento e o card de serviço mostravam a duração em branco ("(min)").
 */
describe('toServiceDto', () => {
  it('converte durationMinutes (Prisma) para duration_minutes (DTO do frontend)', () => {
    const dto = toServiceDto({
      id: 's1',
      businessId: 'b1',
      name: 'Corte masculino',
      price: '55.00',
      durationMinutes: 30,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(dto.duration_minutes).toBe(30);
    expect(dto.business_id).toBe('b1');
    expect(dto.price).toBe(55);
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });
});
