import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GatewayIndisponivel, GatewayRecusou, GatewayTerminalOcupado, GatewayTokenInvalido,
} from '../modules/recebimentos/gateways/tipos.js';
import { gateways } from '../modules/recebimentos/gateways/index.js';

// Maquininha Point pela API de Orders do Mercado Pago.
const mp = gateways.mercadopago;
const TOKEN = 'APP_USR-segredo-do-token';
const ID = '11111111-2222-3333-4444-555555555555';
const TERMINAL = 'NEWLAND_N950__ABC12345';

const resposta = (status: number, corpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const chamada = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url: String(url), init, corpo: init.body && typeof init.body === 'string' ? init.body : '' };
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const cobranca = (venceEm = new Date(Date.now() + 15 * 60_000 + 5_000)) => ({
  cobrancaId: ID, valor: 80, descricao: 'Comanda 1042', venceEm, pagadorEmail: 'comanda-abc@easybarber.tech',
});

describe('listarTerminais', () => {
  it('lê os terminais da conta com o modo de operação', async () => {
    fetchMock.mockResolvedValue(resposta(200, {
      data: { terminals: [
        { id: TERMINAL, operating_mode: 'PDV', store_id: '1' },
        { id: 'PAX_A910__XYZ', operating_mode: 'STANDALONE' },
        { id: 'GERTEC_MP35P__QQ', operating_mode: 'OUTRO' },
      ] },
      paging: { total: 3, offset: 0, limit: 50 },
    }));
    const r = await mp.listarTerminais(TOKEN);
    const { url, init } = chamada();
    expect(url).toBe('https://api.mercadopago.com/terminals/v1/list');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(r).toEqual([
      { id: TERMINAL, modo: 'PDV' }, { id: 'PAX_A910__XYZ', modo: 'STANDALONE' }, { id: 'GERTEC_MP35P__QQ', modo: 'UNDEFINED' },
    ]);
  });

  it('conta sem terminais devolve lista vazia', async () => {
    fetchMock.mockResolvedValue(resposta(200, { data: { terminals: [] } }));
    expect(await mp.listarTerminais(TOKEN)).toEqual([]);
  });
});

describe('ativarPdv', () => {
  it('manda o terminal para o modo PDV, um por requisição', async () => {
    fetchMock.mockResolvedValue(resposta(200, { terminals: [{ id: TERMINAL, operating_mode: 'PDV' }] }));
    await mp.ativarPdv(TOKEN, TERMINAL);
    const { url, init, corpo } = chamada();
    expect(url).toBe('https://api.mercadopago.com/terminals/v1/setup');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(corpo)).toEqual({ terminals: [{ id: TERMINAL, operating_mode: 'PDV' }] });
  });
});

describe('criarOrdemPoint', () => {
  const ordem = { id: 'ORD01POINT', status: 'created', transactions: { payments: [{ id: 'PAY1', status: 'created' }] } };

  it('cria a ordem no terminal, com valor de duas casas, tipo de cartão e sem parcelas', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    const r = await mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: TERMINAL, tipo: 'debit_card' });
    const { url, init, corpo } = chamada();
    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'X-Idempotency-Key': ID });
    const p = JSON.parse(corpo);
    expect(p).toMatchObject({
      type: 'point', external_reference: ID, description: 'Comanda 1042', expiration_time: 'PT16M',
      transactions: { payments: [{ amount: '80.00' }] },
      config: { point: { terminal_id: TERMINAL }, payment_method: { default_type: 'debit_card' } },
    });
    expect(corpo).not.toContain('default_installments');
    expect(corpo).not.toContain('installments_cost');
    expect(r).toEqual({ idExterno: 'ORD01POINT' });
  });

  it('crédito manda credit_card; o terminal vai exatamente como foi listado', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    await mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: 'PAX_A910__abc_Def', tipo: 'credit_card' });
    const p = JSON.parse(chamada().corpo);
    expect(p.config.payment_method.default_type).toBe('credit_card');
    expect(p.config.point.terminal_id).toBe('PAX_A910__abc_Def');
  });

  it('prazo menor que 30 segundos vira o mínimo PT30S', async () => {
    fetchMock.mockResolvedValue(resposta(201, ordem));
    await mp.criarOrdemPoint(TOKEN, cobranca(new Date(Date.now() + 5_000)), { terminalId: TERMINAL, tipo: 'debit_card' });
    expect(JSON.parse(chamada().corpo).expiration_time).toBe('PT30S');
  });

  it('resposta sem id lança GatewayRecusou', async () => {
    fetchMock.mockResolvedValue(resposta(201, {}));
    await expect(mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: TERMINAL, tipo: 'debit_card' })).rejects.toBeInstanceOf(GatewayRecusou);
  });

  it('terminal com outra cobrança na fila: GatewayTerminalOcupado', async () => {
    fetchMock.mockResolvedValue(resposta(409, { errors: [{ code: 'already_queued_order_for_terminal', message: 'fila' }] }));
    const erro = await mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: TERMINAL, tipo: 'debit_card' }).catch((e) => e);
    expect(erro).toBeInstanceOf(GatewayTerminalOcupado);
    expect(erro).toBeInstanceOf(GatewayRecusou);
  });

  it('401 vira GatewayTokenInvalido e 5xx GatewayIndisponivel; o token nunca vai na URL', async () => {
    fetchMock.mockResolvedValueOnce(resposta(401, {}));
    await expect(mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: TERMINAL, tipo: 'debit_card' })).rejects.toBeInstanceOf(GatewayTokenInvalido);
    fetchMock.mockResolvedValueOnce(resposta(503, {}));
    await expect(mp.criarOrdemPoint(TOKEN, cobranca(), { terminalId: TERMINAL, tipo: 'debit_card' })).rejects.toBeInstanceOf(GatewayIndisponivel);
    expect(chamada().url).not.toContain(TOKEN);
  });
});

