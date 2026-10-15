import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  list: vi.fn(), findById: vi.fn(), create: vi.fn(), updateActive: vi.fn(),
  markOffered: vi.fn(), markBooked: vi.fn(),
  clientExists: vi.fn(), serviceExists: vi.fn(), professionalExists: vi.fn(),
  appointmentClientId: vi.fn(), businessName: vi.fn(),
}));
vi.mock('../modules/waitlist/waitlist.repository.js', () => ({ waitlistRepository: repo }));

const { waitlistService } = await import('../modules/waitlist/waitlist.service.js');
const { CreateWaitlistSchema, UpdateWaitlistSchema, OfferSchema, ListQuerySchema, BookedSchema } = await import('../modules/waitlist/waitlist.types.js');

const U = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const [C1, S1, P1, W1, A1] = [U(1), U(2), U(3), U(4), U(5)];

const item = (over: Record<string, unknown> = {}) => ({
  id: W1, status: 'aguardando',
  cliente: { id: C1, name: 'Maria', phone: '+55 (83) 99999-0000' },
  servico: { id: S1, name: 'Corte' }, profissional: null,
  desiredDate: null, period: 'qualquer', notes: null, offeredAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.clientExists.mockResolvedValue(true);
  repo.serviceExists.mockResolvedValue(true);
  repo.professionalExists.mockResolvedValue(true);
  repo.businessName.mockResolvedValue('Barbearia Top');
  repo.findById.mockResolvedValue(item());
  repo.create.mockResolvedValue(item());
  repo.markOffered.mockImplementation(async () => item({ status: 'oferecida', offeredAt: 'x' }));
  repo.markBooked.mockResolvedValue(item({ status: 'agendada' }));
  repo.updateActive.mockResolvedValue(item({ status: 'cancelada' }));
  repo.appointmentClientId.mockResolvedValue(C1);
  repo.list.mockResolvedValue([]);
});

