import { z } from 'zod';

// Forma do corpo; os limites de texto dependem da nota e são aplicados no service, depois do trim.
export const EnvioSchema = z.object({
  nota: z.number().int().min(1).max(5),
  texto: z.string(),
  nomeExibido: z.string().optional(),
  cidade: z.string().optional(),
  autorizou: z.boolean(),
});
export type EnvioInput = z.infer<typeof EnvioSchema>;

export type StatusAtual = 'em_analise' | 'publicado' | 'nao_publicado';

export interface DepoimentoAtual {
  status: StatusAtual;
  nota: number;
  texto: string;
  nomeExibido: string | null;
  cidade: string | null;
}

export interface EstadoDepoimento {
  mostrarPopup: boolean;
  nomeSugerido: string;
  atual: DepoimentoAtual | null;
}

export interface UsuarioDono {
  businessId: string | null;
  role: string;
}
