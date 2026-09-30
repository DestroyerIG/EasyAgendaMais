import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appointmentsService } from '../modules/appointments/appointments.service.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

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
