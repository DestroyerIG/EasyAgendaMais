import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
const whats = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/index.js', () => whats);
const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const push = vi.hoisted(() => ({ paraProfissional: vi.fn() }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: push }));
const agenda = vi.hoisted(() => ({ sincronizarSaida: vi.fn() }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: agenda }));

const { avisarSinalConfirmado } = await import('../modules/appointments/sinalConfirmado.js');

const appt = {
  id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'confirmado',
  date: new Date('2026-10-26T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'),
  client: { name: 'Mariana Souza', phone: '5511999999999' }, service: { name: 'Manicure' },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  whats.sendWhatsAppMessage.mockResolvedValue(true);
  notif.notify.mockResolvedValue(undefined);
  push.paraProfissional.mockResolvedValue(0);
  agenda.sincronizarSaida.mockResolvedValue(undefined);
});

describe('avisarSinalConfirmado', () => {
  it('envia o WhatsApp, notifica, avisa a profissional e sincroniza a agenda', async () => {
    await avisarSinalConfirmado(appt);
    expect(whats.sendWhatsAppMessage).toHaveBeenCalledWith(
      '5511999999999',
      'Olá Mariana Souza! Seu sinal foi confirmado e seu horário está garantido. Te esperamos!',
      { businessId: 'b1', origin: 'pix_recibo' },
    );
    expect(notif.notify).toHaveBeenCalledWith('b1', {
      type: 'pagamento_confirmado', title: 'Pagamento confirmado', description: 'Mariana Souza · Manicure',
    });
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p1', expect.objectContaining({
      titulo: 'Novo agendamento', corpo: 'Mariana · Manicure · 26/10 às 10:00',
    }));
    expect(agenda.sincronizarSaida).toHaveBeenCalledWith({ appointmentId: 'a1' });
  });

  it('falha no WhatsApp não impede a notificação nem o aviso, e não lança', async () => {
    whats.sendWhatsAppMessage.mockRejectedValue(new Error('fora do ar'));
    await expect(avisarSinalConfirmado(appt)).resolves.toBeUndefined();
    expect(notif.notify).toHaveBeenCalled();
    expect(push.paraProfissional).toHaveBeenCalled();
  });

  it('falha na notificação também não lança nem impede o aviso', async () => {
    notif.notify.mockRejectedValue(new Error('banco'));
    await expect(avisarSinalConfirmado(appt)).resolves.toBeUndefined();
    expect(push.paraProfissional).toHaveBeenCalled();
  });

  it('com sincronizar: false não sincroniza a agenda', async () => {
    await avisarSinalConfirmado(appt, { sincronizar: false });
    expect(agenda.sincronizarSaida).not.toHaveBeenCalled();
  });
});
