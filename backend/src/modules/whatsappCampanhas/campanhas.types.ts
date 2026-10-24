import { z } from 'zod';
import type { EnvioDto } from '../whatsappFila/fila.service.js';

export type Segmento = 'em_risco' | 'reativacao' | 'aniversariantes' | 'vips' | 'todas';
export const SEGMENTOS: Segmento[] = ['em_risco', 'reativacao', 'aniversariantes', 'vips', 'todas'];

/** Intervalo médio entre mensagens, em segundos. */
export type Cadencia = 10 | 25 | 60;

/** Status que ficam gravados no banco; os demais são derivados. */
export type StatusGravado = 'rascunho' | 'agendada' | 'cancelada';
export type StatusCampanha = StatusGravado | 'enviando' | 'concluida';

export const LIMITE_TEXTO_CAMPANHA = 1000;
export const RODAPE_SAIR = 'Responda SAIR para não receber novidades.';
export const VARIAVEIS_CAMPANHA = ['primeiro_nome', 'profissional', 'servico', 'horarios_livres', 'link'];

export const PublicoSchema = z.object({
  segmento: z.enum(SEGMENTOS as [Segmento, ...Segmento[]]),
  professionalId: z.string().uuid().nullable().default(null),
  serviceId: z.string().uuid().nullable().default(null),
  texto: z.string().max(LIMITE_TEXTO_CAMPANHA).default(''),
});

export const SalvarCampanhaSchema = PublicoSchema.extend({
  nome: z.string().trim().min(1).max(80),
  texto: z.string().trim().min(1).max(LIMITE_TEXTO_CAMPANHA),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[03]0$/),
  cadencia: z.union([z.literal(10), z.literal(25), z.literal(60)]).default(25),
  acao: z.enum(['rascunho', 'agendar']),
});

export interface CampanhaDto {
  id: string;
  nome: string;
  segmento: Segmento;
  professionalId: string | null;
  serviceId: string | null;
  texto: string;
  data: string;
  hora: string;
  cadencia: Cadencia;
  status: StatusCampanha;
  total: number;
  enviadas: number;
  createdAt: string;
}

export interface PublicoDto {
  selecionadas: number;
  receberao: number;
  resguardadas: number;
  amostra: { nome: string; telefone: string; texto: string } | null;
}

export interface DetalhesCampanhaDto {
  campanha: CampanhaDto;
  contagem: { enviadas: number; naFila: number; puladas: number; falhas: number; canceladas: number };
  itens: Array<{ id: string; nome: string; telefone: string; status: EnvioDto['status']; motivo: string | null; enviadoEm: string | null }>;
}
