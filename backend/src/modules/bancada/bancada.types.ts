import { z } from 'zod';
import { PAYMENT_METHODS, SaveComandaSchema } from '../comandas/comandas.types.js';

export interface Profissional { id: string; nome: string }

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
const HORA = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido');

export const ReagendarSchema = z.object({ data: DATA, hora: HORA, avisarCliente: z.boolean().default(true) });
export type ReagendarInput = z.infer<typeof ReagendarSchema>;

export const CancelarSchema = z.object({
  motivo: z.string().trim().min(2, 'Informe o motivo').max(120),
  avisarCliente: z.boolean().default(true),
});
export type CancelarInput = z.infer<typeof CancelarSchema>;

export const HojeQuerySchema = z.object({ data: DATA.optional() });
export const ClientesQuerySchema = z.object({ busca: z.string().trim().max(80).optional() });

export const HorariosQuerySchema = z.object({ agendamento: z.string().uuid(), data: DATA });
/** Horários livres dela para um serviço, antes de existir o agendamento. */
export const HorariosNovoQuerySchema = z.object({ servico: z.string().uuid(), data: DATA });
export const BuscaClienteQuerySchema = z.object({ busca: z.string().trim().min(2, 'Digite ao menos 2 letras').max(80) });

/** Novo agendamento: a profissional é sempre a do login, nunca vem do corpo. */
export const NovoAgendamentoSchema = z.object({ clienteId: z.string().uuid(), servicoId: z.string().uuid(), data: DATA, hora: HORA });
export type NovoAgendamentoInput = z.infer<typeof NovoAgendamentoSchema>;

export const NovoClienteSchema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório').max(255),
  phone: z.string().trim().min(8, 'Telefone é obrigatório').max(20),
});
export type NovoClienteInput = z.infer<typeof NovoClienteSchema>;

export const NotaSchema = z.object({ notas: z.string().max(2000).nullable() });

/** Igual à comanda do painel, mas desconto, gorjeta e forma são opcionais (sem a chave, nem são usados). */
export const BancadaComandaSchema = z.object({
  extras: SaveComandaSchema.shape.extras,
  discount: z.number().min(0).multipleOf(0.01).optional(),
  tip: z.number().min(0).multipleOf(0.01).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  usarCobertura: z.boolean().optional(),
});
export type BancadaComandaInput = z.infer<typeof BancadaComandaSchema>;

/** Cobrança do saldo pela profissional. `maquininha` exige débito ou crédito; `link` exige a forma escolhida. */
export const BancadaCobrarSchema = BancadaComandaSchema.omit({ paymentMethod: true }).extend({
  via: z.enum(['pix', 'maquininha', 'link']),
  forma: z.enum(['pix', 'debito', 'credito']).optional(),
}).superRefine((v, ctx) => {
  if (v.via === 'maquininha' && v.forma !== 'debito' && v.forma !== 'credito') {
    ctx.addIssue({ code: 'custom', path: ['forma'], message: 'Escolha débito ou crédito' });
  }
  if (v.via === 'link' && !v.forma) ctx.addIssue({ code: 'custom', path: ['forma'], message: 'Escolha a forma de pagamento' });
});
export type BancadaCobrarInput = z.infer<typeof BancadaCobrarSchema>;
