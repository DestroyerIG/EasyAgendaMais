import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import express from 'express';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));

const repo = vi.hoisted(() => ({
  usuarioProfissional: vi.fn(), profissionalCobra: vi.fn(), agendaDoDia: vi.fn(), clienteDaProfissional: vi.fn(), clientesDela: vi.fn(),
  visitasConcluidas: vi.fn(), visitasComEla: vi.fn(), agendamentoDela: vi.fn(), comandaDela: vi.fn(), reagendar: vi.fn(),
  marcarEnviadaRecepcao: vi.fn(), salvarNota: vi.fn(), extrato: vi.fn(), avaliacoes: vi.fn(), nomeDoNegocio: vi.fn(),
}));
vi.mock('../modules/bancada/bancada.repository.js', () => ({ bancadaRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
}));
const crm = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('../modules/crm/crm.service.js', () => ({ crmService: crm }));
const fotos = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn() }));
vi.mock('../modules/clientPhotos/clientPhotos.service.js', () => ({ clientPhotosService: fotos }));
const comandas = vi.hoisted(() => ({ open: vi.fn(), get: vi.fn(), save: vi.fn(), close: vi.fn(), shortcuts: vi.fn(), gerarPix: vi.fn() }));
vi.mock('../modules/comandas/comandas.service.js', () => ({ comandasService: comandas }));
const cobrancaSaldo = vi.hoisted(() => ({ criar: vi.fn(), estado: vi.fn(), cancelar: vi.fn() }));
vi.mock('../modules/recebimentos/cobrancaSaldo.service.js', () => ({ cobrancaSaldoService: cobrancaSaldo }));
const appts = vi.hoisted(() => ({ updateStatus: vi.fn(), getAvailableSlots: vi.fn() }));
vi.mock('../modules/appointments/appointments.service.js', () => ({ appointmentsService: appts }));
const apptRepo = vi.hoisted(() => ({ hasConflict: vi.fn() }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: apptRepo }));
const notif = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn().mockResolvedValue([]) }));
vi.mock('../modules/whatsappFila/fila.service.js', () => ({ filaEnvios: fila }));
const comissoes = vi.hoisted(() => ({ apuracao: vi.fn() }));
vi.mock('../modules/reports/comissoes.service.js', () => ({ comissoesService: comissoes }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u9', businessId: 'b1', role: req.header('x-role') ?? 'professional',
      plan: req.header('x-plan') ?? 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));

