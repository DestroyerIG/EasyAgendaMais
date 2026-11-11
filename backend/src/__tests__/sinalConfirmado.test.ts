import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ business: { findFirst: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));
const whats = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/index.js', () => whats);
const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const push = vi.hoisted(() => ({ paraProfissional: vi.fn() }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: push }));
const agenda = vi.hoisted(() => ({ sincronizarSaida: vi.fn() }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: agenda }));

const cfg = vi.hoisted(() => ({ getBotConfig: vi.fn() }));
vi.mock('../services/whatsapp/whatsappConfigService.js', () => cfg);
const sessao = vi.hoisted(() => ({ deleteSessaoDoSinal: vi.fn() }));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => sessao);

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
  cfg.getBotConfig.mockResolvedValue({
    confirmation_message: 'Pronto {nome_cliente}! {servico} com {profissional} em {data} às {horario} por R$ {valor} na {nome_negocio}.',
  });
  sessao.deleteSessaoDoSinal.mockResolvedValue(undefined);
  db.business.findFirst.mockResolvedValue({ name: 'Studio Bela' });
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

  describe('reserva do robô (source whatsapp)', () => {
    const robo = {
      ...appt, source: 'whatsapp',
      professional: { name: 'Carla' }, service: { name: 'Manicure', price: 45 },
    } as any;

    it('reserva do robô recebe a confirmation_message com serviço, profissional, data, horário e valor', async () => {
      await avisarSinalConfirmado(robo);
      expect(whats.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
      expect(whats.sendWhatsAppMessage).toHaveBeenCalledWith(
        '5511999999999',
        'Pronto Mariana Souza! Manicure com Carla em 26/10/2026 às 10:00 por R$ 45.00 na Studio Bela.',
        { businessId: 'b1', origin: 'pix_recibo' },
      );
    });

    it('reserva do robô apaga a sessão do telefone', async () => {
      await avisarSinalConfirmado(robo);
      expect(sessao.deleteSessaoDoSinal).toHaveBeenCalledWith('5511999999999', 'b1', robo.id);
    });

    it("reserva da página pública continua com 'Seu sinal foi confirmado e seu horário está garantido'", async () => {
      await avisarSinalConfirmado({ ...robo, source: 'publico' });
      expect(whats.sendWhatsAppMessage.mock.calls[0]![1]).toContain('Seu sinal foi confirmado e seu horário está garantido');
      expect(sessao.deleteSessaoDoSinal).not.toHaveBeenCalled();
      expect(cfg.getBotConfig).not.toHaveBeenCalled();
    });

    it('falha ao montar o texto não impede notificação, push e agenda', async () => {
      cfg.getBotConfig.mockRejectedValue(new Error('banco'));
      await expect(avisarSinalConfirmado(robo)).resolves.toBeUndefined();
      expect(notif.notify).toHaveBeenCalled();
      expect(push.paraProfissional).toHaveBeenCalled();
      expect(agenda.sincronizarSaida).toHaveBeenCalled();
    });

    it('falha ao apagar a sessão não lança nem impede o restante', async () => {
      sessao.deleteSessaoDoSinal.mockRejectedValue(new Error('banco'));
      await expect(avisarSinalConfirmado(robo)).resolves.toBeUndefined();
      expect(notif.notify).toHaveBeenCalled();
      expect(agenda.sincronizarSaida).toHaveBeenCalled();
    });
  });
});
