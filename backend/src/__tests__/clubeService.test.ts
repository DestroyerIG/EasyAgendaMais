import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// O mesmo objeto faz o papel do prisma e da transação.
const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  appointment: { findFirst: vi.fn() },
  clubeContrato: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
  clubeCobranca: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  clubeUso: { create: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const repo = vi.hoisted(() => ({
  data: (d: string) => new Date(`${d}T00:00:00Z`),
  transacao: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
  travarContrato: vi.fn(), travarAdesao: vi.fn(),
  buscarOferta: vi.fn(), temContratoVigente: vi.fn(), negocioParaPix: vi.fn(), sessaoDeCaixa: vi.fn(),
  buscarContrato: vi.fn(), usosNoCiclo: vi.fn(), buscarCobranca: vi.fn(), paraCobertura: vi.fn(),
  negociosComContratos: vi.fn(), clubesARenovar: vi.fn(), marcarAtraso: vi.fn(), expirarPacotes: vi.fn(), adesoesVencidas: vi.fn(),
  pendenteDoContrato: vi.fn(),
}));
vi.mock('../modules/clube/clube.repository.js', () => ({ clubeRepository: repo, POR_PAGINA: 20 }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn().mockResolvedValue([]) }));
vi.mock('../modules/whatsappFila/fila.service.js', () => ({ filaEnvios: fila }));
const notif = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const pub = vi.hoisted(() => ({ findOrCreateClient: vi.fn(), registrarConsentimento: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({ publicBookingRepository: pub }));

const { clubeService } = await import('../modules/clube/clube.service.js');
const { clubePublicService } = await import('../modules/clube/clube.public.service.js');

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const oferta = (over: Record<string, unknown> = {}) => ({
  id: 'of1', tipo: 'clube', nome: 'Clube Mãos', descricao: null, preco: '149.90', sessoesPorCiclo: 4, sessoesReferencia: 4,
  intervaloMinimoDias: 0, totalSessoes: null, validadeDias: null, faltaDebita: false, descontoExtrasPct: '10', beneficios: [],
  publica: true, status: 'ativa', createdAt: new Date(), servicos: [{ service: { id: 's1', name: 'Manicure' } }], profissionais: [], ...over,
});
const contratoRow = (over: Record<string, unknown> = {}) => ({
  id: 'ct1', tipo: 'clube', status: 'ativo', origem: 'painel', preco: '149.90', valorSessao: '37.47', sessoesPorCiclo: 4,
  intervaloMinimoDias: 0, totalSessoes: null, sessoesUsadas: 0, validadeDias: null, ativadoEm: d('2026-10-15'),
  cicloInicio: d('2026-10-15'), cicloFim: d('2026-11-14'), validoAte: null, cancelaEm: null, canceladoEm: null,
  createdAt: new Date('2026-10-15T12:00:00Z'), ofertaId: 'of1', clientId: 'c1', businessId: 'b1',
  oferta: { id: 'of1', nome: 'Clube Mãos', descontoExtrasPct: '10', faltaDebita: false },
  client: { id: 'c1', name: 'Mariana Souza', phone: '5583999990000' }, cobrancas: [], ...over,
});
const negocio = { id: 'b1', name: 'Studio Aurora', slug: 'studio-aurora', pixKey: 'pix@aurora.com', pixKeyType: 'email', plan: 'premium', subscriptionStatus: 'active' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'));
  repo.transacao.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  repo.negocioParaPix.mockResolvedValue(negocio);
  repo.usosNoCiclo.mockResolvedValue(new Map());
  repo.buscarContrato.mockResolvedValue(contratoRow());
  db.client.findFirst.mockResolvedValue({ id: 'c1' });
  db.clubeContrato.create.mockResolvedValue({ id: 'ct1' });
  db.clubeCobranca.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cb1', ...data }));
  db.clubeCobranca.update.mockResolvedValue({});
});

describe('vender plano ou pacote', () => {
  it('pago na hora (dinheiro) exige caixa aberto e ativa o contrato direto', async () => {
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.temContratoVigente.mockResolvedValue(null);
    repo.sessaoDeCaixa.mockResolvedValue({ id: 'cx1', closedAt: null });
    db.clubeContrato.findUniqueOrThrow.mockResolvedValue({ id: 'ct1', tipo: 'clube', status: 'aguardando_pagamento' });
    await clubeService.vincular('b1', 'u1', { ofertaId: 'of1', clientId: 'c1', pagamento: { forma: 'dinheiro', pago: true } });
    expect(db.clubeContrato.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'aguardando_pagamento', valorSessao: 37.47, sessoesPorCiclo: 4 }) });
    expect(db.clubeCobranca.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'paga', forma: 'dinheiro', cashSessionId: 'cx1', pixCopiaCola: null }) });
    expect(db.clubeContrato.update).toHaveBeenCalledWith({
      where: { id: 'ct1' }, data: { status: 'ativo', ativadoEm: d('2026-10-24'), cicloInicio: d('2026-10-24'), cicloFim: d('2026-11-23') },
    });
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('dinheiro sem caixa aberto é recusado', async () => {
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.temContratoVigente.mockResolvedValue(null);
    repo.sessaoDeCaixa.mockResolvedValue(null);
    await expect(clubeService.vincular('b1', 'u1', { ofertaId: 'of1', clientId: 'c1', pagamento: { forma: 'dinheiro', pago: true } }))
      .rejects.toMatchObject({ code: 'CASH_CLOSED' });
    expect(db.clubeContrato.create).not.toHaveBeenCalled();
  });

  it('Pix a receber deixa aguardando, gera o copia e cola e manda no WhatsApp', async () => {
    repo.buscarOferta.mockResolvedValue(oferta({ tipo: 'pacote', preco: '850.00', sessoesPorCiclo: null, totalSessoes: 10, validadeDias: 90, publica: false }));
    repo.temContratoVigente.mockResolvedValue(null);
    repo.buscarContrato.mockResolvedValue(contratoRow({ tipo: 'pacote', status: 'aguardando_pagamento' }));
    await clubeService.vincular('b1', 'u1', { ofertaId: 'of1', clientId: 'c1', pagamento: { forma: 'pix', pago: false } });
    expect(db.clubeContrato.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'pacote', valorSessao: 85, totalSessoes: 10, validadeDias: 90 }) });
    const cobranca = db.clubeCobranca.create.mock.calls[0]![0].data;
    expect(cobranca).toMatchObject({ valor: '850.00' });
    expect(cobranca.status).toBeUndefined();
    expect(cobranca.pixCopiaCola).toMatch(/^000201/);
    expect(fila.enfileirar).toHaveBeenCalledWith([expect.objectContaining({ origin: 'clube', clientId: 'c1', body: expect.stringContaining(cobranca.pixCopiaCola) })]);
  });

  it('a mesma cliente não pode ter dois contratos vigentes da mesma oferta', async () => {
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.temContratoVigente.mockResolvedValue({ id: 'ct0', status: 'ativo' });
    await expect(clubeService.vincular('b1', 'u1', { ofertaId: 'of1', clientId: 'c1', pagamento: { forma: 'pix', pago: true } }))
      .rejects.toThrow('Esta cliente já tem este plano ativo');
  });

  it('sem chave Pix não cobra por Pix', async () => {
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.negocioParaPix.mockResolvedValue({ ...negocio, pixKey: null });
    await expect(clubeService.vincular('b1', 'u1', { ofertaId: 'of1', clientId: 'c1', pagamento: { forma: 'pix', pago: false } }))
      .rejects.toThrow('Cadastre a chave Pix');
  });
});

