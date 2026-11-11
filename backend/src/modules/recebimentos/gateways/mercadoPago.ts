// Adaptador do Mercado Pago: chamadas REST com fetch, sem SDK. O token só vai no cabeçalho
// Authorization e nunca entra em mensagem de erro, log ou URL.
import { centavos } from '../recebimentos.rules.js';
import type { PagamentoGateway } from '../recebimentos.types.js';
import {
  GatewayIndisponivel, GatewayRecusou, GatewayTerminalOcupado, GatewayTokenInvalido,
  type Gateway, type NovaCobranca, type Terminal, type Tokens,
} from './tipos.js';

const API = 'https://api.mercadopago.com';
const AUTH_URL = 'https://auth.mercadopago.com/authorization';
const TEMPO_LIMITE_MS = 8000;

const cliente = () => ({
  id: process.env.MERCADOPAGO_CLIENT_ID ?? '',
  segredo: process.env.MERCADOPAGO_CLIENT_SECRET ?? '',
  redirect: process.env.MERCADOPAGO_REDIRECT_URI ?? '',
});

type Json = Record<string, unknown>;

async function lerJson(r: Response): Promise<unknown> {
  try { return await r.json(); } catch { return null; }
}

/** Só o status e o código de erro do OAuth entram na decisão; o corpo nunca vai para a mensagem. */
function erroDoStatus(status: number, corpo: unknown): Error {
  const codigo = (corpo as { error?: unknown } | null)?.error;
  if (codigo === 'invalid_grant') return new GatewayTokenInvalido(undefined, true);
  // As ordens da Point devolvem os erros em `errors[].code`.
  const codigoOrdem = ((corpo as { errors?: Array<{ code?: unknown }> } | null)?.errors ?? [])[0]?.code;
  if (codigoOrdem === 'already_queued_order_for_terminal') return new GatewayTerminalOcupado();
  if (status === 401) return new GatewayTokenInvalido();
  if (status === 429 || status >= 500) return new GatewayIndisponivel();
  return new GatewayRecusou(`Mercado Pago recusou a chamada (${status})`);
}

interface Resposta { status: number; corpo: unknown }

async function chamar(url: string, init: RequestInit, aceitar404 = false): Promise<Resposta> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch {
    // Estouro de tempo ou falha de rede: nada a mostrar além do fato.
    throw new GatewayIndisponivel();
  }
  const corpo = await lerJson(r);
  if (!r.ok && !(aceitar404 && r.status === 404)) throw erroDoStatus(r.status, corpo);
  return { status: r.status, corpo };
}

const cabecalho = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });
const cabecalhoJson = (token: string, extra: Record<string, string> = {}) =>
  cabecalho(token, { 'Content-Type': 'application/json', ...extra });

/** Valor em texto com duas casas, como a API de Orders pede. */
const dinheiro = (valor: number) => (centavos(valor) / 100).toFixed(2);

const emTexto = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

// Prazo do token do Mercado Pago (180 dias), usado quando a resposta não traz `expires_in`.
const VALIDADE_PADRAO_S = 180 * 24 * 60 * 60;

async function pedirToken(corpo: Json): Promise<Tokens> {
  const c = cliente();
  let r: unknown;
  try {
    ({ corpo: r } = await chamar(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: c.id, client_secret: c.segredo, ...corpo }),
    }));
  } catch (e) {
    // Em /oauth/token, um 401 é credencial da plataforma errada, não token do negócio inválido:
    // só `invalid_grant` derruba a conexão.
    if (e instanceof GatewayTokenInvalido && !e.invalidGrant) {
      throw new GatewayRecusou('Mercado Pago recusou as credenciais da plataforma');
    }
    throw e;
  }
  const d = (r ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; user_id?: unknown };
  if (typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string') {
    throw new GatewayRecusou('Resposta do Mercado Pago sem tokens');
  }
  const segundos = Number(d.expires_in);
  const expiraEm = new Date(Date.now() + (Number.isFinite(segundos) && segundos > 0 ? segundos : VALIDADE_PADRAO_S) * 1000);
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiraEm, contaId: emTexto(d.user_id) };
}

const FORMA: Record<string, PagamentoGateway['formaPaga']> = {
  credit_card: 'credito',
  debit_card: 'debito',
  bank_transfer: 'pix',
};

