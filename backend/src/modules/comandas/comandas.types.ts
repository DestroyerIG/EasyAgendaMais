import { z } from 'zod';
import type { ComandaCalc } from './comandaMath.js';

export const PAYMENT_METHODS = ['pix', 'debito', 'credito', 'dinheiro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SaveComandaSchema = z.object({
  extras: z.array(z.object({
    kind: z.enum(['servico', 'produto']),
    id: z.string().uuid(),
    quantity: z.number().int().min(1, 'Quantidade mínima é 1').max(99),
  })).max(30),
  discount: z.number().min(0).multipleOf(0.01),
  tip: z.number().min(0).multipleOf(0.01),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  // Sessão coberta por clube/pacote: a dona pode desligar (a cliente prefere pagar). Ausente = usar.
  usarCobertura: z.boolean().optional(),
});
export type SaveComandaInput = z.infer<typeof SaveComandaSchema>;

export interface ComandaItemDto {
  id: string | null; kind: 'servico' | 'produto'; refId: string | null; name: string;
  unitPrice: number; quantity: number; durationMinutes: number | null; isMain: boolean;
  coveredValue: number | null;
}

export interface CoberturaComandaDto {
  disponivel: { contratoId: string; nome: string; tipo: 'clube' | 'pacote'; sessao: number | null; de: number | null; valorSessao: number } | null;
  bloqueio: { nome: string; motivo: string } | null;
  usando: boolean;
  descontoSociaPct: number;
}

export interface ComandaDetailDto {
  id: string; number: number; status: 'rascunho' | 'fechada';
  appointment: { id: string; date: string; time: string; status: string; source: string };
  client: { id: string; name: string; phone: string };
  professional: { id: string; name: string };
  items: ComandaItemDto[];
  depositAvailable: number;
  discount: number; tip: number; paymentMethod: PaymentMethod | null;
  commission: { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' };
  cobertura: CoberturaComandaDto;
  calc: ComandaCalc;
  whatsappConnected: boolean;
  closedAt: string | null; receiptSentAt: string | null;
  /** Quando a profissional mandou pelo app para a recepção cobrar (fase 5). */
  enviadaRecepcaoEm: string | null;
}

export interface NewExtraItem {
  kind: 'servico' | 'produto'; serviceId: string | null; productId: string | null;
  name: string; unitPrice: number; quantity: number; durationMinutes: number | null;
}
