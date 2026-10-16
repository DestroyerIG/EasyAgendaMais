import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  listarConversas: vi.fn(), contarConversas: vi.fn(), conversaDoNegocio: vi.fn(), atualizarConversa: vi.fn(),
  inserirMensagem: vi.fn(), listarMensagens: vi.fn(), nomeUsuario: vi.fn(), zerarNaoLidas: vi.fn(),
  proximoAgendamento: vi.fn(), clientesComSinalPendente: vi.fn(), clienteBasico: vi.fn(), clientePorTelefone: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const msg = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => msg);
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);
const crm = vi.hoisted(() => ({ crmRepository: { visitasDoCliente: vi.fn() } }));
vi.mock('../modules/crm/crm.repository.js', () => crm);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const sess = vi.hoisted(() => ({ deleteSession: vi.fn() }));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => sess);

const { inboxService } = await import('../modules/whatsappInbox/inbox.service.js');

const DONA = { userId: 'u-dona', role: 'tenant_admin' as const };
const FUNC = { userId: 'u-func', role: 'employee' as const };
const conv = (over: Record<string, unknown> = {}) => ({
  id: 'cv1', businessId: 'b1', phone: '5583999990000', phoneKey: '8399990000', clientId: 'c1', handler: 'bot', status: 'aberta',
  assignedUserId: null, assignedUser: null, client: { id: 'c1', name: 'Maria' }, lastMessageAt: new Date('2026-10-16T13:00:00Z'),
  lastMessagePreview: 'oi', unreadCount: 2, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.conversaDoNegocio.mockResolvedValue(conv());
  repo.atualizarConversa.mockImplementation(async (_id: string, d: object) => conv(d));
  repo.nomeUsuario.mockResolvedValue('Carla');
  repo.inserirMensagem.mockResolvedValue(true);
  repo.clientesComSinalPendente.mockResolvedValue(new Set<string>());
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected' });
  msg.sendWhatsAppMessage.mockResolvedValue(true);
});

describe('listar', () => {
  it('devolve itens, contadores e cursor; marca sinal pendente', async () => {
    repo.listarConversas.mockResolvedValue(Array.from({ length: 31 }, (_, i) => conv({ id: `cv${i}` })));
    repo.contarConversas.mockResolvedValue({ todas: 40, aguardando: 3, bot: 30, finalizadas: 5 });
    repo.clientesComSinalPendente.mockResolvedValue(new Set(['c1']));
    const r = await inboxService.listar('b1', { filtro: 'todas' });
    expect(r.itens).toHaveLength(30);
    expect(r.proximoCursor).toBe('2026-10-16T13:00:00.000Z');
    expect(r.contadores).toEqual({ todas: 40, aguardando: 3, bot: 30, finalizadas: 5 });
    expect(r.itens[0]).toMatchObject({ nome: 'Maria', atendimento: 'bot', naoLidas: 2, sinalPendente: true, telefone: '5583999990000' });
    expect(repo.listarConversas).toHaveBeenCalledWith('b1', 'todas', undefined, 31);
  });
});

describe('enviar', () => {
  it('dona envia numa conversa do robô: assume, envia como manual_painel e zera não lidas', async () => {
    expect(await inboxService.enviar('b1', DONA, 'cv1', 'Oi Maria')).toEqual({ enviado: true });
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ handler: 'humano', assignedUserId: 'u-dona' }));
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ origin: 'painel_evento', body: 'Carla assumiu o atendimento' }));
    expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi Maria', { businessId: 'b1', origin: 'manual_painel', sentByUserId: 'u-dona' });
    expect(repo.zerarNaoLidas).toHaveBeenCalledWith('b1', ['cv1']);
  });
  it('desconectado: 409 e nada é enviado', async () => {
    wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected' });
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 409, message: 'WhatsApp desconectado. Reconecte na aba Conexão.' });
    expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  });
  it('falha do provedor: 502 em pt-BR', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
    msg.sendWhatsAppMessage.mockResolvedValue(false);
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 502, message: 'Não foi possível enviar a mensagem. Tente de novo.' });
  });
  it('conversa de outro negócio: 404', async () => {
    repo.conversaDoNegocio.mockResolvedValue(null);
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 404, message: 'Conversa não encontrada' });
  });
});

