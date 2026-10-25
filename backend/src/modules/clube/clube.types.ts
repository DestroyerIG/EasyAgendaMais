import { z } from 'zod';

export const FORMAS_PAGAMENTO_CLUBE = ['pix', 'dinheiro', 'debito', 'credito'] as const;
export type FormaPagamentoClube = (typeof FORMAS_PAGAMENTO_CLUBE)[number];

const preco = z.number().positive('Informe um preço maior que zero').multipleOf(0.01).max(99999.99);

export const OfertaSchema = z.object({
  tipo: z.enum(['clube', 'pacote']),
  nome: z.string().trim().min(2, 'Dê um nome ao plano').max(120),
  descricao: z.string().trim().max(1000).nullish(),
  preco,
  servicos: z.array(z.string().uuid()).min(1, 'Escolha ao menos um serviço').max(50),
  profissionais: z.array(z.string().uuid()).max(50).default([]),
  beneficios: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  descontoExtrasPct: z.number().min(0).max(100).multipleOf(0.01).default(0),
  faltaDebita: z.boolean().default(false),
  publica: z.boolean().default(false),
  // clube
  sessoesPorCiclo: z.number().int().min(1).max(31).nullish(),
  sessoesReferencia: z.number().int().min(1).max(31).default(4),
  intervaloMinimoDias: z.number().int().min(0).max(60).default(0),
  // pacote
  totalSessoes: z.number().int().min(2, 'O pacote precisa de ao menos 2 sessões').max(100).nullish(),
  validadeDias: z.number().int().min(30, 'Validade mínima de 30 dias').max(730).nullish(),
}).superRefine((o, ctx) => {
  if (o.tipo === 'pacote') {
    if (!o.totalSessoes) ctx.addIssue({ code: 'custom', path: ['totalSessoes'], message: 'Informe o total de sessões' });
    if (!o.validadeDias) ctx.addIssue({ code: 'custom', path: ['validadeDias'], message: 'Informe a validade' });
    if (o.publica) ctx.addIssue({ code: 'custom', path: ['publica'], message: 'Só o clube aparece na página de adesão' });
  }
});
export type OfertaInput = z.infer<typeof OfertaSchema>;

export const EditarOfertaSchema = z.union([
  OfertaSchema,
  z.object({ status: z.enum(['ativa', 'pausada', 'arquivada']) }),
]);
export type EditarOfertaInput = z.infer<typeof EditarOfertaSchema>;

export const VincularSchema = z.object({
  ofertaId: z.string().uuid(),
  clientId: z.string().uuid(),
  pagamento: z.object({ forma: z.enum(FORMAS_PAGAMENTO_CLUBE), pago: z.boolean() }),
});
export type VincularInput = z.infer<typeof VincularSchema>;

export const ConfirmarCobrancaSchema = z.object({ forma: z.enum(FORMAS_PAGAMENTO_CLUBE) });

export const ListaContratosQuerySchema = z.object({
  tipo: z.enum(['clube', 'pacote']).optional(),
  status: z.enum(['aguardando_pagamento', 'ativo', 'em_atraso', 'cancelado', 'concluido', 'expirado']).optional(),
  busca: z.string().trim().max(100).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
export type ListaContratosQuery = z.infer<typeof ListaContratosQuerySchema>;

export const AdesaoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(255),
  telefone: z.string().trim().min(10, 'Informe seu WhatsApp com DDD').max(20),
  consentimento: z.literal(true, { message: 'Aceite os termos para continuar' }),
});
export type AdesaoInput = z.infer<typeof AdesaoSchema>;

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface OfertaDto {
  id: string; tipo: 'clube' | 'pacote'; nome: string; descricao: string | null; preco: number;
  servicos: { id: string; nome: string }[]; profissionais: { id: string; nome: string }[];
  beneficios: string[]; descontoExtrasPct: number; faltaDebita: boolean; publica: boolean;
  sessoesPorCiclo: number | null; sessoesReferencia: number; intervaloMinimoDias: number;
  totalSessoes: number | null; validadeDias: number | null;
  valorSessao: number; status: 'ativa' | 'pausada' | 'arquivada';
  contratosAtivos: number; receitaMensal: number;
}

export interface CobrancaDto {
  id: string; competencia: string; valor: number; vencimento: string;
  status: 'pendente' | 'paga' | 'cancelada'; pixCopiaCola: string | null;
  forma: FormaPagamentoClube | null; pagoEm: string | null; enviadoEm: string | null;
}

export interface ContratoDto {
  id: string; tipo: 'clube' | 'pacote';
  status: 'aguardando_pagamento' | 'ativo' | 'em_atraso' | 'cancelado' | 'concluido' | 'expirado';
  origem: 'painel' | 'publico';
  oferta: { id: string; nome: string };
  cliente: { id: string; nome: string; telefone: string };
  preco: number; valorSessao: number;
  saldo: { restantes: number | null; total: number | null; usadas: number };
  cicloInicio: string | null; cicloFim: string | null; validoAte: string | null; cancelaEm: string | null;
  proximoVencimento: string | null;
  cobrancaPendente: CobrancaDto | null;
  ultimaForma: FormaPagamentoClube | null;
  criadoEm: string;
}

export interface IndicadoresClube {
  ativos: number; receitaMensal: number; emAtraso: number; cancelam30dias: number;
}
