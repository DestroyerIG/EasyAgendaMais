import { z } from 'zod';
import { validatePixKeyFormat } from '../../utils/pixPayload.js';

export const PixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']);

export const COMODIDADES = ['wifi', 'cafe', 'estacionamento', 'ar_condicionado', 'acessibilidade', 'materiais_esterilizados'] as const;

export const UpdatePublicPageSchema = z
  .object({
    slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
    pixKey: z.string().trim().min(1).max(255).optional(),
    pixKeyType: PixKeyTypeSchema.optional(),
    logoUrl: z.string().url().max(2048).optional(),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    galleryPhotos: z.array(z.string().url().max(2048)).max(6).optional(),
    address: z.string().trim().max(500).optional(),
    coverUrl: z.string().url().max(2048).nullable().optional(),
    description: z.string().trim().max(500).optional(),
    comodidades: z.array(z.enum(COMODIDADES)).max(COMODIDADES.length).optional(),
    mostrarNota: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // O formato da chave só pode ser validado conhecendo o tipo — por isso os dois
    // campos andam juntos. Sem essa validação, uma chave inválida (ex.: e-mail com
    // mais de 77 caracteres) só estouraria no último passo do fluxo público (500).
    if ((data.pixKey === undefined) !== (data.pixKeyType === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [data.pixKey === undefined ? 'pixKey' : 'pixKeyType'],
        message: 'Informe a chave Pix e o tipo de chave juntos',
      });
      return;
    }
    if (data.pixKey !== undefined && data.pixKeyType !== undefined) {
      const error = validatePixKeyFormat(data.pixKey, data.pixKeyType);
      if (error) {
        ctx.addIssue({ code: 'custom', path: ['pixKey'], message: error });
      }
    }
  });

export type UpdatePublicPageInput = z.infer<typeof UpdatePublicPageSchema>;

export const UploadImageSchema = z.object({
  imageBase64: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export type UploadImageInput = z.infer<typeof UploadImageSchema>;

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  address: string | null;
  coverUrl: string | null;
  description: string | null;
  comodidades: string[];
  mostrarNota: boolean;
}
