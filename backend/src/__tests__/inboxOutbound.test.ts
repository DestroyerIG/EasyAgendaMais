import { describe, it, expect, vi, beforeEach } from 'vitest';

const client = vi.hoisted(() => ({ sendWhatsAppText: vi.fn() }));
vi.mock('../services/whatsappClient.js', () => client);
const recorder = vi.hoisted(() => ({ registrarSaida: vi.fn(), estaEmOptOut: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));

const { sendWhatsAppMessage } = await import('../services/whatsapp/whatsappMessageService.js');

beforeEach(() => {
  vi.clearAllMocks();
  recorder.estaEmOptOut.mockResolvedValue(false);
  client.sendWhatsAppText.mockImplementation(async (_p: string, _m: string, ctx: { onProviderResult?: (r: { providerMessageId: string | null }) => void }) => {
    ctx.onProviderResult?.({ providerMessageId: 'EVO-1' });
    return true;
  });
});

it('grava o envio com origem, id da Evolution e autor', async () => {
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'manual_painel', sentByUserId: 'u1' })).toBe(true);
  expect(recorder.registrarSaida).toHaveBeenCalledWith({
    businessId: 'b1', phone: '5583999990000', body: 'Olá', origem: 'manual_painel',
    providerMessageId: 'EVO-1', status: 'enviada', sentByUserId: 'u1',
  });
});

it('falha do provedor grava "falhou"', async () => {
  client.sendWhatsAppText.mockResolvedValue(false);
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'lembrete' })).toBe(false);
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou', providerMessageId: null, origem: 'lembrete' }));
});

it('exceção do provedor também grava "falhou" e devolve false', async () => {
  client.sendWhatsAppText.mockRejectedValue(new Error('timeout'));
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'bot' })).toBe(false);
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou' }));
});

it('sem businessId ou em simulação não grava', async () => {
  await sendWhatsAppMessage('5583999990000', 'Olá', {});
  await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', simulate: true });
  expect(recorder.registrarSaida).not.toHaveBeenCalled();
});

it('origem ausente grava como sistema', async () => {
  await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1' });
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ origem: 'sistema' }));
});

it('automática para número em opt-out não é enviada nem gravada', async () => {
  recorder.estaEmOptOut.mockResolvedValue(true);
  expect(await sendWhatsAppMessage('5583999990000', 'Lembrete', { businessId: 'b1', origin: 'lembrete' })).toBe(false);
  expect(client.sendWhatsAppText).not.toHaveBeenCalled();
  expect(recorder.registrarSaida).not.toHaveBeenCalled();
});

it('manual, recibo e robô saem mesmo com opt-out', async () => {
  recorder.estaEmOptOut.mockResolvedValue(true);
  for (const origin of ['manual_painel', 'pix_recibo', 'bot'] as const) {
    expect(await sendWhatsAppMessage('5583999990000', 'x', { businessId: 'b1', origin })).toBe(true);
  }
  expect(recorder.estaEmOptOut).not.toHaveBeenCalled();
});

it('erro ao gravar não muda o resultado do envio', async () => {
  recorder.registrarSaida.mockRejectedValue(new Error('db'));
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'bot' })).toBe(true);
});