describe('confirmar cobrança', () => {
  it('confirmar duas vezes não duplica', async () => {
    repo.buscarCobranca.mockResolvedValue({ id: 'cb1', contratoId: 'ct1', status: 'paga', competencia: d('2026-11-15') });
    await clubeService.confirmarCobranca('b1', 'u1', 'cb1', 'pix');
    expect(db.clubeCobranca.updateMany).not.toHaveBeenCalled();
    expect(db.clubeContrato.update).not.toHaveBeenCalled();
  });

  it('pagamento do ciclo seguinte reabre o clube em atraso a partir do vencimento original', async () => {
    repo.buscarCobranca.mockResolvedValue({ id: 'cb2', contratoId: 'ct1', status: 'pendente', competencia: d('2026-10-15') });
    repo.sessaoDeCaixa.mockResolvedValue(null);
    db.clubeCobranca.updateMany.mockResolvedValue({ count: 1 });
    db.clubeContrato.findUniqueOrThrow.mockResolvedValue({
      id: 'ct1', tipo: 'clube', status: 'em_atraso', ativadoEm: d('2026-09-15'), cicloInicio: d('2026-09-15'), cicloFim: d('2026-10-14'),
    });
    await clubeService.confirmarCobranca('b1', 'u1', 'cb2', 'pix');
    expect(db.clubeCobranca.updateMany).toHaveBeenCalledWith({
      where: { id: 'cb2', status: 'pendente' }, data: expect.objectContaining({ status: 'paga', forma: 'pix', cashSessionId: null }),
    });
    expect(db.clubeContrato.update).toHaveBeenCalledWith({
      where: { id: 'ct1' }, data: { status: 'ativo', cicloInicio: d('2026-10-15'), cicloFim: d('2026-11-14') },
    });
  });

  it('cobrança cancelada não pode ser confirmada', async () => {
    repo.buscarCobranca.mockResolvedValue({ id: 'cb1', contratoId: 'ct1', status: 'cancelada', competencia: d('2026-10-24') });
    await expect(clubeService.confirmarCobranca('b1', 'u1', 'cb1', 'pix')).rejects.toThrow('Esta cobrança foi cancelada');
  });
});

