import type { GatewayId, PagamentoGateway } from '../recebimentos.types.js';

/** O gateway recusou o acesso (revogado, token vencido): a conexão precisa ser refeita. */
export class GatewayTokenInvalido extends Error {
  constructor(msg = 'Acesso ao gateway de pagamento recusado') { super(msg); this.name = 'GatewayTokenInvalido'; }
}

/** Limite de uso, instabilidade ou estouro de tempo: tenta de novo mais tarde. */
export class GatewayIndisponivel extends Error {
  constructor(msg = 'Gateway de pagamento indisponível') { super(msg); this.name = 'GatewayIndisponivel'; }
}

/** O gateway recusou a cobrança (4xx que não é 401), como conta sem chave Pix. */
export class GatewayRecusou extends Error {
  constructor(msg = 'Gateway de pagamento recusou a cobrança') { super(msg); this.name = 'GatewayRecusou'; }
}

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
  buscarPorReferencia(accessToken: string, cobrancaId: string): Promise<PagamentoGateway[]>;
}

export type Gateways = Record<GatewayId, Gateway>;
