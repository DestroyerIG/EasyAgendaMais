import { z } from 'zod';

export const createProfessionalSchema = z.object({
  name: z.string().min(2, 'Nome do profissional deve ter pelo menos 2 caracteres').max(255),
  photo: z.string().url('URL da foto inválida').optional().nullable(),
});

export const updateProfessionalSchema = createProfessionalSchema.partial();

export type CreateProfessional = z.infer<typeof createProfessionalSchema>;
export type UpdateProfessional = z.infer<typeof updateProfessionalSchema>;
