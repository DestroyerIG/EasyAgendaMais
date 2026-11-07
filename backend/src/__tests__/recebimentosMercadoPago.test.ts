import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido,
} from '../modules/recebimentos/gateways/tipos.js';
import { gateways } from '../modules/recebimentos/gateways/index.js';

const mp = gateways.mercadopago;
const TOKEN = 'APP_USR-segredo-do-token';
const ID = '11111111-2222-3333-4444-555555555555';

const resposta = (status: number, corpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const chamada = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url: String(url), init, corpo: init.body && typeof init.body === 'string' ? init.body : '' };
};

beforeEach(() => {
  process.env.MERCADOPAGO_CLIENT_ID = 'cid';
  process.env.MERCADOPAGO_CLIENT_SECRET = 'csecret';
  process.env.MERCADOPAGO_REDIRECT_URI = 'https://api.exemplo.com/api/v1/recebimentos/callback';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const cobranca = (venceEm = new Date(Date.now() + 15 * 60_000 + 5_000)) => ({
  cobrancaId: ID, valor: 15.5, descricao: 'Sinal da reserva', venceEm, pagadorEmail: 'reserva-abc@easybarber.tech',
});

describe('urlAutorizacao', () => {
  it('monta a URL com PKCE S256', () => {
    const u = new URL(mp.urlAutorizacao('estado1', 'desafio1'));
    expect(u.origin + u.pathname).toBe('https://auth.mercadopago.com/authorization');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('platform_id')).toBe('mp');
    expect(u.searchParams.get('redirect_uri')).toBe(process.env.MERCADOPAGO_REDIRECT_URI);
    expect(u.searchParams.get('state')).toBe('estado1');
    expect(u.searchParams.get('code_challenge')).toBe('desafio1');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('OAuth', () => {
  const tokenResp = { access_token: 'a1', refresh_token: 'r1', expires_in: 15552000, user_id: 123456 };

  it('trocarCodigo envia os campos e devolve contaId como texto', async () => {
    fetchMock.mockResolvedValue(resposta(200, tokenResp));
    const antes = Date.now();
    const t = await mp.trocarCodigo('cod', 'verif');
    const { url, init, corpo } = chamada();
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(init.method).toBe('POST');
    const p = JSON.parse(corpo);
    expect(p).toMatchObject({
      client_id: 'cid', client_secret: 'csecret', grant_type: 'authorization_code',
      code: 'cod', redirect_uri: process.env.MERCADOPAGO_REDIRECT_URI, code_verifier: 'verif',
    });
    expect(t.accessToken).toBe('a1');
    expect(t.refreshToken).toBe('r1');
    expect(t.contaId).toBe('123456');
    expect(t.expiraEm.getTime()).toBeGreaterThanOrEqual(antes + 15552000 * 1000);
  });

  it('renovar usa grant_type=refresh_token e devolve o novo refresh', async () => {
    fetchMock.mockResolvedValue(resposta(200, { ...tokenResp, refresh_token: 'r2', expires_in: 100 }));
    const antes = Date.now();
    const t = await mp.renovar('r1');
    const p = JSON.parse(chamada().corpo);
    expect(p).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'cid', client_secret: 'csecret' });
    expect(t.refreshToken).toBe('r2');
    expect(t.expiraEm.getTime()).toBeGreaterThanOrEqual(antes + 100_000);
    expect(t.expiraEm.getTime()).toBeLessThan(antes + 100_000 + 5_000);
  });

  it('invalid_grant na renovação (400) vira GatewayTokenInvalido', async () => {
    fetchMock.mockResolvedValue(resposta(400, { error: 'invalid_grant' }));
    await expect(mp.renovar('r1')).rejects.toBeInstanceOf(GatewayTokenInvalido);
  });

  it('401 em /oauth/token é credencial da plataforma, não token do negócio', async () => {
    fetchMock.mockResolvedValue(resposta(401, { message: 'invalid client' }));
    await expect(mp.renovar('r1')).rejects.toBeInstanceOf(GatewayRecusou);
  });

  it('sem expires_in, usa o prazo padrão de 180 dias em vez de vencer agora', async () => {
    fetchMock.mockResolvedValue(resposta(200, { access_token: 'a1', refresh_token: 'r1', user_id: 1 }));
    const antes = Date.now();
    const t = await mp.renovar('r1');
    expect(t.expiraEm.getTime()).toBeGreaterThanOrEqual(antes + 180 * 24 * 60 * 60 * 1000);
  });

  it('conta lê /users/me e usa e-mail, com nickname de alternativa', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { id: 99, email: 'a@b.com', nickname: 'NICK' }));
    expect(await mp.conta(TOKEN)).toEqual({ id: '99', nome: 'a@b.com' });
    expect(chamada().url).toBe('https://api.mercadopago.com/users/me');
    expect(chamada().init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    fetchMock.mockResolvedValueOnce(resposta(200, { id: 99, nickname: 'NICK' }));
    expect(await mp.conta(TOKEN)).toEqual({ id: '99', nome: 'NICK' });
  });
});

describe('criarPix', () => {
  const ordem = {
    id: 'ORD01', transactions: { payments: [{ id: 'PAY01', payment_method: { qr_code: '000201PIX' } }] },
  };

  it('envia a ordem completa com idempotência e token no cabeçalho', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    const r = await mp.criarPix(TOKEN, cobranca());
    const { url, init, corpo } = chamada();
    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'X-Idempotency-Key': ID });
    const p = JSON.parse(corpo);
    expect(p).toMatchObject({
      type: 'online', processing_mode: 'automatic', total_amount: '15.50', external_reference: ID,
      payer: { email: 'reserva-abc@easybarber.tech' },
    });
    expect(p.transactions.payments[0]).toMatchObject({
      amount: '15.50', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT16M',
    });
    expect(r).toEqual({ idExterno: 'ORD01', codigoPix: '000201PIX' });
  });

  it('não envia notification_url', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    await mp.criarPix(TOKEN, cobranca());
    expect(chamada().corpo).not.toContain('notification_url');
  });

  it('nunca envia o token na URL', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    await mp.criarPix(TOKEN, cobranca());
    expect(chamada().url).not.toContain(TOKEN);
    expect(chamada().url).not.toContain('access_token');
  });

  it('sem QR Code na resposta lança GatewayRecusou', async () => {
    fetchMock.mockResolvedValue(resposta(201, { id: 'ORD01', transactions: { payments: [{}] } }));
    await expect(mp.criarPix(TOKEN, cobranca())).rejects.toBeInstanceOf(GatewayRecusou);
  });
});

