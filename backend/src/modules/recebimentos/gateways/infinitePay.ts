// Adaptador da InfinitePay: checkout por link, REST com fetch. A chave só vai no cabeçalho
// X-Api-Key e nunca entra em mensagem de erro, log ou URL.
import { randomUUID } from 'node:crypto';
import { centavos } from '../recebimentos.rules.js';
import type { PagamentoGateway } from '../recebimentos.types.js';
import {
  GatewayCheckoutDesligado, GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido,
  type NovaCobranca,
} from './tipos.js';

const API = 'https://api.checkout.infinitepay.io';
const TEMPO_LIMITE_MS = 8000;
const CHECKOUT_DESLIGADO = 'external_checkout_not_enabled';

export interface CredencialInfinitePay { handle: string; chave: string }

/** Procura o texto em qualquer valor de texto do corpo, com limite de profundidade. */
function contemTexto(valor: unknown, texto: string, profundidade = 0): boolean {
  if (typeof valor === 'string') return valor.includes(texto);
  if (profundidade >= 4 || valor === null || typeof valor !== 'object') return false;
  return Object.values(valor).some((v) => contemTexto(v, texto, profundidade + 1));
}

async function lerJson(r: Response): Promise<unknown> {
  try { return await r.json(); } catch { return null; }
}

/** Só o status e o código de erro entram na decisão; o corpo nunca vai para a mensagem. */
function erroDoStatus(status: number, corpo: unknown): Error {
  if (status === 401 || status === 403) return new GatewayTokenInvalido();
  if (status === 429 || status >= 500) return new GatewayIndisponivel();
  if (contemTexto(corpo, CHECKOUT_DESLIGADO)) return new GatewayCheckoutDesligado();
  return new GatewayRecusou(`InfinitePay recusou a chamada (${status})`);
}

async function chamar(caminho: string, chave: string, corpo: unknown): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`${API}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Api-Key': chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch {
    throw new GatewayIndisponivel();
  }
  const json = await lerJson(r);
  if (!r.ok) throw erroDoStatus(r.status, json);
  return json;
}

export const normalizarHandle = (texto: string): string => texto.trim().replace(/^\$/, '').toLowerCase();

const FORMA: Record<string, PagamentoGateway['formaPaga']> = {
  pix: 'pix',
  credit_card: 'credito',
  debit_card: 'debito',
};

export const infinitePay = {
  /** Um `payment_check` com dados inexistentes: 200 prova que a chave e o handle valem. */
  async conferirChave(cred: CredencialInfinitePay): Promise<void> {
    await chamar('/payment_check', cred.chave, {
      handle: cred.handle,
      order_nsu: randomUUID(),
      transaction_nsu: randomUUID(),
      slug: 'conferencia',
    });
  },

  async criarLink(
    cred: CredencialInfinitePay,
    c: NovaCobranca,
    urls: { volta: string; webhook: string },
  ): Promise<{ checkoutUrl: string }> {
    const corpo = await chamar('/links', cred.chave, {
      handle: cred.handle,
      order_nsu: c.cobrancaId,
      items: [{ quantity: 1, price: centavos(c.valor), description: c.descricao }],
      redirect_url: urls.volta,
      webhook_url: urls.webhook,
      options: { valid_until: c.venceEm.toISOString(), single_payment: true, assured_installments: 0 },
    });
    const url = (corpo as { url?: unknown } | null)?.url;
    if (typeof url !== 'string' || !url) throw new GatewayRecusou('InfinitePay não devolveu o link de pagamento');
    return { checkoutUrl: url };
  },

  async conferirPagamento(
    cred: CredencialInfinitePay,
    d: { cobrancaId: string; transactionNsu: string; fatura: string },
  ): Promise<PagamentoGateway | null> {
    const corpo = await chamar('/payment_check', cred.chave, {
      handle: cred.handle,
      order_nsu: d.cobrancaId,
      transaction_nsu: d.transactionNsu,
      slug: d.fatura,
    });
    const r = (corpo ?? {}) as { paid?: unknown; amount?: unknown; capture_method?: unknown };
    if (r.paid !== true) return null;
    return {
      id: d.transactionNsu,
      status: 'approved',
      valor: Number(r.amount) / 100,
      referencia: d.cobrancaId,
      formaPaga: FORMA[typeof r.capture_method === 'string' ? r.capture_method : ''] ?? null,
    };
  },
};
