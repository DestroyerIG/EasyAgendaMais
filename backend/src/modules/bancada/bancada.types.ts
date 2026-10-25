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
