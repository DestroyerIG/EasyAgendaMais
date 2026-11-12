import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15) },
}));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: { aoFaltar: vi.fn().mockResolvedValue(null) } }));
const repo = vi.hoisted(() => ({
  findById: vi.fn(), updateStatus: vi.fn(), update: vi.fn(), validateOwnership: vi.fn(), hasConflict: vi.fn(), create: vi.fn(), softDelete: vi.fn(),
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: repo }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: { paraProfissional: vi.fn().mockResolvedValue(0) } }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');

const appt = (over: Record<string, unknown> = {}) => ({
  id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'confirmado', serviceId: 's1',
  date: new Date('2026-10-26T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'),
  client: { name: 'Mariana Souza', phone: '55' }, service: { name: 'Manicure' }, ...over,
});
const dono = (over: Record<string, unknown> = {}) => ({ clientOk: true, professionalOk: true, professionalDisponivel: true, serviceOk: true, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  repo.hasConflict.mockResolvedValue(false);
  repo.findById.mockResolvedValue(appt());
  repo.update.mockResolvedValue(appt());
  repo.create.mockResolvedValue(appt({ id: 'novo' }));
});

describe('profissional indisponível (agenda desligada)', () => {
  it('não cria agendamento novo para ela', async () => {
    repo.validateOwnership.mockResolvedValue(dono({ professionalDisponivel: false }));
    await expect(appointmentsService.create('b1', { clientId: 'c', professionalId: 'p1', serviceId: 's', date: '2026-11-20', time: '10:00' } as never))
      .rejects.toThrow(/indisponível no momento/);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('cria normalmente quando ela está disponível', async () => {
    repo.validateOwnership.mockResolvedValue(dono());
    await expect(appointmentsService.create('b1', { clientId: 'c', professionalId: 'p1', serviceId: 's', date: '2026-11-20', time: '10:00' } as never))
      .resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalled();
  });

  it('remarcar dia e horário com a mesma profissional continua permitido, mesmo desligada', async () => {
    repo.validateOwnership.mockResolvedValue(dono({ professionalDisponivel: false }));
    await expect(appointmentsService.update('a1', 'b1', { professionalId: 'p1', date: '2026-11-27', time: '14:00' } as never)).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalled();
  });

  it('passar o agendamento para outra profissional disponível funciona', async () => {
    repo.validateOwnership.mockResolvedValue(dono());
    await expect(appointmentsService.update('a1', 'b1', { professionalId: 'p2' } as never)).resolves.toBeDefined();
  });

  it('passar o agendamento para outra profissional que também está desligada é barrado', async () => {
    repo.validateOwnership.mockResolvedValue(dono({ professionalDisponivel: false }));
    await expect(appointmentsService.update('a1', 'b1', { professionalId: 'p2' } as never)).rejects.toThrow(/indisponível no momento/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('cancelar o agendamento dela continua permitido', async () => {
    repo.updateStatus.mockResolvedValue(appt({ status: 'cancelado' }));
    await expect(appointmentsService.updateStatus('a1', 'b1', 'cancelado')).resolves.toBeDefined();
    expect(repo.validateOwnership).not.toHaveBeenCalled();
  });
});
