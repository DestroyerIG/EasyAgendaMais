import { z } from 'zod';

export const TAG_COLORS = ['brand', 'success', 'warning', 'danger', 'tertiary', 'muted'] as const;

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da etiqueta').max(40, 'Nome deve ter no máximo 40 caracteres'),
  color: z.enum(TAG_COLORS).default('brand'),
});
export const UpdateTagSchema = z.object({
  name: CreateTagSchema.shape.name.optional(),
  color: z.enum(TAG_COLORS).optional(),
});
export const ClientTagsSchema = z.object({ tagIds: z.array(z.string().uuid()).max(50) });

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;

export interface TagDto { id: string; name: string; color: string }
export interface TagListDto extends TagDto { clientes: number }
