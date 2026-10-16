import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  conversasHumanasParadas: vi.fn(), atualizarConversa: vi.fn(), inserirMensagem: vi.fn(),
  finalizarConversasDoRobo: vi.fn(), apagarMensagensAntigas: vi.fn(), apagarConversasVazias: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const recorder = vi.hoisted(() => ({ atualizarEntrega: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));
const tenant = vi.hoisted(() => ({ resolveTenant: vi.fn() }));
vi.mock('../services/whatsapp/tenant/tenantResolver.js', () => tenant);
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { inboxCron } = await import('../modules/whatsappInbox/inbox.cron.js');
const { handleMessagesUpdate } = await import('../services/whatsapp/handlers/messagesUpdateHandler.js');

const AGORA = new Date('2026-10-16T15:00:00.000Z');
beforeEach(() => { vi.clearAllMocks(); repo.inserirMensagem.mockResolvedValue(true); });

it('volta ao robô após 12 h sem mensagem e registra o evento', async () => {
  repo.conversasHumanasParadas.mockResolvedValue([{ id: 'cv1', businessId: 'b1', phoneKey: '8399990000' }]);
  expect(await inboxCron.voltarAoRoboPorInatividade(AGORA)).toBe(1);
  expect(repo.conversasHumanasParadas).toHaveBeenCalledWith(new Date('2026-10-16T03:00:00.000Z'));
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'bot', status: 'finalizada', assignedUserId: null });
  expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({
    conversationId: 'cv1', origin: 'painel_evento', body: 'Voltou ao robô por inatividade', direction: 'out', providerMessageId: null,
  }));
});

it('finaliza conversas do robô paradas há 24 h', async () => {
  repo.finalizarConversasDoRobo.mockResolvedValue(3);
  expect(await inboxCron.finalizarConversasDoRobo(AGORA)).toBe(3);
  expect(repo.finalizarConversasDoRobo).toHaveBeenCalledWith(new Date('2026-10-15T15:00:00.000Z'));
});

it('limpa mensagens com mais de 180 dias e conversas vazias', async () => {
  repo.apagarMensagensAntigas.mockResolvedValue(10);
  repo.apagarConversasVazias.mockResolvedValue(2);
  expect(await inboxCron.limparAntigas(AGORA)).toEqual({ mensagens: 10, conversas: 2 });
  expect(repo.apagarMensagensAntigas).toHaveBeenCalledWith(new Date('2026-04-19T15:00:00.000Z'));
});

describe('MESSAGES_UPDATE', () => {
  beforeEach(() => tenant.resolveTenant.mockResolvedValue({ business: { id: 'b1', name: 'X', instanceName: 'loja_1' } }));
  it('objeto único com keyId', async () => {
    expect(await handleMessagesUpdate({ instance: 'loja_1', data: { keyId: 'EVO-1', status: 'READ' } }, { instanceName: 'loja_1' })).toEqual({ atualizadas: 1 });
    expect(recorder.atualizarEntrega).toHaveBeenCalledWith({ businessId: 'b1', providerMessageId: 'EVO-1', status: 'lida' });
  });
  it('lista com key.id e status ignorável', async () => {
    await handleMessagesUpdate({ data: [{ key: { id: 'A' }, status: 'DELIVERY_ACK' }, { key: { id: 'B' }, status: 'SERVER_ACK' }] }, { instanceName: 'loja_1' });
    expect(recorder.atualizarEntrega).toHaveBeenCalledTimes(1);
    expect(recorder.atualizarEntrega).toHaveBeenCalledWith({ businessId: 'b1', providerMessageId: 'A', status: 'entregue' });
  });
  it('instância desconhecida não faz nada', async () => {
    tenant.resolveTenant.mockResolvedValue(null);
    expect(await handleMessagesUpdate({ data: { keyId: 'A', status: 'READ' } }, { instanceName: 'x' })).toEqual({ atualizadas: 0 });
  });
});
