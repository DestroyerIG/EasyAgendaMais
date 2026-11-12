import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15) },
}));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: { aoFaltar: vi.fn().mockResolvedValue(null) } }));
const repo = vi.hoisted(() => ({ findById: vi.fn(), updateStatus: vi.fn(), update: vi.fn(), validateOwnership: vi.fn(), hasConflict: vi.fn() }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn().mockResolvedValue(undefined) } }));
const push = vi.hoisted(() => ({ paraProfissional: vi.fn().mockResolvedValue(0) }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: push }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const appt = (over: Record<string, unknown> = {}) => ({
  id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'confirmado', serviceId: 's1',
  date: new Date('2026-10-26T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'),
  client: { name: 'Mariana Souza', phone: '55' }, service: { name: 'Manicure' }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  push.paraProfissional.mockResolvedValue(0);
  repo.validateOwnership.mockResolvedValue({ clientOk: true, professionalOk: true, professionalDisponivel: true, serviceOk: true });
  repo.hasConflict.mockResolvedValue(false);
});

describe('push para a profissional nos eventos da agenda', () => {
  it('cancelado pela recepção avisa; pela própria profissional, não', async () => {
    repo.findById.mockResolvedValue(appt());
    repo.updateStatus.mockResolvedValue(appt({ status: 'cancelado' }));
    await appointmentsService.updateStatus('a1', 'b1', 'cancelado');
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p1', expect.objectContaining({
      titulo: 'Agendamento cancelado', corpo: 'Mariana · 26/10 às 10:00', link: '/bancada',
    }));
    push.paraProfissional.mockClear();
    await appointmentsService.updateStatus('a1', 'b1', 'cancelado', { porProfissional: true });
    expect(push.paraProfissional).not.toHaveBeenCalled();
  });

  it('troca de profissional avisa as duas', async () => {
    repo.findById.mockResolvedValue(appt());
    repo.update.mockResolvedValue(appt({ professionalId: 'p2' }));
    await appointmentsService.update('a1', 'b1', { professionalId: 'p2' });
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p1', expect.objectContaining({ titulo: 'Agendamento passou para outra profissional' }));
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p2', expect.objectContaining({ titulo: 'Novo agendamento' }));
  });

  it('mudança de horário avisa; sem mudança, silêncio', async () => {
    repo.findById.mockResolvedValue(appt());
    repo.update.mockResolvedValue(appt({ time: new Date('1970-01-01T14:30:00Z') }));
    await appointmentsService.update('a1', 'b1', { time: '14:30' });
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p1', expect.objectContaining({ titulo: 'Agendamento reagendado', corpo: 'Mariana · 26/10 às 14:30' }));
    push.paraProfissional.mockClear();
    repo.update.mockResolvedValue(appt());
    await appointmentsService.update('a1', 'b1', { notes: 'x' });
    expect(push.paraProfissional).not.toHaveBeenCalled();
  });

  it('dados incompletos não derrubam a operação', async () => {
    repo.findById.mockResolvedValue({ id: 'a1', status: 'confirmado', businessId: 'b1', professionalId: 'p1' });
    repo.updateStatus.mockResolvedValue({ id: 'a1', status: 'cancelado', businessId: 'b1', professionalId: 'p1' });
    await expect(appointmentsService.updateStatus('a1', 'b1', 'cancelado')).resolves.toBeTruthy();
  });
});
