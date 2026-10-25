import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appointmentsService } from '../modules/appointments/appointments.service.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { ConflictError } from '../utils/errors.js';
import { sendWhatsAppMessage } from '../services/whatsapp/index.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';

vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15), aoFecharComanda: vi.fn().mockResolvedValue(undefined) } }));
const clube = vi.hoisted(() => ({ aoFaltar: vi.fn().mockResolvedValue(null) }));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: clube }));
vi.mock('../modules/appointments/appointments.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/appointments/appointments.repository.js')>();
  return {
    ...actual,
    appointmentsPrismaRepository: {
      ...actual.appointmentsPrismaRepository,
      findById: vi.fn(),
      updateStatus: vi.fn(),
      getServiceDetails: vi.fn(),
    },
  };
});

vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));

vi.mock('../modules/notifications/notifications.service.js', () => ({
  notificationsService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

describe('appointmentsService.updateStatus — confirmação de pagamento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita confirmar pagamento de agendamento já cancelado', async () => {
    (appointmentsPrismaRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'apt-1', status: 'cancelado', serviceId: 'srv-1', businessId: 'biz-1',
    });

    await expect(
      appointmentsService.updateStatus('apt-1', 'biz-1', 'confirmado')
    ).rejects.toThrow(/Transição de status inválida/);
  });
});

describe('appointmentsService.updateStatus — reserva expirada / corrida com o cron', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita com 409 a confirmação de uma reserva já expirada (UPDATE condicional não altera nenhuma linha)', async () => {
    (appointmentsPrismaRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'apt-1', status: 'aguardando_pagamento', serviceId: 'srv-1', businessId: 'biz-1',
      expiresAt: new Date(Date.now() - 60_000), client: { name: 'Mariana', phone: '5583999990000' },
    });
    // O compare-and-set do repositório retorna null quando a reserva expirou ou o
    // status mudou (ex.: cron cancelou entre a leitura e a escrita).
    (appointmentsPrismaRepository.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const promise = appointmentsService.updateStatus('apt-1', 'biz-1', 'confirmado');
    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toThrow('Esta reserva já expirou ou teve seu status alterado');

    expect(appointmentsPrismaRepository.updateStatus).toHaveBeenCalledWith(
      'apt-1', 'biz-1', 'confirmado', 'aguardando_pagamento', {}
    );
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe('appointmentsService.updateStatus — confirmação de pagamento com sucesso', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia WhatsApp e cria notificação ao confirmar o pagamento', async () => {
    const appointment = {
      id: 'apt-1', status: 'aguardando_pagamento', serviceId: 'srv-1', businessId: 'biz-1',
      expiresAt: new Date(Date.now() + 60_000),
      client: { name: 'Mariana', phone: '5583999990000' },
      service: { name: 'Corte' },
    };
    (appointmentsPrismaRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(appointment);
    (appointmentsPrismaRepository.updateStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...appointment, status: 'confirmado',
    });

    await appointmentsService.updateStatus('apt-1', 'biz-1', 'confirmado');

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      '5583999990000', expect.stringContaining('Mariana'), { businessId: 'biz-1', origin: 'pix_recibo' }
    );
    expect(notificationsService.notify).toHaveBeenCalledWith('biz-1', {
      type: 'pagamento_confirmado',
      title: 'Pagamento confirmado',
      description: 'Mariana · Corte',
    });
  });
});
