import { z } from 'zod';
import { passwordSchema } from '../../validators/schemas/common.js';
import type { EstadoAcesso } from './equipe.rules.js';

export const ConvidarSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido').max(255),
});
export type ConvidarInput = z.infer<typeof ConvidarSchema>;

export const ConfiguracaoSchema = z.object({ profissionalCobra: z.boolean() });

export const AceitarConviteSchema = z.object({ senha: passwordSchema });

export interface AcessoDto {
  professionalId: string;
  estado: EstadoAcesso;
  email: string | null;
  desde: string | null;
}

export interface ConviteCriadoDto extends AcessoDto {
  /** Link para a dona copiar e mandar por onde quiser, caso o e-mail não chegue. */
  link: string;
  emailEnviado: boolean;
}

export interface ConvitePublicoDto {
  negocio: string;
  profissional: string;
  email: string;
}