describe('permissões da funcionária', () => {
  it('não envia nem assume conversa de outra pessoa', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona', status: 'aberta' }));
    await expect(inboxService.enviar('b1', FUNC, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 403, message: 'Esta conversa está com outra pessoa' });
    await expect(inboxService.assumir('b1', FUNC, 'cv1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(inboxService.devolver('b1', FUNC, 'cv1')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('assume conversa aguardando sem responsável', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', status: 'aguardando' }));
    await inboxService.assumir('b1', FUNC, 'cv1');
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'humano', assignedUserId: 'u-func', status: 'aberta' });
  });
  it('dona pode tudo', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-func' }));
    await expect(inboxService.devolver('b1', DONA, 'cv1')).resolves.toBeTruthy();
  });
});

it('devolver: volta ao robô, registra evento e encerra sessão presa', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
  const r = await inboxService.devolver('b1', DONA, 'cv1');
  expect(r.atendimento).toBe('bot');
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'bot', assignedUserId: null, status: 'aberta' });
  expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ origin: 'painel_evento', body: 'Conversa devolvida ao robô' }));
  expect(sess.deleteSession).toHaveBeenCalledWith('5583999990000', 'b1');
});

it('assumir de novo a própria conversa não repete o evento', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
  await inboxService.assumir('b1', DONA, 'cv1');
  expect(repo.inserirMensagem).not.toHaveBeenCalled();
});

it('detalhe com contexto: fase, LTV, ciclo, últimas 2 visitas e agendamento', async () => {
  repo.clienteBasico.mockResolvedValue({ id: 'c1', name: 'Maria', phone: '(83) 99999-0000', createdAt: new Date('2026-02-01T12:00:00Z'), birthDate: null });
  crm.crmRepository.visitasDoCliente.mockResolvedValue([
    { date: '2026-08-06', receita: 65, servico: 'Spa dos pés', profissional: 'Camila' },
    { date: '2026-08-28', receita: 110, servico: 'Manutenção gel', profissional: 'Camila' },
    { date: '2026-09-18', receita: 130, servico: 'Alongamento', profissional: 'Camila' },
  ]);
  repo.proximoAgendamento.mockResolvedValue({ id: 'a1', data: '2026-10-17', hora: '14:00', status: 'aguardando_pagamento', servico: 'Alongamento em gel', valor: 130, profissional: 'Camila Rocha', sinal: 30, expiraEm: '2026-10-16T15:30:00.000Z' });
  const r = await inboxService.detalhe('b1', 'cv1');
  expect(r.contexto?.ltv).toBe(305);
  expect(r.contexto?.ultimasVisitas).toEqual([
    { data: '2026-09-18', servico: 'Alongamento', valor: 130 },
    { data: '2026-08-28', servico: 'Manutenção gel', valor: 110 },
  ]);
  expect(r.contexto?.agendamento?.status).toBe('aguardando_pagamento');
});

it('detalhe sem cliente: contexto nulo', async () => {
  repo.clientePorTelefone.mockResolvedValue(null);
  repo.conversaDoNegocio.mockResolvedValue(conv({ clientId: null, client: null }));
  expect((await inboxService.detalhe('b1', 'cv1')).contexto).toBeNull();
});

it('detalhe vincula cliente cadastrada depois pelo telefone', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ clientId: null, client: null }));
  repo.clientePorTelefone.mockResolvedValue({ id: 'c9', name: 'Bia' });
  repo.clienteBasico.mockResolvedValue({ id: 'c9', name: 'Bia', phone: '83999990000', createdAt: new Date('2026-10-16T12:00:00Z'), birthDate: null });
  crm.crmRepository.visitasDoCliente.mockResolvedValue([]);
  repo.proximoAgendamento.mockResolvedValue(null);
  const r = await inboxService.detalhe('b1', 'cv1');
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { clientId: 'c9' });
  expect(r.contexto?.cliente.nome).toBe('Bia');
});

it('mensagens em ordem crescente com temMais', async () => {
  repo.listarMensagens.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({
    id: `m${i}`, direction: 'in', origin: 'cliente', body: `t${i}`, mediaType: null, status: 'recebida',
    sentByUser: null, createdAt: new Date(Date.UTC(2026, 9, 16, 12, 0, 51 - i)),
  })));
  const r = await inboxService.mensagens('b1', 'cv1');
  expect(r.temMais).toBe(true);
  expect(r.itens).toHaveLength(50);
  expect(r.itens[0]!.criadaEm < r.itens[49]!.criadaEm).toBe(true);
});
