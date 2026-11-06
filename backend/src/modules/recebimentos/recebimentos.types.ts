export type GatewayId = 'mercadopago';
export type FormaSinal = 'pix' | 'cartao';
export type SituacaoCobranca = 'pendente' | 'paga' | 'expirada' | 'recusada' | 'devolvida' | 'contestada';

/** Pagamento já buscado no gateway. `status` é o do Mercado Pago (approved, pending, rejected, refunded, charged_back...). */
export interface PagamentoGateway {
  id: string;
  status: string;
  valor: number;
  referencia: string | null;
  formaPaga: 'pix' | 'credito' | 'debito' | null;
}
