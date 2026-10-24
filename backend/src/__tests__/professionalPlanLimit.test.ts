import { vi, describe, it, expect, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ countActive: vi.fn(), create: vi.fn() }));
const prisma = vi.hoisted(() => ({ business: { findUnique: vi.fn() } }));

vi.mock('../repositories/professionalRepository.js', () => ({ professionalRepository: repo }));
vi.mock('../config/prisma.js', () => ({ prisma }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(async () => ({ openingTime: '09:00', closingTime: '20:00' })),
}));

const { professionalService } = await import('../services/professionalService.js');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.business.findUnique.mockResolvedValue({ planoAgendado: null });
  repo.create.mockResolvedValue({ id: 'p1' });
});

describe('limite de profissionais por plano', () => {
  it('Solo para na primeira e pede o Equipe', async () => {
    repo.countActive.mockResolvedValue(1);
    await expect(professionalService.createProfessional('b1', 'basico', { name: 'Ana' })).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      requiredPlan: 'profissional',
    });
  });

  it('Equipe aceita até 5 e o Salão não tem limite', async () => {
    repo.countActive.mockResolvedValue(4);
    await expect(professionalService.createProfessional('b1', 'profissional', { name: 'Ana' })).resolves.toEqual({ id: 'p1' });
    repo.countActive.mockResolvedValue(40);
    await expect(professionalService.createProfessional('b1', 'premium', { name: 'Ana' })).resolves.toEqual({ id: 'p1' });
  });

  it('com downgrade agendado vale o limite do plano agendado', async () => {
    prisma.business.findUnique.mockResolvedValue({ planoAgendado: 'basico' });
    repo.countActive.mockResolvedValue(1);
    await expect(professionalService.createProfessional('b1', 'profissional', { name: 'Ana' })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('mudança de plano agendada'),
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});
