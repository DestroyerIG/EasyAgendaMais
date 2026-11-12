import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
const repo = vi.hoisted(() => ({ findAllActive: vi.fn(), setAvailable: vi.fn(), countFuturosPorProfissional: vi.fn() }));
vi.mock('../repositories/professionalRepository.js', () => ({ professionalRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { professionalService } = await import('../services/professionalService.js');

beforeEach(() => vi.clearAllMocks());

describe('disponibilidade da profissional', () => {
  it('desliga e devolve quantos agendamentos futuros continuam marcados', async () => {
    repo.setAvailable.mockResolvedValue({ id: 'p1', available: false });
    repo.countFuturosPorProfissional.mockResolvedValue(new Map([['p1', 3]]));
    await expect(professionalService.setAvailability('p1', 'b1', false)).resolves.toEqual({ id: 'p1', available: false, agendamentosFuturos: 3 });
    expect(repo.setAvailable).toHaveBeenCalledWith('p1', 'b1', false);
  });

  it('profissional de outro negócio ou excluída: não encontrada', async () => {
    repo.setAvailable.mockResolvedValue(null);
    await expect(professionalService.setAvailability('x', 'b1', false)).rejects.toThrow(/Profissional/);
  });

  it('a lista traz available e agendamentosFuturos (zero quando não há)', async () => {
    repo.findAllActive.mockResolvedValue([
      { id: 'p1', name: 'Ana', available: true, breakStart: null, breakEnd: null, commissionServicePct: null, commissionProductPct: null },
      { id: 'p2', name: 'Bia', available: false, breakStart: null, breakEnd: null, commissionServicePct: null, commissionProductPct: null },
    ]);
    repo.countFuturosPorProfissional.mockResolvedValue(new Map([['p2', 2]]));
    const r = await professionalService.getProfessionals('b1');
    expect(r.map((p) => [p.id, p.available, p.agendamentosFuturos])).toEqual([['p1', true, 0], ['p2', false, 2]]);
  });
});