describe('cancelar', () => {
  it('clube pago vale até o fim do ciclo e as cobranças pendentes caem', async () => {
    await clubeService.cancelar('b1', 'ct1');
    expect(db.clubeContrato.update).toHaveBeenCalledWith({
      where: { id: 'ct1' }, data: { status: 'cancelado', canceladoEm: expect.any(Date), cancelaEm: d('2026-11-14') },
    });
    expect(db.clubeCobranca.updateMany).toHaveBeenCalledWith({ where: { contratoId: 'ct1', status: 'pendente' }, data: { status: 'cancelada' } });
  });

  it('pacote encerra hoje', async () => {
    repo.buscarContrato.mockResolvedValue(contratoRow({ tipo: 'pacote', cicloInicio: null, cicloFim: null }));
    await clubeService.cancelar('b1', 'ct1');
    expect(db.clubeContrato.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelaEm: d('2026-10-24') }) }));
  });
});

describe('rotina', () => {
  beforeEach(() => {
    repo.negociosComContratos.mockResolvedValue([{ businessId: 'b1' }]);
    repo.clubesARenovar.mockResolvedValue([]);
    repo.marcarAtraso.mockResolvedValue([]);
    repo.expirarPacotes.mockResolvedValue(0);
    repo.adesoesVencidas.mockResolvedValue([]);
  });

  it('gera a cobrança do ciclo seguinte 3 dias antes e só uma vez', async () => {
    repo.clubesARenovar.mockResolvedValue([contratoRow({ cicloFim: d('2026-10-26') })]);
    const r1 = await clubeService.rotina();
    expect(repo.clubesARenovar).toHaveBeenCalledWith('b1', '2026-10-27');
    expect(db.clubeCobranca.create).toHaveBeenCalledWith({ data: expect.objectContaining({ competencia: d('2026-10-27'), vencimento: d('2026-10-27') }) });
    expect(fila.enfileirar).toHaveBeenCalledTimes(1);
    expect(r1.cobrancas).toBe(1);

    db.clubeCobranca.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    const r2 = await clubeService.rotina();
    expect(r2.cobrancas).toBe(0);
    expect(fila.enfileirar).toHaveBeenCalledTimes(1);
  });

  it('marca atraso depois do dia do vencimento e avisa no sino', async () => {
    repo.marcarAtraso.mockResolvedValue([{ id: 'ct1', cicloFim: d('2026-10-22'), client: { name: 'Mariana' }, oferta: { nome: 'Clube Mãos' } }]);
    db.clubeContrato.updateMany.mockResolvedValue({ count: 1 });
    const r = await clubeService.rotina();
    expect(repo.marcarAtraso).toHaveBeenCalledWith('b1', '2026-10-23');
    expect(db.clubeContrato.updateMany).toHaveBeenCalledWith({ where: { id: 'ct1', status: 'ativo' }, data: { status: 'em_atraso' } });
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'clube_atraso' }));
    expect(r.atrasos).toBe(1);
  });
});

