import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GatewayCheckoutDesligado, GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido,
} from '../modules/recebimentos/gateways/tipos.js';
import { infinitePay, normalizarHandle } from '../modules/recebimentos/gateways/infinitePay.js';

const CHAVE = 'chave-super-secreta-123';
const cred = { handle: 'studio_ana', chave: CHAVE };
const ID = '11111111-2222-3333-4444-555555555555';

const resposta = (status: number, corpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const chamada = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url: String(url), init, corpo: JSON.parse(String(init.body ?? 'null')) };
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('criarLink', () => {
  const venceEm = new Date('2026-11-09T12:15:00.000Z');
  const nova = { cobrancaId: ID, valor: 15.5, descricao: 'Sinal da reserva', venceEm, pagadorEmail: 'x@y.com' };
  const urls = { volta: 'https://app/volta', webhook: 'https://api/webhook' };

  it('envia o corpo esperado e devolve a url', async () => {
    fetchMock.mockResolvedValue(resposta(200, { url: 'https://checkout.infinitepay.io/studio_ana?lenc=abc' }));
    const r = await infinitePay.criarLink(cred, nova, urls);
    expect(r).toEqual({ checkoutUrl: 'https://checkout.infinitepay.io/studio_ana?lenc=abc' });
    const c = chamada();
    expect(c.url).toBe('https://api.checkout.infinitepay.io/links');
    expect(c.init.method).toBe('POST');
    expect((c.init.headers as Record<string, string>)['X-Api-Key']).toBe(CHAVE);
    expect(c.corpo).toEqual({
      handle: 'studio_ana',
      order_nsu: ID,
      items: [{ quantity: 1, price: 1550, description: 'Sinal da reserva' }],
      redirect_url: urls.volta,
      webhook_url: urls.webhook,
      options: { valid_until: venceEm.toISOString(), single_payment: true, assured_installments: 0 },
    });
  });

  it('recusa quando a resposta vem sem url', async () => {
    fetchMock.mockResolvedValue(resposta(200, {}));
    await expect(infinitePay.criarLink(cred, nova, urls)).rejects.toBeInstanceOf(GatewayRecusou);
  });
});

describe('conferirPagamento', () => {
  const dados = { cobrancaId: ID, transactionNsu: 'tx-1', fatura: 'slug-1' };

  it('envia os campos e traduz pagamento pago no Pix', async () => {
    fetchMock.mockResolvedValue(resposta(200, { success: true, paid: true, amount: 1550, capture_method: 'pix' }));
    const r = await infinitePay.conferirPagamento(cred, dados);
    expect(r).toEqual({ id: 'tx-1', status: 'approved', valor: 15.5, referencia: ID, formaPaga: 'pix' });
    const c = chamada();
    expect(c.url).toBe('https://api.checkout.infinitepay.io/payment_check');
    expect(c.corpo).toEqual({ handle: 'studio_ana', order_nsu: ID, transaction_nsu: 'tx-1', slug: 'slug-1' });
  });

  it('traduz cartão de crédito', async () => {
    fetchMock.mockResolvedValue(resposta(200, { success: true, paid: true, amount: 1550, capture_method: 'credit_card' }));
    expect((await infinitePay.conferirPagamento(cred, dados))?.formaPaga).toBe('credito');
  });

  it('devolve null quando não foi pago', async () => {
    fetchMock.mockResolvedValue(resposta(200, { success: true, paid: false }));
    expect(await infinitePay.conferirPagamento(cred, dados)).toBeNull();
  });
});

describe('conferirChave', () => {
  it('envia payment_check com nsu aleatórios e resolve no 200', async () => {
    fetchMock.mockResolvedValue(resposta(200, { success: false, paid: false }));
    await expect(infinitePay.conferirChave(cred)).resolves.toBeUndefined();
    const c = chamada();
    expect(c.url).toBe('https://api.checkout.infinitepay.io/payment_check');
    expect(c.corpo.handle).toBe('studio_ana');
    expect(c.corpo.order_nsu).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.corpo.transaction_nsu).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.corpo.order_nsu).not.toBe(c.corpo.transaction_nsu);
  });

  it('403 vira GatewayTokenInvalido', async () => {
    fetchMock.mockResolvedValue(resposta(403, {}));
    await expect(infinitePay.conferirChave(cred)).rejects.toBeInstanceOf(GatewayTokenInvalido);
  });

  it('external_checkout_not_enabled vira GatewayCheckoutDesligado', async () => {
    fetchMock.mockResolvedValue(resposta(400, { errors: [{ code: 'external_checkout_not_enabled' }] }));
    await expect(infinitePay.conferirChave(cred)).rejects.toBeInstanceOf(GatewayCheckoutDesligado);
  });
});

describe('erros em geral', () => {
  it('falha de rede vira GatewayIndisponivel sem vazar a chave', async () => {
    fetchMock.mockRejectedValue(new Error(`falhou com ${CHAVE}`));
    const e = await infinitePay.conferirChave(cred).catch((x: Error) => x);
    expect(e).toBeInstanceOf(GatewayIndisponivel);
    expect((e as Error).message).not.toContain(CHAVE);
  });

  it('429 e 5xx viram GatewayIndisponivel; outros 4xx viram GatewayRecusou sem a chave', async () => {
    fetchMock.mockResolvedValueOnce(resposta(429)).mockResolvedValueOnce(resposta(503));
    await expect(infinitePay.conferirChave(cred)).rejects.toBeInstanceOf(GatewayIndisponivel);
    await expect(infinitePay.conferirChave(cred)).rejects.toBeInstanceOf(GatewayIndisponivel);
    fetchMock.mockResolvedValueOnce(resposta(422, { message: CHAVE }));
    const e = await infinitePay.conferirChave(cred).catch((x: Error) => x);
    expect(e).toBeInstanceOf(GatewayRecusou);
    expect((e as Error).message).not.toContain(CHAVE);
  });
});

describe('normalizarHandle', () => {
  it('tira espaços e $ e deixa minúsculo', () => {
    expect(normalizarHandle(' $Studio_Ana ')).toBe('studio_ana');
  });
});
