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

export const ABAS = ['pendentes', 'publicados', 'recusados', 'internos'] as const;
export type Aba = (typeof ABAS)[number];

export const ListaAdminQuerySchema = z.object({ aba: z.enum(ABAS) });
export const IdParamsSchema = z.object({ id: z.string().uuid() });
export const CorrigirSchema = z.object({ texto: z.string() });

export interface DepoimentoAdmin {
  id: string;
  negocio: string;
  negocioId: string | null;
  plano: string | null;
  nomeExibido: string | null;
  cidade: string | null;
  nota: number;
  texto: string;
  textoOriginal: string | null;
  autorizadoEm: string | null;
  criadoEm: string;
  status: string;
}

export interface ResultadoLista {
  itens: DepoimentoAdmin[];
  publicados: number;
}

export interface UsuarioAdmin {
  userId: string;
  businessId?: string | null;
}

export interface DepoimentoPublico {
  texto: string;
  nota: number;
  nomeExibido: string;
  negocio: string;
  cidade: string;
  logoUrl: string | null;
}