describe('uso da sessão', () => {
  const cobertura = (over: Record<string, unknown> = {}) => ({
    id: 'pk1', tipo: 'pacote', status: 'ativo', nome: 'Pacote Fibra', valorSessao: 85, sessoesPorCiclo: null, totalSessoes: 10,
    sessoesUsadas: 0, intervaloMinimoDias: 0, cicloInicio: null, cicloFim: null, validoAte: '2027-04-20',
    servicos: ['s1'], profissionais: [], usosNoCiclo: 0, ultimoUso: null, descontoExtrasPct: 0, validadeDias: 90, ...over,
  });
  const alvo = { clientId: 'c1', serviceId: 's1', professionalId: 'p1', data: '2026-10-24', comandaItemId: 'i1', appointmentId: 'a1', motivo: 'atendimento' as const };

  it('primeira sessão do pacote grava o uso e fixa a validade a partir dela', async () => {
    repo.paraCobertura.mockResolvedValue([cobertura()]);
    await clubeService.gravarUso(db as never, 'b1', 'pk1', alvo);
    expect(repo.travarContrato).toHaveBeenCalledWith(db, 'pk1');
    expect(db.clubeUso.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contratoId: 'pk1', comandaItemId: 'i1', valorSessao: 85, motivo: 'atendimento' }) });
    expect(db.clubeContrato.update).toHaveBeenCalledWith({ where: { id: 'pk1' }, data: { sessoesUsadas: 1, validoAte: d('2027-01-21') } });
  });

  it('última sessão conclui o pacote', async () => {
    repo.paraCobertura.mockResolvedValue([cobertura({ sessoesUsadas: 9 })]);
    await clubeService.gravarUso(db as never, 'b1', 'pk1', alvo);
    expect(db.clubeContrato.update).toHaveBeenCalledWith({ where: { id: 'pk1' }, data: { sessoesUsadas: 10, status: 'concluido' } });
  });

  it('cobertura que deixou de valer derruba o fechamento', async () => {
    repo.paraCobertura.mockResolvedValue([cobertura({ sessoesUsadas: 10 })]);
    await expect(clubeService.gravarUso(db as never, 'b1', 'pk1', alvo)).rejects.toThrow('A sessão não pode ser debitada: Pacote sem saldo');
    expect(db.clubeUso.create).not.toHaveBeenCalled();
  });

  it('falta debita só com "falta debita" e um contrato válido', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: 'a1', clientId: 'c1', serviceId: 's1', professionalId: 'p1', date: d('2026-10-24') });
    repo.paraCobertura.mockResolvedValue([cobertura()]);
    await clubeService.aoFaltar('b1', 'a1');
    expect(repo.paraCobertura).toHaveBeenCalledWith(db, 'b1', 'c1', { faltaDebita: true });
    expect(db.clubeUso.create).toHaveBeenCalledWith({ data: expect.objectContaining({ motivo: 'falta', comandaItemId: null, appointmentId: 'a1' }) });

    vi.clearAllMocks();
    repo.transacao.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    db.appointment.findFirst.mockResolvedValue({ id: 'a1', clientId: 'c1', serviceId: 's1', professionalId: 'p1', date: d('2026-10-24') });
    repo.paraCobertura.mockResolvedValue([]);
    expect(await clubeService.aoFaltar('b1', 'a1')).toBeNull();
    expect(db.clubeUso.create).not.toHaveBeenCalled();
  });
});

describe('adesão pública', () => {
  beforeEach(() => {
    db.client.findFirst.mockResolvedValue(null);
    pub.findOrCreateClient.mockResolvedValue({ id: 'c1' });
  });
  const negocioSlug = { id: 'b1', name: 'Studio Aurora', slug: 'studio-aurora', logoUrl: null, brandColor: null, pixKey: 'pix@aurora.com', pixKeyType: 'email', plan: 'premium', subscriptionStatus: 'active' };

  it('cria o contrato aguardando o Pix, avisa o sino e manda o Pix', async () => {
    (db as unknown as { business: unknown }).business = { findFirst: vi.fn().mockResolvedValue(negocioSlug) };
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.temContratoVigente.mockResolvedValue(null);
    repo.buscarContrato.mockResolvedValue(contratoRow({ status: 'aguardando_pagamento', origem: 'publico' }));
    const r = await clubePublicService.aderir('studio-aurora', 'of1', { nome: 'Mariana Souza', telefone: '83999990000', consentimento: true });
    expect(db.clubeContrato.create).toHaveBeenCalledWith({ data: expect.objectContaining({ origem: 'publico', status: 'aguardando_pagamento' }) });
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'clube_adesao' }));
    expect(pub.registrarConsentimento).toHaveBeenCalledWith({ businessId: 'b1', clientId: 'c1' });
    expect(r).toMatchObject({ repetida: false, cobranca: { valor: 149.9 } });
    expect(r.cobranca.pixCopiaCola).toMatch(/^000201/);
  });

  it('segunda tentativa devolve a mesma cobrança, sem novo contrato', async () => {
    (db as unknown as { business: unknown }).business = { findFirst: vi.fn().mockResolvedValue(negocioSlug) };
    repo.buscarOferta.mockResolvedValue(oferta());
    repo.temContratoVigente.mockResolvedValue({ id: 'ct1', status: 'aguardando_pagamento' });
    repo.pendenteDoContrato.mockResolvedValue({ id: 'cb1', valor: '149.90', pixCopiaCola: '000201abc', vencimento: d('2026-10-23') });
    const r = await clubePublicService.aderir('studio-aurora', 'of1', { nome: 'Mariana', telefone: '83999990000', consentimento: true });
    expect(db.clubeContrato.create).not.toHaveBeenCalled();
    expect(notif.notify).not.toHaveBeenCalled();
    expect(r).toMatchObject({ repetida: true, cobranca: { pixCopiaCola: '000201abc', vencimento: '2026-10-23' } });
  });

  it('fora do plano Salão a vitrine fica vazia e a adesão não existe', async () => {
    (db as unknown as { business: unknown }).business = { findFirst: vi.fn().mockResolvedValue({ ...negocioSlug, plan: 'profissional' }) };
    expect((await clubePublicService.vitrine('studio-aurora')).ofertas).toEqual([]);
    await expect(clubePublicService.aderir('studio-aurora', 'of1', { nome: 'Mariana', telefone: '83999990000', consentimento: true }))
      .rejects.toThrow(/não encontrad/);
  });
});
