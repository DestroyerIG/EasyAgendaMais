import type { GatewayId, PagamentoGateway } from '../recebimentos.types.js';

/** O gateway recusou o acesso (revogado, token vencido): a conexão precisa ser refeita. */
export class GatewayTokenInvalido extends Error {
  /** `invalid_grant` do OAuth: o refresh token (ou o código) não vale mais. */
  readonly invalidGrant: boolean;
  constructor(msg = 'Acesso ao gateway de pagamento recusado', invalidGrant = false) {
    super(msg); this.name = 'GatewayTokenInvalido'; this.invalidGrant = invalidGrant;
  }
}

/** Limite de uso, instabilidade ou estouro de tempo: tenta de novo mais tarde. */
export class GatewayIndisponivel extends Error {
  constructor(msg = 'Gateway de pagamento indisponível') { super(msg); this.name = 'GatewayIndisponivel'; }
}

/** O gateway recusou a cobrança (4xx que não é 401), como conta sem chave Pix. */
export class GatewayRecusou extends Error {
  constructor(msg = 'Gateway de pagamento recusou a cobrança') { super(msg); this.name = 'GatewayRecusou'; }
}

/** Já há uma cobrança aguardando nesta maquininha (`already_queued_order_for_terminal`): não é problema da conta. */
export class GatewayTerminalOcupado extends GatewayRecusou {
  constructor(msg = 'A maquininha já tem uma cobrança aguardando') { super(msg); this.name = 'GatewayTerminalOcupado'; }
}

/** Maquininha Point da conta. `id` é `TIPO__SERIAL`, exatamente como o Mercado Pago lista. */
export interface Terminal { id: string; modo: 'PDV' | 'STANDALONE' | 'UNDEFINED' }

export interface Tokens { accessToken: string; refreshToken: string; expiraEm: Date; contaId: string }

export interface NovaCobranca {
  cobrancaId: string;
  valor: number;
  descricao: string;
  venceEm: Date;
  pagadorEmail: string;
}

export interface Gateway {
  urlAutorizacao(estado: string, desafio: string): string;
  trocarCodigo(codigo: string, verificador: string): Promise<Tokens>;
  renovar(refreshToken: string): Promise<Tokens>;
  conta(accessToken: string): Promise<{ id: string; nome: string }>;
  criarPix(accessToken: string, c: NovaCobranca): Promise<{ idExterno: string; codigoPix: string }>;
  criarCheckoutCartao(
    accessToken: string,
    c: NovaCobranca,
    voltas: { sucesso: string; pendente: string; falha: string },
  ): Promise<{ idExterno: string; checkoutUrl: string }>;
  referenciaDoRecurso(accessToken: string, recurso: { tipo: 'order' | 'payment'; id: string }): Promise<string | null>;
  listarTerminais(accessToken: string): Promise<Terminal[]>;
  ativarPdv(accessToken: string, terminalId: string): Promise<void>;
  criarOrdemPoint(
    accessToken: string, c: NovaCobranca, p: { terminalId: string; tipo: 'debit_card' | 'credit_card' },
  ): Promise<{ idExterno: string }>;
  /** `pedir_no_terminal`: a ordem já está na maquininha e o cancelamento por aqui não vale; cancelar lá também. */
  cancelarOrdem(accessToken: string, idExterno: string, cobrancaId: string): Promise<'cancelada' | 'pedir_no_terminal'>;
  consultarOrdem(accessToken: string, idExterno: string): Promise<PagamentoGateway | null>;
  buscarPorReferencia(accessToken: string, cobrancaId: string): Promise<PagamentoGateway[]>;
}

/** Só o Mercado Pago tem implementação por enquanto. */
export type Gateways = Record<'mercadopago', Gateway>;

/** A conta da InfinitePay não liberou o checkout por link (`external_checkout_not_enabled`). */
export class GatewayCheckoutDesligado extends GatewayRecusou {
  constructor(msg = 'Checkout por link não liberado na conta da InfinitePay') {
    super(msg); this.name = 'GatewayCheckoutDesligado';
  }
}