describe('criarCheckoutCartao', () => {
  it('cria a preferência só com cartão e devolve init_point', async () => {
    fetchMock.mockResolvedValue(resposta(201, { id: 'PREF1', init_point: 'https://mp.com/checkout/x' }));
    const venceEm = new Date('2026-11-10T15:00:00.000Z');
    const voltas = { sucesso: 'https://x/ok', pendente: 'https://x/pend', falha: 'https://x/falha' };
    const r = await mp.criarCheckoutCartao(TOKEN, cobranca(venceEm), voltas);
    const { url, init, corpo } = chamada();
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    const p = JSON.parse(corpo);
    expect(p.back_urls).toEqual({ success: voltas.sucesso, pending: voltas.pendente, failure: voltas.falha });
    expect(p).toMatchObject({
      auto_return: 'approved', external_reference: ID, expires: true,
      expiration_date_to: venceEm.toISOString(), payer: { email: 'reserva-abc@easybarber.tech' },
    });
    expect(p.payment_methods.installments).toBe(1);
    expect(p.payment_methods.excluded_payment_types.map((t: { id: string }) => t.id).sort())
      .toEqual(['atm', 'bank_transfer', 'digital_currency', 'ticket']);
    expect(p.items[0]).toMatchObject({ quantity: 1, unit_price: 15.5, currency_id: 'BRL' });
    expect(chamada().url).not.toContain(TOKEN);
    expect(r).toEqual({ idExterno: 'PREF1', checkoutUrl: 'https://mp.com/checkout/x' });
  });
});

