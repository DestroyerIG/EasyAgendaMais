import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  description: z.string().trim().max(255).nullable().optional(),
  price: z.number().positive('Preço deve ser maior que zero').multipleOf(0.01),
});
export const UpdateProductSchema = CreateProductSchema.partial();

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export interface ProductDto { id: string; name: string; description: string | null; price: number; active: boolean }
