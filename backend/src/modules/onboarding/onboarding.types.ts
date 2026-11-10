import { z } from 'zod';
import { validatePixKeyFormat } from '../../utils/pixPayload.js';
import { PixKeyTypeSchema } from '../businessPublicPage/businessPublicPage.types.js';
import type { Vocabulario } from '../../config/vocabulario.js';
import type { ServicoSugerido } from './onboarding.catalogo.js';

const SegmentoSchema = z.enum(['unhas', 'cilios_sobrancelhas', 'cabelo', 'barbearia', 'estetica', 'outro']);
const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');
export const INTERVALOS = [0, 15, 20, 30, 45, 60, 90, 120] as const;

export const CatalogoQuerySchema = z.object({ segmento: SegmentoSchema });

export const NegocioSchema = z.object({
  segmento: SegmentoSchema,
  modoEquipe: z.enum(['sozinha', 'equipe']),
});

export const HorariosSchema = z.object({
  diasAbertos: z.array(z.enum(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'])).min(1, 'Escolha pelo menos um dia de atendimento'),
  abertura: Hora,
  fechamento: Hora,
  intervaloMinutos: z.number().int().refine((v) => (INTERVALOS as readonly number[]).includes(v), 'Intervalo inválido'),
  pausa: z.object({ inicio: Hora, fim: Hora }).nullable().optional(),
});

export const ServicosSchema = z
  .object({
    servicos: z
      .array(z.object({
        nome: z.string().trim().min(2, 'Nome do serviço muito curto').max(255),
        duracaoMinutos: z.number().int().min(10, 'Duração mínima de 10 minutos').max(300, 'Duração máxima de 300 minutos'),
        preco: z.number().positive('O preço precisa ser maior que zero').multipleOf(0.01),
      }))
      .min(1, 'Escolha pelo menos um serviço')
      .max(40),
  })
  .superRefine((d, ctx) => {
    const nomes = d.servicos.map((s) => s.nome.toLowerCase());
    if (new Set(nomes).size !== nomes.length) ctx.addIssue({ code: 'custom', path: ['servicos'], message: 'Há serviços com o mesmo nome' });
  });

export const RecebimentosSchema = z
  .object({
    chavePix: z.object({ chave: z.string().trim().min(1).max(255), tipo: PixKeyTypeSchema }).optional(),
    servicos: z.array(z.object({ id: z.string().uuid(), sinalPct: z.number().min(1).max(100).nullable() })).max(40),
  })
  .superRefine((d, ctx) => {
    if (d.chavePix) {
      const erro = validatePixKeyFormat(d.chavePix.chave, d.chavePix.tipo);
      if (erro) ctx.addIssue({ code: 'custom', path: ['chavePix', 'chave'], message: erro });
    }
  });

export type Segmento = z.infer<typeof SegmentoSchema>;
export type NegocioInput = z.infer<typeof NegocioSchema>;
export type HorariosInput = z.infer<typeof HorariosSchema>;
export type ServicosInput = z.infer<typeof ServicosSchema>;
export type RecebimentosInput = z.infer<typeof RecebimentosSchema>;

export interface EstadoOnboarding { pendente: boolean; bloqueante: boolean; etapa: number }

export interface PrimeiroPasso { id: 'pagina' | 'whatsapp' | 'pix'; titulo: string; href: string }

export interface OnboardingDto {
  estado: EstadoOnboarding;
  negocio: { nome: string; responsavel: string; segmento: Segmento | null; modoEquipe: 'sozinha' | 'equipe' | null };
  horarios: { diasAbertos: string[]; abertura: string; fechamento: string; intervaloMinutos: number; pausa: { inicio: string; fim: string } | null };
  servicos: Array<{ id: string; nome: string; duracaoMinutos: number; preco: number; sinalPct: number | null }>;
  pagina: { slug: string | null; slugSugerido: string; logoUrl: string | null; brandColor: string | null; fotos: number };
  whatsappConectado: boolean;
  temChavePix: boolean;
  recebimentos: {
    conexao: { gateway: 'mercadopago' | 'infinitepay'; contaNome: string; situacao: 'ativa' | 'precisa_reconectar' } | null;
    temChavePix: boolean;
  };
  vocabulario: Vocabulario;
}

export type CatalogoDto = ServicoSugerido[];