function traduzirPagamento(p: Json): PagamentoGateway {
  const ref = p.external_reference;
  return {
    id: emTexto(p.id),
    status: emTexto(p.status),
    valor: Number(p.transaction_amount),
    referencia: typeof ref === 'string' && ref ? ref : null,
    formaPaga: FORMA[emTexto(p.payment_type_id)] ?? null,
  };
}

/** Prazo da ordem Point em ISO 8601: no mínimo PT30S, em minutos cheios, no máximo 3 horas. */
function duracaoIso(venceEm: Date): string {
  const segundos = Math.ceil((venceEm.getTime() - Date.now()) / 1000);
  if (segundos <= 30) return 'PT30S';
  return `PT${Math.min(180, Math.ceil(segundos / 60))}M`;
}

const MODOS_DO_TERMINAL = new Set(['PDV', 'STANDALONE']);

const STATUS_DA_ORDEM: Record<string, string> = {
  processed: 'approved', failed: 'rejected', canceled: 'cancelled', expired: 'expired', refunded: 'refunded',
};

const FORMA_DO_MEIO: Record<string, PagamentoGateway['formaPaga']> = { credit_card: 'credito', debit_card: 'debito' };

export const mercadoPago: Gateway = {
  urlAutorizacao(estado, desafio) {
    const c = cliente();
    const q = new URLSearchParams({
      client_id: c.id,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: c.redirect,
      state: estado,
      code_challenge: desafio,
      code_challenge_method: 'S256',
    });
    return `${AUTH_URL}?${q.toString()}`;
  },

  trocarCodigo(codigo, verificador) {
    return pedirToken({
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: cliente().redirect,
      code_verifier: verificador,
    });
  },

  renovar(refreshToken) {
    return pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  },

  async conta(accessToken) {
    const { corpo } = await chamar(`${API}/users/me`, { headers: cabecalho(accessToken) });
    const d = (corpo ?? {}) as { id?: unknown; email?: unknown; nickname?: unknown };
    const nome = emTexto(d.email) || emTexto(d.nickname);
    return { id: emTexto(d.id), nome };
  },

  async criarPix(accessToken, c: NovaCobranca) {
    const minutos = Math.max(1, Math.ceil((c.venceEm.getTime() - Date.now()) / 60_000));
    const { corpo } = await chamar(`${API}/v1/orders`, {
      method: 'POST',
      headers: cabecalhoJson(accessToken, { 'X-Idempotency-Key': c.cobrancaId }),
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'automatic',
        total_amount: dinheiro(c.valor),
        external_reference: c.cobrancaId,
        description: c.descricao,
        payer: { email: c.pagadorEmail },
        transactions: {
          payments: [{
            amount: dinheiro(c.valor),
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: `PT${minutos}M`,
          }],
        },
      }),
    });
    const d = (corpo ?? {}) as { id?: unknown; transactions?: { payments?: Array<{ payment_method?: { qr_code?: unknown } }> } };
    const qr = d.transactions?.payments?.[0]?.payment_method?.qr_code;
    if (typeof qr !== 'string' || !qr || !d.id) throw new GatewayRecusou('Mercado Pago não devolveu o código Pix');
    return { idExterno: emTexto(d.id), codigoPix: qr };
  },

  async criarCheckoutCartao(accessToken, c, voltas) {
    const { corpo } = await chamar(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: cabecalhoJson(accessToken),
      body: JSON.stringify({
        items: [{ title: c.descricao, quantity: 1, unit_price: centavos(c.valor) / 100, currency_id: 'BRL' }],
        payer: { email: c.pagadorEmail },
        external_reference: c.cobrancaId,
        back_urls: { success: voltas.sucesso, pending: voltas.pendente, failure: voltas.falha },
        auto_return: 'approved',
        expires: true,
        expiration_date_to: c.venceEm.toISOString(),
        payment_methods: {
          installments: 1,
          excluded_payment_types: ['ticket', 'bank_transfer', 'atm', 'digital_currency'].map((id) => ({ id })),
        },
      }),
    });
    const d = (corpo ?? {}) as { id?: unknown; init_point?: unknown };
    if (typeof d.init_point !== 'string' || !d.init_point || !d.id) {
      throw new GatewayRecusou('Mercado Pago não devolveu o link de pagamento');
    }
    return { idExterno: emTexto(d.id), checkoutUrl: d.init_point };
  },

  async referenciaDoRecurso(accessToken, recurso) {
    const caminho = recurso.tipo === 'order' ? 'orders' : 'payments';
    const { status, corpo } = await chamar(
      `${API}/v1/${caminho}/${encodeURIComponent(recurso.id)}`,
      { headers: cabecalho(accessToken) },
      true,
    );
    if (status === 404) return null;
    const ref = (corpo as { external_reference?: unknown } | null)?.external_reference;
    return typeof ref === 'string' && ref ? ref : null;
  },

  async buscarPorReferencia(accessToken, cobrancaId) {
    const { corpo } = await chamar(
      `${API}/v1/payments/search?external_reference=${encodeURIComponent(cobrancaId)}`,
      { headers: cabecalho(accessToken) },
    );
    const lista = (corpo as { results?: unknown } | null)?.results;
    return Array.isArray(lista) ? lista.map((p) => traduzirPagamento(p as Json)) : [];
  },
  async listarTerminais(accessToken) {
    const { corpo } = await chamar(`${API}/terminals/v1/list`, { headers: cabecalho(accessToken) });
    const lista = (corpo as { data?: { terminals?: unknown } } | null)?.data?.terminals;
    if (!Array.isArray(lista)) return [];
    return lista.map((t): Terminal => {
      const d = t as { id?: unknown; operating_mode?: unknown };
      const modo = emTexto(d.operating_mode);
      return { id: emTexto(d.id), modo: MODOS_DO_TERMINAL.has(modo) ? (modo as Terminal['modo']) : 'UNDEFINED' };
    }).filter((t) => t.id !== '');
  },

  async ativarPdv(accessToken, terminalId) {
    await chamar(`${API}/terminals/v1/setup`, {
      method: 'PATCH',
      headers: cabecalhoJson(accessToken),
      body: JSON.stringify({ terminals: [{ id: terminalId, operating_mode: 'PDV' }] }),
    });
  },

  async criarOrdemPoint(accessToken, c: NovaCobranca, p) {
    const { corpo } = await chamar(`${API}/v1/orders`, {
      method: 'POST',
      headers: cabecalhoJson(accessToken, { 'X-Idempotency-Key': c.cobrancaId }),
      body: JSON.stringify({
        type: 'point',
        external_reference: c.cobrancaId,
        expiration_time: duracaoIso(c.venceEm),
        description: c.descricao.slice(0, 150),
        transactions: { payments: [{ amount: dinheiro(c.valor) }] },
        // O terminal vai exatamente como a listagem devolveu; sem parcelas: a maquininha pergunta ao cliente.
        config: { point: { terminal_id: p.terminalId }, payment_method: { default_type: p.tipo } },
      }),
    });
    const id = (corpo as { id?: unknown } | null)?.id;
    if (!id) throw new GatewayRecusou('Mercado Pago não criou a cobrança na maquininha');
    return { idExterno: emTexto(id) };
  },

  async cancelarOrdem(accessToken, idExterno, cobrancaId) {
    try {
      const { status } = await chamar(`${API}/v1/orders/${encodeURIComponent(idExterno)}/cancel`, {
        method: 'POST',
        headers: cabecalhoJson(accessToken, { 'X-Idempotency-Key': `${cobrancaId}:cancel`, 'x-allow-cancelable-status': 'at_terminal' }),
      });
      return status === 202 ? 'pedir_no_terminal' : 'cancelada';
    } catch (e) {
      // 409 (`cannot_cancel_order`): o modelo da maquininha não deixa cancelar pela API.
      if (e instanceof GatewayRecusou) return 'pedir_no_terminal';
      throw e;
    }
  },

  async consultarOrdem(accessToken, idExterno) {
    const { status, corpo } = await chamar(
      `${API}/v1/orders/${encodeURIComponent(idExterno)}`, { headers: cabecalho(accessToken) }, true,
    );
    if (status === 404) return null;
    const d = (corpo ?? {}) as Json & { transactions?: { payments?: Json[] } };
    const pagamento = d.transactions?.payments?.[0];
    if (!pagamento) return null;
    const ref = d.external_reference;
    const meio = ((pagamento.payment_method ?? {}) as { type?: unknown }).type;
    return {
      id: emTexto(pagamento.id),
      status: STATUS_DA_ORDEM[emTexto(d.status)] ?? 'pending',
      valor: Number(pagamento.amount),
      referencia: typeof ref === 'string' && ref ? ref : null,
      formaPaga: FORMA_DO_MEIO[emTexto(meio)] ?? null,
    };
  },
};