describe('cancelarOrdem', () => {
  it('ordem ainda não capturada pelo terminal: cancelada na hora', async () => {
    fetchMock.mockResolvedValue(resposta(200, { status: 'canceled' }));
    expect(await mp.cancelarOrdem(TOKEN, 'ORD1', ID)).toBe('cancelada');
    const { url, init } = chamada();
    expect(url).toBe('https://api.mercadopago.com/v1/orders/ORD1/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Idempotency-Key': `${ID}:cancel`, 'x-allow-cancelable-status': 'at_terminal' });
  });

  it('já no terminal: 202 pede para cancelar também na maquininha', async () => {
    fetchMock.mockResolvedValue(resposta(202, { status: 'at_terminal' }));
    expect(await mp.cancelarOrdem(TOKEN, 'ORD1', ID)).toBe('pedir_no_terminal');
  });

  it('terminal que não aceita cancelar pela API (409): pede para cancelar na maquininha', async () => {
    fetchMock.mockResolvedValue(resposta(409, { errors: [{ code: 'cannot_cancel_order' }] }));
    expect(await mp.cancelarOrdem(TOKEN, 'ORD1', ID)).toBe('pedir_no_terminal');
  });

  it('acesso recusado continua sendo erro de token', async () => {
    fetchMock.mockResolvedValue(resposta(401, {}));
    await expect(mp.cancelarOrdem(TOKEN, 'ORD1', ID)).rejects.toBeInstanceOf(GatewayTokenInvalido);
  });
});

describe('consultarOrdem', () => {
  const ordem = (status: string, over: Record<string, unknown> = {}) => ({
    id: 'ORD1', status, external_reference: ID,
    transactions: { payments: [{ id: 'PAY1', amount: '80.00', status, payment_method: { type: 'debit_card' } }] }, ...over,
  });

  it.each([
    ['processed', 'approved'], ['failed', 'rejected'], ['canceled', 'cancelled'], ['expired', 'expired'],
    ['refunded', 'refunded'], ['created', 'pending'], ['at_terminal', 'pending'], ['action_required', 'pending'],
  ])('status da ordem %s vira %s', async (statusOrdem, esperado) => {
    fetchMock.mockResolvedValue(resposta(200, ordem(statusOrdem)));
    const p = await mp.consultarOrdem(TOKEN, 'ORD1');
    expect(chamada().url).toBe('https://api.mercadopago.com/v1/orders/ORD1');
    expect(p).toEqual({ id: 'PAY1', status: esperado, valor: 80, referencia: ID, formaPaga: 'debito' });
  });

  it('crédito vira credito e outros meios ficam sem forma', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, ordem('processed', {
      transactions: { payments: [{ id: 'PAY1', amount: '80.00', payment_method: { type: 'credit_card' } }] },
    })));
    expect((await mp.consultarOrdem(TOKEN, 'ORD1'))!.formaPaga).toBe('credito');
    fetchMock.mockResolvedValueOnce(resposta(200, ordem('processed', {
      transactions: { payments: [{ id: 'PAY1', amount: '80.00', payment_method: { type: 'qr' } }] },
    })));
    expect((await mp.consultarOrdem(TOKEN, 'ORD1'))!.formaPaga).toBeNull();
  });

  it('ordem que não existe devolve null', async () => {
    fetchMock.mockResolvedValue(resposta(404, { errors: [{ code: 'order_not_found' }] }));
    expect(await mp.consultarOrdem(TOKEN, 'ORD1')).toBeNull();
  });
});
