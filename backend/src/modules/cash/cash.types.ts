import { z } from 'zod';

const valor = z.number().min(0).multipleOf(0.01);
export const OpenCashSchema = z.object({ openingBalance: valor });
export const CashMovementSchema = z.object({
  kind: z.enum(['sangria', 'suprimento']),
  amount: z.number().positive('Valor deve ser maior que zero').multipleOf(0.01),
  description: z.string().trim().min(2, 'Descreva o movimento').max(255),
});
export const CloseCashSchema = z.object({
  countedBalance: valor,
  notes: z.string().max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const CashDayQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export type CashMovementInput = z.infer<typeof CashMovementSchema>;
export type CloseCashInput = z.infer<typeof CloseCashSchema>;
export interface CashDayDto {
  date: string;                 // YYYY-MM-DD
  isToday: boolean;
  responsavel: string;          // business.ownerName (a tabela users não tem nome)
  session: null | {
    id: string; openedAt: string; openingBalance: number;
    closedAt: string | null; countedBalance: number | null; expectedBalance: number | null; difference: number | null;
  };
  totals: { entradas: number; entradasQtd: number; saidas: number; saidasQtd: number; saldo: number };
  comandasResumo: { total: number; fechadas: number; abertas: number; falta: number };
  formas: Array<{ chave: 'pix' | 'sinal_pix' | 'sinal_cartao' | 'debito' | 'credito' | 'dinheiro'; valor: number; quantidade: number }>;
  linhas: Array<{
    appointmentId: string | null; comandaId: string | null; numero: number | null; hora: string;
    cliente: string; telefone: string; profissional: string; servicos: string;
    pagamento: 'pix' | 'debito' | 'credito' | 'dinheiro' | 'sinal' | 'em_atendimento' | 'faltou';
    depositApplied: number; total: number; status: 'Fechada' | 'Aberta' | 'Falta' | 'Clube';
    /** A profissional mandou pelo app para a recepção cobrar (fase 5). */
    prontaParaCobrar?: boolean;
  }>;
  despesas: Array<{ id: string; descricao: string; categoria: string; valor: number; formaPagamento: string | null; criadoEm: string }>;
  movimentos: Array<{ id: string; kind: 'sangria' | 'suprimento'; valor: number; descricao: string; criadoEm: string }>;
  gaveta: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number; esperado: number };
}
