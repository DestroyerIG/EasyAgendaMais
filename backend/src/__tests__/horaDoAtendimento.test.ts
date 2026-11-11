import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockNotify = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock('../config/prisma.js', () => ({
  prisma: { appointment: { findMany: mockFindMany, updateMany: mockUpdateMany } },
}));
vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: mockNotify } }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: { paraProfissional: mockPush } }));

const { avisarHoraDoAtendimento } = await import('../modules/appointments/horaDoAtendimento.js');

const agendamento = {
  id: 'ag-1',
  businessId: 'biz-1',
  professionalId: 'prof-1',
  date: new Date('2026-11-11T00:00:00.000Z'),
  time: new Date('1970-01-01T14:00:00.000Z'),
  client: { name: 'Mariana Souza' },
  service: { name: 'Corte' },
  professional: { name: 'Paula' },
};

// 14:02 em São Paulo (UTC-3) = 17:02 UTC.
const AGORA = new Date('2026-11-11T17:02:00.000Z');

describe('avisarHoraDoAtendimento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([agendamento]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockNotify.mockResolvedValue(undefined);
    mockPush.mockResolvedValue(1);
  });

  it('busca só confirmados de hoje, ainda não avisados, na janela dos últimos 15 minutos', async () => {
    await avisarHoraDoAtendimento(AGORA);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('confirmado');
    expect(where.horaAvisadaEm).toBeNull();
    expect(where.date).toEqual(new Date('2026-11-11T00:00:00.000Z'));
    expect(where.time.gte).toEqual(new Date('1970-01-01T13:47:00.000Z'));
    expect(where.time.lte).toEqual(new Date('1970-01-01T14:02:00.000Z'));
  });

  it('manda o sino à equipe (sem push) e o push só ao barbeiro do agendamento', async () => {
    await avisarHoraDoAtendimento(AGORA);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [businessId, input, opts] = mockNotify.mock.calls[0];
    expect(businessId).toBe('biz-1');
    expect(input).toMatchObject({ type: 'hora_atendimento', title: 'Hora de atender Mariana', link: '/agendamentos?data=2026-11-11' });
    expect(input.description).toContain('Corte');
    expect(input.description).toContain('14:00');
    expect(opts).toEqual({ semPush: true });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('biz-1', 'prof-1', expect.objectContaining({
      titulo: 'Hora de atender Mariana', link: '/bancada', tag: 'hora-ag-1',
    }));
  });

  it('marca o agendamento antes de avisar, uma vez só', async () => {
    await avisarHoraDoAtendimento(AGORA);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'ag-1', status: 'confirmado', horaAvisadaEm: null },
      data: { horaAvisadaEm: AGORA },
    });
  });

  it('não avisa de novo se outra rodada já marcou o agendamento', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await avisarHoraDoAtendimento(AGORA);

    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('um agendamento que falha não impede os outros, e nunca lança', async () => {
    mockFindMany.mockResolvedValue([agendamento, { ...agendamento, id: 'ag-2' }]);
    mockUpdateMany.mockRejectedValueOnce(new Error('banco caiu')).mockResolvedValueOnce({ count: 1 });

    await expect(avisarHoraDoAtendimento(AGORA)).resolves.toBeUndefined();

    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('nunca lança se a consulta falhar', async () => {
    mockFindMany.mockRejectedValue(new Error('banco caiu'));
    await expect(avisarHoraDoAtendimento(AGORA)).resolves.toBeUndefined();
  });

  it('logo depois da meia-noite a janela não volta para o dia anterior', async () => {
    // 00:05 em São Paulo = 03:05 UTC.
    await avisarHoraDoAtendimento(new Date('2026-11-11T03:05:00.000Z'));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.time.gte).toEqual(new Date('1970-01-01T00:00:00.000Z'));
    expect(where.time.lte).toEqual(new Date('1970-01-01T00:05:00.000Z'));
  });
});
