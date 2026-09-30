import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/prisma.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    business: { findFirst: vi.fn() },
    service: { findFirst: vi.fn(), findMany: vi.fn() },
    professional: { findFirst: vi.fn(), findMany: vi.fn() },
    appointment: { create: vi.fn() },
  },
}));

vi.mock('../repositories/clientRepository.js', () => ({
  clientRepository: {
    findByPhone: vi.fn(),
    create: vi.fn(),
  },
}));

describe('publicBookingRepository — exclusão de sinal 0%', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findEligibleServices filtra depositPercentage com gt: 0 (exclui null e 0%)', async () => {
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await publicBookingRepository.findEligibleServices('biz-1');

    const whereArg = (prisma.service.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.depositPercentage).toEqual({ gt: 0 });
  });

  it('findServiceForBusiness filtra depositPercentage com gt: 0 (exclui null e 0%)', async () => {
    (prisma.service.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await publicBookingRepository.findServiceForBusiness('biz-1', 'srv-1');

    const whereArg = (prisma.service.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.depositPercentage).toEqual({ gt: 0 });
  });
});
