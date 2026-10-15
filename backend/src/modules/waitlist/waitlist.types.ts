import { z } from 'zod';

export const PERIODS = ['manha', 'tarde', 'noite', 'qualquer'] as const;
export const ACTIVE_STATUSES = ['aguardando', 'oferecida'] as const;

const isRealDate = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').refine(isRealDate, 'Data inválida');
const TimeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido');
const Notes = z.string().trim().max(255, 'Observação deve ter no máximo 255 caracteres');

export const IdParamSchema = z.object({ id: z.string().uuid('Identificador inválido') });

export const ListQuerySchema = z.object({
  status: z.enum(['aguardando', 'oferecida', 'todas']).optional(),
  period: z.enum(PERIODS).optional(),
  date: DateStr.optional(),
});
export const CreateWaitlistSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid().optional(),
  desiredDate: DateStr.optional(),
  period: z.enum(PERIODS).default('qualquer'),
  notes: Notes.optional(),
});
export const UpdateWaitlistSchema = z.object({
  status: z.literal('cancelada').optional(),
  professionalId: z.string().uuid().nullable().optional(),
  desiredDate: DateStr.nullable().optional(),
  period: z.enum(PERIODS).optional(),
  notes: Notes.nullable().optional(),
});
export const OfferSchema = z.object({
  date: DateStr,
  time: TimeStr,
  professionalId: z.string().uuid().optional(),
});
export const BookedSchema = z.object({ appointmentId: z.string().uuid() });

export type ListQuery = z.infer<typeof ListQuerySchema>;
export type CreateWaitlistInput = z.input<typeof CreateWaitlistSchema>;
export type UpdateWaitlistInput = z.infer<typeof UpdateWaitlistSchema>;
export type OfferInput = z.infer<typeof OfferSchema>;

export interface WaitlistItemDto {
  id: string;
  cliente: { id: string; name: string; phone: string };
  servico: { id: string; name: string };
  profissional: { id: string; name: string } | null;
  desiredDate: string | null;
  period: 'manha' | 'tarde' | 'noite' | 'qualquer';
  notes: string | null;
  status: 'aguardando' | 'oferecida' | 'agendada' | 'cancelada';
  offeredAt: string | null;
  createdAt: string;
}
export interface WaitlistFilter { statuses?: string[]; period?: string; date?: string }
