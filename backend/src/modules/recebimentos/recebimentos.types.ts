import { z } from 'zod';

export type GatewayId = 'mercadopago' | 'infinitepay';
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

export interface EstadoRecebimentos {
  configurado: boolean;
  disponiveis: GatewayId[];
  conexao: {
    gateway: GatewayId; situacao: 'ativa' | 'precisa_reconectar'; contaNome: string;
    aceitaPix: boolean; aceitaCartao: boolean; aceiteCartaoEm: string | null;
    ultimaConfirmacaoEm: string | null; reservasPendentes: number;
  } | null;
}

export interface UsuarioLogado { userId: string; businessId: string; role: string }

export const GatewayParamSchema = z.object({ gateway: z.enum(['mercadopago', 'infinitepay']) });

/** Rotas do fluxo OAuth: só o Mercado Pago usa. */
export const GatewayOAuthParamSchema = z.object({ gateway: z.literal('mercadopago') });

export const CallbackQuerySchema = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(1024).optional(),
  error: z.string().max(255).optional(),
});

export const ChaveSchema = z.object({
  handle: z.string().min(1).max(64),
  chave: z.string().min(10).max(200),
  aceite: z.literal(true),
});

export const ConfirmarSchema = z.object({ t: z.string().min(20).max(100) });

export const FormasSchema = z.object({
  aceitaPix: z.boolean(),
  aceitaCartao: z.boolean(),
  aceiteCartao: z.boolean().optional(),
});
