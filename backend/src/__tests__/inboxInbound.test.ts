import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const tenant = vi.hoisted(() => ({ resolveTenant: vi.fn() }));
vi.mock('../services/whatsapp/tenant/tenantResolver.js', () => tenant);
const bot = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('../bot/botOrchestrator.js', () => bot);
const sessions = vi.hoisted(() => ({ getSession: vi.fn(), isSessionExpired: vi.fn() }));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => sessions);
const msg = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => msg);
const recorder = vi.hoisted(() => ({
  registrarEntrada: vi.fn(), registrarEco: vi.fn(), registrarOptOut: vi.fn(), registrarOptIn: vi.fn(), estaEmOptOut: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));

const { handleMessagesUpsert, TEXTO_OPT_OUT } = await import('../services/whatsapp/handlers/messagesUpsertHandler.js');

let seq = 0;
const payload = (over: { text?: string | null; fromMe?: boolean; type?: string; jid?: string } = {}) => ({
  event: 'messages-upsert',
  instance: 'loja_1',
  sender: '5583988887777@s.whatsapp.net',
  data: {
    key: { id: `MSG-${++seq}`, remoteJid: over.jid ?? '5583999990000@s.whatsapp.net', fromMe: over.fromMe ?? false },
    pushName: 'Maria',
    messageType: over.type ?? 'conversation',
    message: over.text === null ? { imageMessage: {} } : { conversation: over.text ?? 'oi' },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  tenant.resolveTenant.mockResolvedValue({ business: { id: 'b1', name: 'Studio Aurora', instanceName: 'loja_1' }, connectedNumber: '5583988887777', subscriptionStatus: 'active' });
  sessions.getSession.mockResolvedValue(null);
  sessions.isSessionExpired.mockReturnValue(false);
  recorder.registrarEntrada.mockResolvedValue({ id: 'cv1', handler: 'bot', status: 'aberta', clientId: 'c1' });
  bot.process.mockResolvedValue({ ok: true, responseSent: true });
  msg.sendWhatsAppMessage.mockResolvedValue(true);
  recorder.estaEmOptOut.mockResolvedValue(false);
});

it('grava a entrada e segue para o robô', async () => {
  const r = await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(r.ok).toBe(true);
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', texto: 'oi', messageType: 'conversation', sessaoRoboAtiva: false }));
  expect(bot.process).toHaveBeenCalled();
});

it('sessão do robô ativa é repassada ao gravador', async () => {
  sessions.getSession.mockResolvedValue({ id: 's', step: 'menu' });
  await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ sessaoRoboAtiva: true }));
});

it('SAIR: registra opt-out, responde e o robô não processa', async () => {
  const r = await handleMessagesUpsert(payload({ text: ' Sair! ' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('opt_out');
  expect(recorder.registrarOptOut).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', keyword: 'sair' }));
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(expect.any(String), TEXTO_OPT_OUT('Studio Aurora'), expect.objectContaining({ businessId: 'b1', origin: 'sistema' }));
  expect(bot.process).not.toHaveBeenCalled();
});

it('VOLTAR com opt-out ativo: registra opt-in e o robô não processa', async () => {
  recorder.estaEmOptOut.mockResolvedValue(true);
  const r = await handleMessagesUpsert(payload({ text: 'voltar' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('opt_in');
  expect(recorder.estaEmOptOut).toHaveBeenCalledWith('b1', '5583999990000');
  expect(recorder.registrarOptIn).toHaveBeenCalled();
  expect(bot.process).not.toHaveBeenCalled();
});

it('VOLTAR sem opt-out ativo segue para o robô e não grava consentimento', async () => {
  const r = await handleMessagesUpsert(payload({ text: 'voltar' }), { instanceName: 'loja_1' });
  expect(r.reason).not.toBe('opt_in');
  expect(recorder.registrarOptIn).not.toHaveBeenCalled();
  expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(bot.process).toHaveBeenCalled();
});

it('"não quero sair hoje" segue para o robô', async () => {
  await handleMessagesUpsert(payload({ text: 'não quero sair hoje' }), { instanceName: 'loja_1' });
  expect(recorder.registrarOptOut).not.toHaveBeenCalled();
  expect(bot.process).toHaveBeenCalled();
});

it('conversa em atendimento humano: robô calado', async () => {
  recorder.registrarEntrada.mockResolvedValue({ id: 'cv1', handler: 'humano', status: 'aguardando', clientId: 'c1' });
  const r = await handleMessagesUpsert(payload({ text: 'oi?' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('human_handler');
  expect(bot.process).not.toHaveBeenCalled();
});

it('mídia sem legenda é gravada mas o robô não roda (sem texto)', async () => {
  const r = await handleMessagesUpsert(payload({ text: null, type: 'imageMessage' }), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ messageType: 'imageMessage' }));
  expect(r.reason).toBe('no_text');
  expect(bot.process).not.toHaveBeenCalled();
});

it('fromMe: grava como eco com o telefone do destinatário e não roda o robô', async () => {
  const r = await handleMessagesUpsert(payload({ fromMe: true, text: 'Já te respondo' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('from_me');
  expect(recorder.registrarEco).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', phone: '5583999990000', texto: 'Já te respondo' }));
  expect(recorder.registrarEntrada).not.toHaveBeenCalled();
  expect(bot.process).not.toHaveBeenCalled();
});

it('grupo não é gravado', async () => {
  await handleMessagesUpsert(payload({ jid: '120363000000@g.us' }), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).not.toHaveBeenCalled();
});

it('falha do gravador não impede o robô', async () => {
  recorder.registrarEntrada.mockResolvedValue(null);
  await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(bot.process).toHaveBeenCalled();
});
