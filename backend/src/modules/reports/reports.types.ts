import { z } from 'zod';
import { diasNoPeriodo } from './periodo.js';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');
const uuid = z.string().uuid();

export const MAX_DIAS_PERIODO = 366;

const periodo = z.object({ inicio: dia, fim: dia }).refine((p) => p.inicio <= p.fim, { message: 'O início precisa ser antes do fim', path: ['fim'] })
  .refine((p) => diasNoPeriodo(p) <= MAX_DIAS_PERIODO, { message: 'Escolha um período de até 366 dias', path: ['inicio'] });

export const PeriodoQuerySchema = periodo;
export const PeriodoOpcionalQuerySchema = z.object({ inicio: dia.optional(), fim: dia.optional() });

export const PagarRepasseSchema = z.object({
  professionalId: uuid,
  inicio: dia,
  fim: dia,
  forma: z.enum(['pix', 'dinheiro', 'transferencia']),
  observacao: z.string().max(500).nullable().optional(),
}).refine((p) => p.inicio <= p.fim, { message: 'O início precisa ser antes do fim', path: ['fim'] });

export const AdiantamentoSchema = z.object({
  professionalId: uuid,
  valor: z.number().positive('Informe um valor maior que zero').max(1_000_000),
  data: dia.optional(),
  descricao: z.string().max(255).nullable().optional(),
});

export const AdiantamentosQuerySchema = z.object({
  professionalId: uuid.optional(),
  abertos: z.enum(['true', 'false']).optional(),
});

export const ModeloRepasseSchema = z.object({ modelo: z.enum(['comissao', 'salao_parceiro']) });