describe('buscarPorReferencia', () => {
  it('traduz os pagamentos', async () => {
    fetchMock.mockResolvedValue(resposta(200, {
      results: [
        { id: 987654321, transaction_amount: 15.5, status: 'approved', external_reference: ID, payment_type_id: 'bank_transfer' },
        { id: 2, transaction_amount: 10, status: 'pending', external_reference: ID, payment_type_id: 'credit_card' },
        { id: 3, transaction_amount: 10, status: 'rejected', external_reference: ID, payment_type_id: 'debit_card' },
        { id: 4, transaction_amount: 10, status: 'pending', external_reference: null, payment_type_id: 'account_money' },
      ],
    }));
    const r = await mp.buscarPorReferencia(TOKEN, ID);
    expect(chamada().url).toBe(`https://api.mercadopago.com/v1/payments/search?external_reference=${ID}`);
    expect(r).toEqual([
      { id: '987654321', valor: 15.5, status: 'approved', referencia: ID, formaPaga: 'pix' },
      { id: '2', valor: 10, status: 'pending', referencia: ID, formaPaga: 'credito' },
      { id: '3', valor: 10, status: 'rejected', referencia: ID, formaPaga: 'debito' },
      { id: '4', valor: 10, status: 'pending', referencia: null, formaPaga: null },
    ]);
  });

  it('results vazio devolve lista vazia', async () => {
    fetchMock.mockResolvedValue(resposta(200, { results: [] }));
    expect(await mp.buscarPorReferencia(TOKEN, ID)).toEqual([]);
  });
});

describe('referenciaDoRecurso', () => {
  it('order lê /v1/orders/:id', async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 'ORD01', external_reference: ID }));
    expect(await mp.referenciaDoRecurso(TOKEN, { tipo: 'order', id: 'ORD01' })).toBe(ID);
    expect(chamada().url).toBe('https://api.mercadopago.com/v1/orders/ORD01');
  });

  it('payment lê /v1/payments/:id', async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 55, external_reference: ID }));
    expect(await mp.referenciaDoRecurso(TOKEN, { tipo: 'payment', id: '55' })).toBe(ID);
    expect(chamada().url).toBe('https://api.mercadopago.com/v1/payments/55');
  });

  it('recurso inexistente devolve null', async () => {
    fetchMock.mockResolvedValue(resposta(404, { message: 'not found' }));
    expect(await mp.referenciaDoRecurso(TOKEN, { tipo: 'payment', id: '55' })).toBeNull();
  });

  it('recurso sem referência devolve null', async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 55 }));
    expect(await mp.referenciaDoRecurso(TOKEN, { tipo: 'payment', id: '55' })).toBeNull();
  });
});

describe('erros e tempo limite', () => {
  it('401 lança GatewayTokenInvalido', async () => {
    fetchMock.mockResolvedValue(resposta(401, { message: 'invalid token' }));
    await expect(mp.conta(TOKEN)).rejects.toBeInstanceOf(GatewayTokenInvalido);
  });

  it.each([500, 502, 429])('%i lança GatewayIndisponivel', async (status) => {
    fetchMock.mockResolvedValue(resposta(status));
    await expect(mp.conta(TOKEN)).rejects.toBeInstanceOf(GatewayIndisponivel);
  });

  it('estouro de tempo lança GatewayIndisponivel', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(mp.conta(TOKEN)).rejects.toBeInstanceOf(GatewayIndisponivel);
  });

  it('falha de rede lança GatewayIndisponivel', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(mp.conta(TOKEN)).rejects.toBeInstanceOf(GatewayIndisponivel);
  });

  it('outros 4xx lançam GatewayRecusou, sem o token na mensagem', async () => {
    fetchMock.mockResolvedValue(resposta(400, { message: 'bad', token: TOKEN }));
    const e = await mp.criarPix(TOKEN, cobranca()).catch((x) => x);
    expect(e).toBeInstanceOf(GatewayRecusou);
    expect(String(e.message)).not.toContain(TOKEN);
  });

  it('cada chamada usa AbortSignal de tempo limite', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(resposta(200, { id: 1, email: 'a@b.c' }));
    await mp.conta(TOKEN);
    expect(spy).toHaveBeenCalledWith(8000);
    expect(chamada().init.signal).toBeDefined();
    spy.mockRestore();
  });
});
