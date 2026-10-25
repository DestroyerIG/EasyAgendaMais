import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toAppointmentDto } from '../modules/appointments/appointment.serializer.js';

const repo = vi.hoisted(() => ({ findById: vi.fn(), findClientVisits: vi.fn(), findClientNotes: vi.fn() }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15), aoFecharComanda: vi.fn().mockResolvedValue(undefined) } }));
const clube = vi.hoisted(() => ({ aoFaltar: vi.fn().mockResolvedValue(null) }));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: clube }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const agendamento = {
  id: 'a9', clientId: 'c1', date: new Date('2026-09-17'), time: new Date('1970-01-01T10:00:00Z'), status: 'confirmado',
  client: { name: 'Rafaela', phone: '1' }, professional: { name: 'Camila' }, service: { name: 'Alongamento', price: 180, durationMinutes: 150 },
};

describe('toAppointmentDto', () => {
  it('leva origem, sinal, início e comanda', () => {
    const dto = toAppointmentDto({
      id: 'a1', date: new Date('2026-10-13T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'), status: 'em_atendimento',
      source: 'publico', depositAmount: '30.00', startedAt: new Date('2026-10-13T13:05:00Z'),
      comanda: { id: 'k1', status: 'rascunho', number: 1042 },
    });
    expect(dto).toMatchObject({ source: 'publico', deposit_amount: 30, started_at: '2026-10-13T13:05:00.000Z', comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 1042 });
  });

  it('comanda fechada leva o total cobrado e o sinal aplicado gravados', () => {
    const dto = toAppointmentDto({
      id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'concluido',
      comanda: { id: 'k1', status: 'fechada', number: 1043, totalCharged: '150.00', depositApplied: '30.00' },
    });
    expect(dto).toMatchObject({ comanda_status: 'fechada', comanda_total_charged: 150, comanda_deposit_applied: 30 });
  });

  it('comanda rascunho não expõe totais', () => {
    const dto = toAppointmentDto({
      id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'em_atendimento',
      comanda: { id: 'k1', status: 'rascunho', number: 1043, totalCharged: '150.00', depositApplied: '30.00' },
    });
    expect(dto).toMatchObject({ comanda_total_charged: null, comanda_deposit_applied: null });
  });

  it('leva a confirmação da cliente pelo WhatsApp', () => {
    const dto = toAppointmentDto({
      id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'confirmado', clientConfirmedAt: new Date('2026-10-12T12:30:00Z'),
    });
    expect(dto.client_confirmed_at).toBe('2026-10-12T12:30:00.000Z');
    expect(toAppointmentDto({ id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'confirmado' }).client_confirmed_at).toBeNull();
  });

  it('sem sinal e sem comanda dá null', () => {
    const dto = toAppointmentDto({ id: 'a1', date: '2026-10-13', time: '10:00:00', status: 'confirmado' });
    expect(dto).toMatchObject({ source: 'painel', deposit_amount: null, comanda_id: null, comanda_status: null, comanda_number: null, comanda_total_charged: null, comanda_deposit_applied: null, started_at: null });
  });
});

describe('appointmentsService.getDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-17T12:00:00-03:00'));
  });

  it('calcula ciclo médio, visitas no ano e última visita antes deste atendimento', async () => {
    repo.findById.mockResolvedValue(agendamento);
    repo.findClientVisits.mockResolvedValue([
      { date: new Date('2026-08-29'), professional: { name: 'Camila Rocha' } },
      { date: new Date('2026-08-08'), professional: { name: 'Camila Rocha' } },
      { date: new Date('2026-07-18'), professional: { name: 'Bruna Lima' } },
      { date: new Date('2025-12-20'), professional: { name: 'Bruna Lima' } },
    ]);
    repo.findClientNotes.mockResolvedValue('Sensível a primer ácido');

    const d = await appointmentsService.getDetails('a9', 'b1');

    expect(repo.findClientVisits).toHaveBeenCalledWith('c1', 'b1', new Date('2026-09-17'));
    // intervalos: 21, 21 e 210 dias → média 84
    expect(d.client_stats).toEqual({
      visits_this_year: 3,
      average_cycle_days: 84,
      last_visit_days_ago: 19,
      last_visit_professional: 'Camila Rocha',
      is_recurring: true,
    });
    expect(d.client_notes).toBe('Sensível a primer ácido');
  });

  it('cliente nova não tem ciclo nem última visita', async () => {
    repo.findById.mockResolvedValue(agendamento);
    repo.findClientVisits.mockResolvedValue([]);
    repo.findClientNotes.mockResolvedValue(null);
    const d = await appointmentsService.getDetails('a9', 'b1');
    expect(d.client_stats).toEqual({ visits_this_year: 0, average_cycle_days: null, last_visit_days_ago: null, last_visit_professional: null, is_recurring: false });
  });

  it('agendamento de outro negócio dá NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(appointmentsService.getDetails('a9', 'b1')).rejects.toThrow('Agendamento não encontrado');
  });
});
