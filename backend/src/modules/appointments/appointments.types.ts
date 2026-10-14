import { z } from 'zod';
import type { AppointmentStatus } from '../../types/domain.js';
import { APPOINTMENT_STATUSES } from '../../config/appointmentStatus.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateAppointmentSchema = z.object({
  clientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
});

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial();

export const UpdateStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

export const GetAvailableSlotsQuerySchema = z.object({
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid().optional(),
});

export const GetAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  view: z.enum(['day', 'week']).default('day'),
  professionalId: z.string().uuid().optional(),
});

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type GetAppointmentsQuery = z.infer<typeof GetAppointmentsQuerySchema>;
export type GetAvailableSlotsQuery = z.infer<typeof GetAvailableSlotsQuerySchema>;

// ─── Domain ───────────────────────────────────────────────────────────────────

export interface AppointmentWithRelations {
  id: string;
  businessId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  date: Date;
  time: Date;
  status: AppointmentStatus;
  reminderSent: boolean;
  expiresAt?: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  client: { name: string; phone: string };
  professional: { name: string };
  service: { name: string; price: unknown; durationMinutes: number };
}

export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  aguardando_pagamento: ['confirmado', 'cancelado'],
  confirmado: ['em_atendimento', 'concluido', 'faltou', 'cancelado'],
  em_atendimento: ['concluido', 'confirmado', 'cancelado'],
  concluido: [],
  faltou: [],
  cancelado: [],
};
