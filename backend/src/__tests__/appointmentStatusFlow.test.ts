import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VALID_STATUS_TRANSITIONS } from '../modules/appointments/appointments.types.js';
import { APPOINTMENT_STATUSES, OCCUPYING_STATUSES } from '../config/appointmentStatus.js';

describe('status de agendamento', () => {
  it('tem os seis status', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(
      ['aguardando_pagamento', 'cancelado', 'concluido', 'confirmado', 'em_atendimento', 'faltou'].sort()
    );
  });

  it('em atendimento continua ocupando o horário', () => {
    expect(OCCUPYING_STATUSES).toEqual(['confirmado', 'em_atendimento']);
  });

  it('transições permitidas', () => {
    expect(VALID_STATUS_TRANSITIONS).toEqual({
      aguardando_pagamento: ['confirmado', 'cancelado'],
      confirmado: ['em_atendimento', 'concluido', 'faltou', 'cancelado'],
      em_atendimento: ['concluido', 'confirmado', 'cancelado'],
      concluido: [],
      faltou: [],
      cancelado: [],
    });
  });
});

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  updateStatus: vi.fn(),
  hasConflict: vi.fn(),
  validateOwnership: vi.fn(),
  create: vi.fn(),
  getServiceDetails: vi.fn(),
}));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15), aoFecharComanda: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $transaction: vi.fn(), earning: { create: vi.fn() } } }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const agendamento = (status: string) => ({
  id: 'a1', businessId: 'b1', clientId: 'c1', professionalId: 'p1', serviceId: 's1',
  date: new Date('2026-10-13'), time: new Date('1970-01-01T10:00:00Z'), status,
  client: { name: 'Ana', phone: '83999990000' }, professional: { name: 'Camila' },
  service: { name: 'Corte', price: 50, durationMinutes: 60 },
});

describe('appointmentsService.updateStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('iniciar atendimento grava started_at', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    repo.updateStatus.mockResolvedValue(agendamento('em_atendimento'));
    await appointmentsService.updateStatus('a1', 'b1', 'em_atendimento');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'em_atendimento', 'confirmado', { startedAt: expect.any(Date) });
  });

  it('desfazer início limpa started_at', async () => {
    repo.findById.mockResolvedValue(agendamento('em_atendimento'));
    repo.updateStatus.mockResolvedValue(agendamento('confirmado'));
    await appointmentsService.updateStatus('a1', 'b1', 'confirmado');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'confirmado', 'em_atendimento', { startedAt: null });
  });

  it('faltou grava finished_at e não gera receita', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    repo.updateStatus.mockResolvedValue(agendamento('faltou'));
    await appointmentsService.updateStatus('a1', 'b1', 'faltou');
    expect(repo.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'faltou', 'confirmado', { finishedAt: expect.any(Date) });
    expect(repo.getServiceDetails).not.toHaveBeenCalled();
  });

  it('concluir direto é recusado: só a comanda conclui', async () => {
    repo.findById.mockResolvedValue(agendamento('confirmado'));
    await expect(appointmentsService.updateStatus('a1', 'b1', 'concluido')).rejects.toThrow('Feche a comanda para concluir o atendimento');
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
});

describe('appointmentsService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava a origem informada (bot do WhatsApp)', async () => {
    repo.validateOwnership.mockResolvedValue({ clientOk: true, professionalOk: true, serviceOk: true });
    repo.hasConflict.mockResolvedValue(false);
    repo.create.mockResolvedValue(agendamento('confirmado'));
    const dados = { clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-10-13', time: '10:00' };
    await appointmentsService.create('b1', dados, { source: 'whatsapp' });
    expect(repo.create).toHaveBeenCalledWith({ ...dados, businessId: 'b1', source: 'whatsapp' });
  });

  it('sem origem informada grava painel', async () => {
    repo.validateOwnership.mockResolvedValue({ clientOk: true, professionalOk: true, serviceOk: true });
    repo.hasConflict.mockResolvedValue(false);
    repo.create.mockResolvedValue(agendamento('confirmado'));
    const dados = { clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-10-13', time: '10:00' };
    await appointmentsService.create('b1', dados);
    expect(repo.create).toHaveBeenCalledWith({ ...dados, businessId: 'b1', source: 'painel' });
  });
});
