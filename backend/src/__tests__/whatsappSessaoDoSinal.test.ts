import { vi, describe, it, beforeEach, expect } from 'vitest';

const deleteMany = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({ prisma: { whatsappSession: { deleteMany } } }));

const { deleteSessaoDoSinal } = await import('../services/whatsapp/whatsappSessionService.js');
const { STEPS } = await import('../services/whatsapp/whatsappConstants.js');

describe('deleteSessaoDoSinal', () => {
  beforeEach(() => { vi.clearAllMocks(); deleteMany.mockResolvedValue({ count: 1 }); });

  it('apaga só a sessão em awaiting_deposit cuja reserva é a informada', async () => {
    await deleteSessaoDoSinal('5511999999999', 'b1', 'apt-1');
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        phone: '5511999999999', businessId: 'b1', step: STEPS.AWAITING_DEPOSIT,
        data: { path: ['appointmentId'], equals: 'apt-1' },
      },
    });
  });
});