const rules = await import('../modules/bancada/bancada.rules.js');
const { bancadaService } = await import('../modules/bancada/bancada.service.js');
const { AppError } = await import('../utils/errors.js');
const bancadaRoutes = (await import('../modules/bancada/bancada.routes.js')).default;
const comandaRoutes = (await import('../modules/comandas/comandas.routes.js')).default;
const cashRoutes = (await import('../modules/cash/cash.routes.js')).default;
const reportsRoutes = (await import('../modules/reports/reports.routes.js')).default;
const appointmentRoutes = (await import('../modules/appointments/appointments.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/bancada', bancadaRoutes);
app.use('/api/v1/comandas', comandaRoutes);
app.use('/api/v1/cash', cashRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const P = { id: 'p1', nome: 'Ana Lima' };
const usuarioOk = { blocked: false, businessId: 'b1', professional: { id: 'p1', name: 'Ana Lima', active: true, businessId: 'b1' } };
const agendamento = (over: Record<string, unknown> = {}) => ({
  id: ID, status: 'confirmado', date: '2026-10-26', time: '10:00', clientId: 'c1', serviceId: 's1',
  client: { name: 'Mariana Souza', phone: '5583999990000' }, service: { name: 'Manicure' }, ...over,
});
const comandaDto = (over: Record<string, unknown> = {}) => ({
  id: 'k1', number: 12, discount: 5, tip: 0, paymentMethod: null,
  client: { name: 'Mariana Souza' }, appointment: { id: ID }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00-03:00'));
  repo.usuarioProfissional.mockResolvedValue(usuarioOk);
  repo.nomeDoNegocio.mockResolvedValue('Studio Aurora');
  repo.profissionalCobra.mockResolvedValue(false);
  notif.notify.mockResolvedValue(undefined);
  fila.enfileirar.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('regras da bancada', () => {
  it('destaque: em atendimento, senão a próxima a partir de agora', () => {
    const agenda = [
      { id: 'a', time: '09:00', status: 'concluido' },
      { id: 'b', time: '13:00', status: 'confirmado' },
      { id: 'c', time: '11:00', status: 'confirmado' },
    ];
    expect(rules.escolherProxima(agenda, '10:30')?.id).toBe('c');
    expect(rules.escolherProxima([...agenda, { id: 'd', time: '08:00', status: 'em_atendimento' }], '10:30')?.id).toBe('d');
    expect(rules.escolherProxima(agenda, '14:00')).toBeNull();
    expect(rules.minutosAte('11:00', '10:40')).toBe(20);
  });

  it('reagendar só confirmado e que não passou; cancelar também aguardando sinal', () => {
    expect(rules.motivoParaNaoReagendar({ status: 'confirmado', date: '2026-10-26', time: '10:00' }, '2026-10-25', '12:00')).toBeNull();
    expect(rules.motivoParaNaoReagendar({ status: 'aguardando_pagamento', date: '2026-10-26', time: '10:00' }, '2026-10-25', '12:00')).not.toBeNull();
    expect(rules.motivoParaNaoReagendar({ status: 'confirmado', date: '2026-10-25', time: '11:00' }, '2026-10-25', '12:00')).toBe('Este horário já passou');
    expect(rules.motivoParaNaoCancelar({ status: 'aguardando_pagamento', date: '2026-10-25', time: '08:00' }, '2026-10-25')).toBeNull();
    expect(rules.motivoParaNaoCancelar({ status: 'concluido', date: '2026-10-26', time: '08:00' }, '2026-10-25')).not.toBeNull();
    expect(rules.motivoParaNaoCancelar({ status: 'confirmado', date: '2026-10-24', time: '08:00' }, '2026-10-25')).not.toBeNull();
    expect(rules.novoHorarioValido('2026-10-25', '12:00', '2026-10-25', '12:00')).not.toBeNull();
    expect(rules.novoHorarioValido('2026-10-25', '12:30', '2026-10-25', '12:00')).toBeNull();
  });

  it('a parte dela: comissões e a gorjeta inteira, sem erro de centavo', () => {
    expect(rules.parteDaProfissional([
      { kind: 'servico', commissionAmount: 16.1 }, { kind: 'servico', commissionAmount: 0.2 }, { kind: 'produto', commissionAmount: 3.35 },
    ], 10)).toEqual({ servico: 16.3, produto: 3.35, gorjeta: 10, total: 29.65 });
    expect(rules.resumoAvaliacoes([])).toEqual({ media: null, quantidade: 0 });
    expect(rules.resumoAvaliacoes([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({ media: 4.3, quantidade: 3 });
  });

  it('textos para a cliente', () => {
    const d = { cliente: 'Mariana Souza', negocio: 'Studio Aurora', servico: 'Manicure', data: '2026-10-27', hora: '15:00' };
    expect(rules.textoReagendado(d)).toBe('Olá, Mariana! Seu horário de Manicure no Studio Aurora mudou para 27/10 às 15:00. Se não puder, é só responder esta mensagem.');
    expect(rules.textoCancelado(d)).toContain('27/10 às 15:00 foi cancelado');
  });
});

describe('bancadaService', () => {
  it('reagendar: confere conflito, avisa a dona e a cliente pela fila', async () => {
    repo.agendamentoDela.mockResolvedValue(agendamento());
    apptRepo.hasConflict.mockResolvedValue(false);
    repo.reagendar.mockResolvedValue(true);
    const r = await bancadaService.reagendar('b1', P, ID, { data: '2026-10-27', hora: '15:00', avisarCliente: true });
    expect(apptRepo.hasConflict).toHaveBeenCalledWith('b1', 'p1', '2026-10-27', '15:00:00', ID);
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'agenda_profissional', title: 'Ana reagendou Mariana' }));
    expect(fila.enfileirar).toHaveBeenCalledWith([expect.objectContaining({ origin: 'painel_evento', appointmentId: ID, phone: '5583999990000' })]);
    expect(r).toEqual({ data: '2026-10-27', hora: '15:00', avisoEnviado: true });
  });

  it('reagendar sem avisar a cliente, e bloqueios', async () => {
    repo.agendamentoDela.mockResolvedValue(agendamento());
    apptRepo.hasConflict.mockResolvedValue(false);
    repo.reagendar.mockResolvedValue(true);
    expect((await bancadaService.reagendar('b1', P, ID, { data: '2026-10-27', hora: '15:00', avisarCliente: false })).avisoEnviado).toBe(false);
    expect(fila.enfileirar).not.toHaveBeenCalled();

    apptRepo.hasConflict.mockResolvedValue(true);
    await expect(bancadaService.reagendar('b1', P, ID, { data: '2026-10-27', hora: '15:00', avisarCliente: true })).rejects.toMatchObject({ statusCode: 409 });
    apptRepo.hasConflict.mockResolvedValue(false);
    repo.reagendar.mockResolvedValue(false);
    await expect(bancadaService.reagendar('b1', P, ID, { data: '2026-10-27', hora: '15:00', avisarCliente: true })).rejects.toMatchObject({ statusCode: 409 });
    await expect(bancadaService.reagendar('b1', P, ID, { data: '2026-10-24', hora: '15:00', avisarCliente: true })).rejects.toMatchObject({ statusCode: 409 });
    repo.agendamentoDela.mockResolvedValue(null);
    await expect(bancadaService.reagendar('b1', P, ID, { data: '2026-10-27', hora: '15:00', avisarCliente: true })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('cancelar usa a mesma transição do painel, marcada como da profissional', async () => {
    repo.agendamentoDela.mockResolvedValue(agendamento());
    appts.updateStatus.mockResolvedValue({});
    const r = await bancadaService.cancelar('b1', P, ID, { motivo: 'Imprevisto da profissional', avisarCliente: true });
    expect(appts.updateStatus).toHaveBeenCalledWith(ID, 'b1', 'cancelado', { porProfissional: true });
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ title: 'Ana cancelou Mariana' }));
    expect(r).toEqual({ cancelado: true, avisoEnviado: true });
  });

  it('fila fora do ar: cancela mesmo assim e diz que o aviso não saiu', async () => {
    repo.agendamentoDela.mockResolvedValue(agendamento());
    fila.enfileirar.mockRejectedValue(new Error('fora'));
    expect(await bancadaService.cancelar('b1', P, ID, { motivo: 'Outro', avisarCliente: true })).toEqual({ cancelado: true, avisoEnviado: false });
  });

  it('sem a chave: desconto, gorjeta e forma ficam como a recepção deixou', async () => {
    repo.comandaDela.mockResolvedValue({ id: 'k1' });
    comandas.get.mockResolvedValue(comandaDto({ discount: 5, tip: 2, paymentMethod: 'pix' }));
    comandas.save.mockResolvedValue(comandaDto());
    await bancadaService.salvarComanda('b1', P, 'k1', { extras: [], discount: 50, tip: 30, paymentMethod: 'dinheiro' });
    expect(comandas.save).toHaveBeenCalledWith('k1', 'b1', { extras: [], discount: 5, tip: 2, paymentMethod: 'pix' });

    repo.profissionalCobra.mockResolvedValue(true);
    await bancadaService.salvarComanda('b1', P, 'k1', { extras: [], discount: 50, tip: 30, paymentMethod: 'dinheiro' });
    expect(comandas.save).toHaveBeenLastCalledWith('k1', 'b1', { extras: [], discount: 50, tip: 30, paymentMethod: 'dinheiro' });
  });

  it('enviar para a recepção marca a comanda e toca o sino com o link do caixa', async () => {
    repo.comandaDela.mockResolvedValue({ id: 'k1' });
    comandas.get.mockResolvedValue(comandaDto());
    comandas.save.mockResolvedValue(comandaDto());
    await bancadaService.enviarParaRecepcao('b1', P, 'k1', { extras: [] });
    expect(repo.marcarEnviadaRecepcao).toHaveBeenCalledWith('k1');
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'comanda_pronta', link: `/financeiro?comanda=${ID}` }));
  });

  it('fechar: só com a chave; caixa fechado vira recado para a recepção', async () => {
    repo.comandaDela.mockResolvedValue({ id: 'k1' });
    await expect(bancadaService.fecharComanda('b1', 'u9', P, 'k1', { extras: [] })).rejects.toMatchObject({ statusCode: 403 });
    expect(comandas.close).not.toHaveBeenCalled();

    repo.profissionalCobra.mockResolvedValue(true);
    comandas.get.mockResolvedValue(comandaDto());
    comandas.close.mockRejectedValue(new AppError('Abra o caixa', 409, 'CASH_CLOSED'));
    await expect(bancadaService.fecharComanda('b1', 'u9', P, 'k1', { extras: [], paymentMethod: 'pix' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'CASH_CLOSED', message: expect.stringContaining('Peça para a recepção abrir') });
  });

  it('Pix do saldo: só com a chave "a profissional cobra", na chave e nos recebimentos do negócio', async () => {
    repo.comandaDela.mockResolvedValue({ id: 'k1' });
    await expect(bancadaService.gerarPix('b1', P, 'k1', { extras: [] })).rejects.toMatchObject({ statusCode: 403 });
    expect(comandas.gerarPix).not.toHaveBeenCalled();

    repo.profissionalCobra.mockResolvedValue(true);
    comandas.get.mockResolvedValue(comandaDto({ discount: 5, tip: 2 }));
    comandas.gerarPix.mockResolvedValue({ pixPayload: 'PIX', valor: 75 });
    const r = await bancadaService.gerarPix('b1', P, 'k1', { extras: [], discount: 10 });
    expect(r).toEqual({ pixPayload: 'PIX', valor: 75 });
    expect(comandas.gerarPix).toHaveBeenCalledWith('k1', 'b1', { extras: [], discount: 10, tip: 2 });
  });

  it('Pix do saldo de comanda de outra profissional: 404', async () => {
    repo.comandaDela.mockResolvedValue(null);
    await expect(bancadaService.gerarPix('b1', P, 'k9', { extras: [] })).rejects.toMatchObject({ statusCode: 404 });
    expect(comandas.gerarPix).not.toHaveBeenCalled();
  });

  it('ficha de outra profissional: 404; a dela esconde e-mail e nascimento', async () => {
    repo.clienteDaProfissional.mockResolvedValue(false);
    await expect(bancadaService.ficha('b1', P, 'c1')).rejects.toMatchObject({ statusCode: 404 });
    repo.clienteDaProfissional.mockResolvedValue(true);
    crm.profile.mockResolvedValue({
      cliente: { id: 'c1', name: 'Mariana', email: 'm@x.com', birthDate: '1990-01-01', phone: '55' },
      fase: 'recorrente', etiquetas: [], etiquetasAuto: [], indicadores: { ticketMedio: 80, cicloMedio: 21, faturamento: 999 },
      fichaTecnica: { allergies: null, fields: {}, customFields: [], campos: [] },
    });
    fotos.list.mockResolvedValue([]);
    repo.visitasComEla.mockResolvedValue([]);
    repo.visitasConcluidas.mockResolvedValue(4);
    const f = await bancadaService.ficha('b1', P, 'c1');
    expect(f.cliente).not.toHaveProperty('email');
    expect(f.cliente).not.toHaveProperty('birthDate');
    expect(f.indicadores).toEqual({ visitas: 4, ticketMedio: 80, cicloMedio: 21 });
  });

  it('meus números: só a linha dela e nada da casa', async () => {
    comissoes.apuracao.mockResolvedValue({
      modelo: 'comissao',
      totais: { faturamento: 9000 },
      itens: [
        { professional: { id: 'p2' }, atendimentos: 9, faturamento: 900 },
        { professional: { id: 'p1' }, atendimentos: 3, faturamento: 300, comissaoServico: 120, comissaoProduto: 6, gorjetas: 10, adiantamentos: 0, aPagar: 136, status: 'a_pagar', repasse: null },
      ],
    });
    repo.extrato.mockResolvedValue([{ id: 'k1', numero: 1, fechadaEm: '2026-10-20', hora: '10:00', cliente: 'Mariana', pago: 100, gorjeta: 10, itens: [{ kind: 'servico', descricao: 'Manicure', commissionAmount: 40 }] }]);
    repo.avaliacoes.mockResolvedValue([{ nota: 5 }, { nota: 4 }]);
    const r = await bancadaService.numeros('b1', P, { inicio: '2026-10-16', fim: '2026-10-31' }, {});
    expect(r.resumo).toMatchObject({ atendimentos: 3, aPagar: 136 });
    expect(r).not.toHaveProperty('totais');
    expect(r.extrato[0]!.itens[0]).not.toHaveProperty('commissionAmount');
    expect(r.extrato[0]!.parte).toEqual({ servico: 40, produto: 0, gorjeta: 10, total: 50 });
    expect(r.avaliacoes).toEqual({ media: 4.5, quantidade: 2 });
  });
});

describe('isolamento do app da profissional', () => {
  it('a profissional não entra no painel', async () => {
    for (const rota of ['/api/v1/comandas/settings', '/api/v1/cash/today', '/api/v1/reports/overview', '/api/v1/appointments']) {
      expect((await request.get(rota)).status, rota).toBe(403);
    }
  });

  it('dona e recepção não entram na bancada', async () => {
    expect((await request.get('/api/v1/bancada/hoje').set('x-role', 'tenant_admin')).status).toBe(403);
    expect((await request.get('/api/v1/bancada/hoje').set('x-role', 'employee')).status).toBe(403);
    expect(repo.usuarioProfissional).not.toHaveBeenCalled();
  });

  it('plano Solo: 403', async () => {
    expect((await request.get('/api/v1/bancada/hoje').set('x-plan', 'basico')).status).toBe(403);
  });

  it('acesso removido, profissional desativada ou de outro negócio: 403 na hora', async () => {
    for (const u of [
      { ...usuarioOk, blocked: true },
      { ...usuarioOk, professional: { ...usuarioOk.professional, active: false } },
      { ...usuarioOk, professional: { ...usuarioOk.professional, businessId: 'b2' } },
      { ...usuarioOk, professional: null },
      null,
    ]) {
      repo.usuarioProfissional.mockResolvedValueOnce(u);
      expect((await request.get('/api/v1/bancada/hoje')).status).toBe(403);
    }
  });

  it('a ficha de cliente de outra profissional: 404', async () => {
    repo.clienteDaProfissional.mockResolvedValue(false);
    const r = await request.get(`/api/v1/bancada/clientes/${ID}`);
    expect(r.status).toBe(404);
    expect(repo.clienteDaProfissional).toHaveBeenCalledWith('b1', 'p1', ID);
  });

  it('valida o corpo do reagendar e do cancelar', async () => {
    expect((await request.post(`/api/v1/bancada/agendamentos/${ID}/reagendar`).send({ data: '27/10', hora: '15:00' })).status).toBe(400);
    expect((await request.post(`/api/v1/bancada/agendamentos/${ID}/cancelar`).send({ motivo: '' })).status).toBe(400);
  });
});

describe('agenda de outro dia e lista de clientes', () => {
  it('outro dia: agenda dela, sem cliente em destaque', async () => {
    repo.agendaDoDia.mockResolvedValue([{ id: 'a', time: '13:00', status: 'confirmado', cliente: { id: 'c1' } }]);
    const r = await bancadaService.hoje('b1', P, '2026-10-27');
    expect(repo.agendaDoDia).toHaveBeenCalledWith('b1', 'p1', '2026-10-27');
    expect(r).toMatchObject({ data: '2026-10-27', hoje: '2026-10-25', destaque: null });
    expect(crm.profile).not.toHaveBeenCalled();
  });

  it('clientes: sempre filtradas pela profissional do login', async () => {
    repo.clientesDela.mockResolvedValue([]);
    expect((await request.get('/api/v1/bancada/clientes?busca=mari')).status).toBe(200);
    expect(repo.clientesDela).toHaveBeenCalledWith('b1', 'p1', 'mari');
    expect((await request.get('/api/v1/bancada/hoje?data=amanha')).status).toBe(400);
  });
});

describe('cobrança do saldo na bancada', () => {
  beforeEach(() => {
    repo.usuarioProfissional.mockResolvedValue(usuarioOk);
    repo.comandaDela.mockResolvedValue({ id: 'k1' });
    comandas.get.mockResolvedValue(comandaDto({ discount: 5, tip: 2 }));
    cobrancaSaldo.criar.mockResolvedValue({ id: 'c1', via: 'pix', situacao: 'pendente', valor: 75 });
    cobrancaSaldo.estado.mockResolvedValue({ gateway: 'mercadopago', cobranca: null });
    cobrancaSaldo.cancelar.mockResolvedValue({ gateway: 'mercadopago', cobranca: null });
  });

  it('só com a chave "a profissional cobra": sem ela, 403 e nada é cobrado', async () => {
    await expect(bancadaService.cobrar('b1', 'u9', P, 'k1', { extras: [], via: 'pix' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(bancadaService.cobranca('b1', P, 'k1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(bancadaService.cancelarCobranca('b1', P, 'k1')).rejects.toMatchObject({ statusCode: 403 });
    expect(cobrancaSaldo.criar).not.toHaveBeenCalled();
    expect(cobrancaSaldo.cancelar).not.toHaveBeenCalled();
  });

  it('com a chave: cobra no gateway do negócio, mesclando desconto e gorjeta como no Pix da Fase 1', async () => {
    repo.profissionalCobra.mockResolvedValue(true);
    const r = await bancadaService.cobrar('b1', 'u9', P, 'k1', { extras: [], discount: 10, via: 'pix' });
    expect(r).toMatchObject({ id: 'c1' });
    expect(cobrancaSaldo.criar).toHaveBeenCalledWith('k1', 'b1', 'u9', { extras: [], discount: 10, tip: 2 });
  });

  it('comanda de outra profissional: 404 em todas as três', async () => {
    repo.profissionalCobra.mockResolvedValue(true);
    repo.comandaDela.mockResolvedValue(null);
    await expect(bancadaService.cobrar('b1', 'u9', P, 'k9', { extras: [], via: 'pix' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(bancadaService.cobranca('b1', P, 'k9')).rejects.toMatchObject({ statusCode: 404 });
    await expect(bancadaService.cancelarCobranca('b1', P, 'k9')).rejects.toMatchObject({ statusCode: 404 });
    expect(cobrancaSaldo.criar).not.toHaveBeenCalled();
  });

  it('com a chave: consulta e cancela pela comanda dela', async () => {
    repo.profissionalCobra.mockResolvedValue(true);
    expect(await bancadaService.cobranca('b1', P, 'k1')).toEqual({ gateway: 'mercadopago', cobranca: null });
    await bancadaService.cancelarCobranca('b1', P, 'k1');
    expect(cobrancaSaldo.cancelar).toHaveBeenCalledWith('k1', 'b1');
  });

  it('rota da profissional: aceita via pix e recusa outra via', async () => {
    repo.profissionalCobra.mockResolvedValue(true);
    const ok = await request.post(`/api/v1/bancada/comandas/${ID}/cobranca`).send({ extras: [], via: 'pix' });
    expect(ok.status).toBe(200);
    const ruim = await request.post(`/api/v1/bancada/comandas/${ID}/cobranca`).send({ extras: [], via: 'link' });
    expect(ruim.status).toBe(400);
  });
});

describe('cobrança do saldo no painel', () => {
  beforeEach(() => {
    cobrancaSaldo.criar.mockResolvedValue({ id: 'c1', via: 'pix', situacao: 'pendente', valor: 80 });
    cobrancaSaldo.estado.mockResolvedValue({ gateway: null, cobranca: null });
    cobrancaSaldo.cancelar.mockResolvedValue({ gateway: null, cobranca: null });
  });

  it('as três rotas usam o negócio e o usuário do login', async () => {
    const corpo = { extras: [], discount: 0, tip: 0, via: 'pix' };
    const criar = await request.post(`/api/v1/comandas/${ID}/cobranca`).set('x-role', 'tenant_admin').send(corpo);
    expect(criar.status).toBe(200);
    expect(cobrancaSaldo.criar).toHaveBeenCalledWith(ID, 'b1', 'u9', { extras: [], discount: 0, tip: 0 });
    expect((await request.get(`/api/v1/comandas/${ID}/cobranca`).set('x-role', 'tenant_admin')).status).toBe(200);
    expect(cobrancaSaldo.estado).toHaveBeenCalledWith(ID, 'b1');
    expect((await request.post(`/api/v1/comandas/${ID}/cobranca/cancelar`).set('x-role', 'tenant_admin')).status).toBe(200);
    expect(cobrancaSaldo.cancelar).toHaveBeenCalledWith(ID, 'b1');
  });

  it('via diferente de pix: 400', async () => {
    const r = await request.post(`/api/v1/comandas/${ID}/cobranca`).set('x-role', 'tenant_admin').send({ extras: [], discount: 0, tip: 0, via: 'link' });
    expect(r.status).toBe(400);
    expect(cobrancaSaldo.criar).not.toHaveBeenCalled();
  });

  it('a profissional não entra nas rotas do painel', async () => {
    expect((await request.post(`/api/v1/comandas/${ID}/cobranca`).send({ extras: [], discount: 0, tip: 0, via: 'pix' })).status).toBe(403);
    expect((await request.get(`/api/v1/comandas/${ID}/cobranca`)).status).toBe(403);
  });
});
