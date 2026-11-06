// Regras puras da página pública de agendamento.

export const NOTA_MINIMA_AVALIACOES = 5;
export const DIAS_NA_FAIXA = 14;

export type SituacaoReserva = 'aguardando' | 'confirmado' | 'expirado' | 'cancelado';

/** A nota só aparece se o dono ligou e já há avaliações suficientes para a média dizer algo. */
export function notaPublica(
  mostrar: boolean,
  resumo: { media: number | null; quantidade: number } | null,
): { media: number; quantidade: number } | null {
  if (!mostrar || !resumo || resumo.media === null || resumo.quantidade < NOTA_MINIMA_AVALIACOES) return null;
  return { media: Math.round(resumo.media * 10) / 10, quantidade: resumo.quantidade };
}

export function situacaoDaReserva(status: string, expiresAt: Date | null, agora: Date): SituacaoReserva {
  if (status === 'aguardando_pagamento') {
    return expiresAt && expiresAt.getTime() > agora.getTime() ? 'aguardando' : 'expirado';
  }
  return status === 'cancelado' ? 'cancelado' : 'confirmado';
}

/** Lista de datas YYYY-MM-DD a partir de `inicio`, inclusive. */
export function diasAPartirDe(inicio: string, quantidade: number): string[] {
  const base = Date.parse(`${inicio}T00:00:00Z`);
  return Array.from({ length: quantidade }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}