describe('criação', () => {
  it('cliente de outro negócio -> NotFound', async () => {
    repo.clientExists.mockResolvedValue(false);
    await expect(waitlistService.create('b1', { clientId: C1, serviceId: S1, period: 'qualquer' })).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('serviço de outro negócio -> NotFound', async () => {
    repo.serviceExists.mockResolvedValue(false);
    await expect(waitlistService.create('b1', { clientId: C1, serviceId: S1, period: 'qualquer' })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('profissional de outro negócio -> NotFound', async () => {
    repo.professionalExists.mockResolvedValue(false);
    await expect(waitlistService.create('b1', { clientId: C1, serviceId: S1, professionalId: P1, period: 'tarde' })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('cria quando tudo é do negócio', async () => {
    await waitlistService.create('b1', { clientId: C1, serviceId: S1, period: 'manha' });
    expect(repo.create).toHaveBeenCalledWith('b1', expect.objectContaining({ clientId: C1, period: 'manha' }));
  });
});

describe('listagem', () => {
  it('padrão = ativas (aguardando + oferecida)', async () => {
    await waitlistService.list('b1', {});
    expect(repo.list).toHaveBeenCalledWith('b1', expect.objectContaining({ statuses: ['aguardando', 'oferecida'] }));
  });
  it('status específico e todas', async () => {
    await waitlistService.list('b1', { status: 'oferecida' });
    expect(repo.list).toHaveBeenLastCalledWith('b1', expect.objectContaining({ statuses: ['oferecida'] }));
    await waitlistService.list('b1', { status: 'todas' });
    expect(repo.list).toHaveBeenLastCalledWith('b1', expect.objectContaining({ statuses: undefined }));
  });
  it('repassa período e data', async () => {
    await waitlistService.list('b1', { period: 'tarde', date: '2026-03-10' });
    expect(repo.list).toHaveBeenCalledWith('b1', expect.objectContaining({ period: 'tarde', date: '2026-03-10' }));
  });
});

describe('transições', () => {
  it('cancelar aguardando funciona', async () => {
    const r = await waitlistService.update('b1', W1, { status: 'cancelada' });
    expect(r.status).toBe('cancelada');
    expect(repo.updateActive).toHaveBeenCalled();
  });
  it('cancelar inscrição final -> 409', async () => {
    repo.findById.mockResolvedValue(item({ status: 'agendada' }));
    await expect(waitlistService.update('b1', W1, { status: 'cancelada' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('inexistente -> NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(waitlistService.update('b1', W1, { notes: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('corrida: updateActive devolve null -> 409', async () => {
    repo.updateActive.mockResolvedValue(null);
    await expect(waitlistService.update('b1', W1, { status: 'cancelada' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('offer em cancelada -> 409', async () => {
    repo.findById.mockResolvedValue(item({ status: 'cancelada' }));
    await expect(waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:00' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('offer de oferecida é permitida', async () => {
    repo.findById.mockResolvedValue(item({ status: 'oferecida' }));
    await expect(waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:00' })).resolves.toBeTruthy();
  });
  it('booked de cancelada -> 409 com mensagem', async () => {
    repo.findById.mockResolvedValue(item({ status: 'cancelada' }));
    await expect(waitlistService.booked('b1', W1, A1)).rejects.toMatchObject({ statusCode: 409, message: 'Esta inscrição não pode mais ser agendada' });
  });
  it('booked com agendamento de outra cliente -> 409', async () => {
    repo.appointmentClientId.mockResolvedValue(U(9));
    await expect(waitlistService.booked('b1', W1, A1)).rejects.toMatchObject({ statusCode: 409, message: 'Esta inscrição não pode mais ser agendada' });
    expect(repo.markBooked).not.toHaveBeenCalled();
  });
  it('booked com agendamento inexistente -> NotFound', async () => {
    repo.appointmentClientId.mockResolvedValue(null);
    await expect(waitlistService.booked('b1', W1, A1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('booked ok marca agendada', async () => {
    const r = await waitlistService.booked('b1', W1, A1);
    expect(r.status).toBe('agendada');
    expect(repo.markBooked).toHaveBeenCalledWith(W1, 'b1', A1);
  });
  it('booked: appointmentId já usado (P2002) -> 409', async () => {
    repo.markBooked.mockRejectedValue(Object.assign(new Error('u'), { code: 'P2002' }));
    await expect(waitlistService.booked('b1', W1, A1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('oferta de vaga', () => {
  it('monta whatsappUrl com 55 + dígitos e mensagem codificada', async () => {
    const r = await waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:30' });
    const msg = 'Olá, Maria! Abriu um horário para Corte no Barbearia Top: 10/03 às 09:30. Quer que eu reserve para você?';
    expect(r.whatsappUrl).toBe(`https://wa.me/5583999990000?text=${encodeURIComponent(msg)}`);
    expect(r.item.status).toBe('oferecida');
    expect(repo.markOffered).toHaveBeenCalledWith(W1, 'b1');
  });
  it('telefone sem 55', async () => {
    repo.findById.mockResolvedValue(item({ cliente: { id: C1, name: 'Maria', phone: '83999990000' } }));
    const r = await waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:30' });
    expect(r.whatsappUrl.startsWith('https://wa.me/5583999990000?')).toBe(true);
  });
  it('telefone de 11 dígitos começando com 55 (DDD 55) ganha o prefixo', async () => {
    repo.findById.mockResolvedValue(item({ cliente: { id: C1, name: 'Maria', phone: '55 99999-0000' } }));
    const r = await waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:30' });
    expect(r.whatsappUrl.startsWith('https://wa.me/5555999990000?')).toBe(true);
  });
  it('profissional informado precisa ser do negócio', async () => {
    repo.professionalExists.mockResolvedValue(false);
    await expect(waitlistService.offer('b1', W1, { date: '2026-03-10', time: '09:30', professionalId: P1 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('schemas', () => {
  it('rejeita ids malformados e datas impossíveis', () => {
    expect(CreateWaitlistSchema.safeParse({ clientId: 'x', serviceId: S1, period: 'qualquer' }).success).toBe(false);
    expect(CreateWaitlistSchema.safeParse({ clientId: C1, serviceId: S1, period: 'qualquer', desiredDate: '2026-02-31' }).success).toBe(false);
    expect(CreateWaitlistSchema.safeParse({ clientId: C1, serviceId: S1, period: 'qualquer', desiredDate: '2026-02-20' }).success).toBe(true);
    expect(OfferSchema.safeParse({ date: '2026-13-01', time: '09:00' }).success).toBe(false);
    expect(OfferSchema.safeParse({ date: '2026-03-01', time: '25:00' }).success).toBe(false);
    expect(OfferSchema.safeParse({ date: '2026-03-01', time: '09:00' }).success).toBe(true);
    expect(BookedSchema.safeParse({ appointmentId: 'abc' }).success).toBe(false);
    expect(ListQuerySchema.safeParse({ status: 'foo' }).success).toBe(false);
    expect(UpdateWaitlistSchema.safeParse({ status: 'agendada' }).success).toBe(false);
    expect(UpdateWaitlistSchema.safeParse({ status: 'cancelada' }).success).toBe(true);
  });
});
