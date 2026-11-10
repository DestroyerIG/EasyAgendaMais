import { z } from 'zod';

export type OrigemGoogle = 'ajustes' | 'onboarding';

export const ConectarQuerySchema = z.object({
  para: z.enum(['negocio', 'profissional']),
  origem: z.enum(['ajustes', 'onboarding']).optional(),
});

export const CallbackQuerySchema = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(1024).optional(),
  error: z.string().max(255).optional(),
});

export const DefinirProfissionalSchema = z.object({ professionalId: z.string().uuid().nullable() });

export const ConfirmarSchema = z.object({ t: z.string().min(20).max(100) });

export const OcupadoQuerySchema = z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export interface UsuarioLogado { userId: string; businessId: string; role: string; plan: string }
