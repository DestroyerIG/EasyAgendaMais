import api from '@/lib/api';

// Clube e pacotes (sub-projeto 4). Espelha backend/src/modules/clube/clube.types.ts.

export type TipoOferta = 'clube' | 'pacote';
export type StatusOferta = 'ativa' | 'pausada' | 'arquivada';
export type StatusContrato = 'aguardando_pagamento' | 'ativo' | 'em_atraso' | 'cancelado' | 'concluido' | 'expirado';
export type FormaPagamentoClube = 'pix' | 'dinheiro' | 'debito' | 'credito';

export interface Oferta {
  id: string; tipo: TipoOferta; nome: string; descricao: string | null; preco: number;
  servicos: { id: string; nome: string }[]; profissionais: { id: string; nome: string }[];
  beneficios: string[]; descontoExtrasPct: number; faltaDebita: boolean; publica: boolean;
  sessoesPorCiclo: number | null; sessoesReferencia: number; intervaloMinimoDias: number;
  totalSessoes: number | null; validadeDias: number | null;
  valorSessao: number; status: StatusOferta;
  contratosAtivos: number; receitaMensal: number;
}

export interface OfertaInput {
  tipo: TipoOferta; nome: string; descricao: string | null; preco: number;
  servicos: string[]; profissionais: string[]; beneficios: string[];
  descontoExtrasPct: number; faltaDebita: boolean; publica: boolean;
  sessoesPorCiclo: number | null; sessoesReferencia: number; intervaloMinimoDias: number;
  totalSessoes: number | null; validadeDias: number | null;
}

export interface Cobranca {
  id: string; competencia: string; valor: number; vencimento: string;
  status: 'pendente' | 'paga' | 'cancelada'; pixCopiaCola: string | null;
  forma: FormaPagamentoClube | null; pagoEm: string | null; enviadoEm: string | null;
}

export interface Contrato {
  id: string; tipo: TipoOferta; status: StatusContrato; origem: 'painel' | 'publico';
  oferta: { id: string; nome: string };
  cliente: { id: string; nome: string; telefone: string };
  preco: number; valorSessao: number;
  saldo: { restantes: number | null; total: number | null; usadas: number };
  cicloInicio: string | null; cicloFim: string | null; validoAte: string | null; cancelaEm: string | null;
  proximoVencimento: string | null;
  cobrancaPendente: Cobranca | null;
  ultimaForma: FormaPagamentoClube | null;
  criadoEm: string;
}

export interface Indicadores { ativos: number; receitaMensal: number; emAtraso: number; cancelam30dias: number }
export interface ListaContratos { itens: Contrato[]; total: number; pagina: number; porPagina: number; indicadores: Indicadores }
export interface FiltroContratos { tipo?: TipoOferta; status?: StatusContrato; busca?: string; pagina?: number }

export interface OfertaPublica {
  id: string; nome: string; descricao: string | null; preco: number; servicos: string[]; beneficios: string[];
  sessoesPorCiclo: number | null; intervaloMinimoDias: number; descontoExtrasPct: number; valorSessao: number;
}
export interface NegocioPublico { nome: string; slug: string; logoUrl: string | null; brandColor: string | null }
export interface ResultadoAdesao {
  oferta: { id: string; nome: string };
  cobranca: { valor: number; pixCopiaCola: string | null; vencimento: string };
  repetida: boolean;
}

export const clubeApi = {
  ofertas: async () => (await api.get<Oferta[]>('/clube/ofertas')).data,
  criarOferta: async (o: OfertaInput) => (await api.post<Oferta>('/clube/ofertas', o)).data,
  editarOferta: async (id: string, o: OfertaInput) => (await api.put<Oferta>(`/clube/ofertas/${id}`, o)).data,
  mudarStatus: async (id: string, status: StatusOferta) => (await api.put<Oferta>(`/clube/ofertas/${id}`, { status })).data,
  contratos: async (f: FiltroContratos = {}) =>
    (await api.get<ListaContratos>('/clube/contratos', { params: { ...f, busca: f.busca || undefined } })).data,
  vincular: async (d: { ofertaId: string; clientId: string; pagamento: { forma: FormaPagamentoClube; pago: boolean } }) =>
    (await api.post<Contrato>('/clube/contratos', d)).data,
  cancelar: async (id: string) => (await api.post<Contrato>(`/clube/contratos/${id}/cancelar`)).data,
  confirmar: async (cobrancaId: string, forma: FormaPagamentoClube) =>
    (await api.post<Contrato>(`/clube/cobrancas/${cobrancaId}/confirmar`, { forma })).data,
  reenviar: async (cobrancaId: string) =>
    (await api.post<{ enviada: boolean; pixCopiaCola: string | null }>(`/clube/cobrancas/${cobrancaId}/reenviar`)).data,
  doCliente: async (clientId: string) => (await api.get<(Contrato & { vigente: boolean })[]>(`/clube/clientes/${clientId}`)).data,
  async exportarCsv(): Promise<void> {
    const res = await api.get<Blob>('/clube/contratos/export.csv', { responseType: 'blob' });
    const cd = String(res.headers?.['content-disposition'] ?? '');
    const nome = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? 'assinantes.csv';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const clubePublicoApi = {
  vitrine: async (slug: string) => (await api.get<{ negocio: NegocioPublico; ofertas: OfertaPublica[] }>(`/public/${slug}/clube`)).data,
  oferta: async (slug: string, id: string) => (await api.get<{ negocio: NegocioPublico; oferta: OfertaPublica }>(`/public/${slug}/clube/${id}`)).data,
  aderir: async (slug: string, id: string, d: { nome: string; telefone: string; consentimento: true }) =>
    (await api.post<ResultadoAdesao>(`/public/${slug}/clube/${id}/adesao`, d)).data,
};

// ─── Textos ────────────────────────────────────────────────────────────────

export const ROTULO_FORMA_CLUBE: Record<FormaPagamentoClube, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Cartão débito', credito: 'Cartão crédito',
};

export const STATUS_CONTRATO: Record<StatusContrato, { rotulo: string; classe: string }> = {
  aguardando_pagamento: { rotulo: 'Aguardando Pix', classe: 'bg-warning/12 text-warning-text' },
  ativo: { rotulo: 'Ativo', classe: 'bg-success/12 text-success-text' },
  em_atraso: { rotulo: 'Em atraso', classe: 'bg-danger/12 text-danger' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-surface-2 text-muted' },
  concluido: { rotulo: 'Concluído', classe: 'bg-surface-2 text-muted' },
  expirado: { rotulo: 'Vencido', classe: 'bg-surface-2 text-muted' },
};

export const dataCurta = (d: string) => {
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${d.slice(8, 10)} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
};

/** "1 de 4 neste mês", "Sessão 4 de 10", "Ilimitado". */
export function rotuloSaldo(c: Pick<Contrato, 'tipo' | 'saldo'>): { principal: string; detalhe: string } {
  const { restantes, total, usadas } = c.saldo;
  if (total === null) return { principal: `${usadas} usadas`, detalhe: 'Ilimitado' };
  if (c.tipo === 'clube') return { principal: `${usadas} de ${total}`, detalhe: restantes ? `${restantes} disp.` : 'Completo' };
  return { principal: `${usadas} de ${total}`, detalhe: `${restantes} rest.` };
}

/** Regra de uso em uma linha, para o cartão da oferta e a página de adesão. */
export function regraDeUso(o: Pick<Oferta, 'tipo' | 'sessoesPorCiclo' | 'totalSessoes' | 'validadeDias' | 'intervaloMinimoDias'>): string {
  if (o.tipo === 'pacote') {
    const meses = o.validadeDias ? Math.round(o.validadeDias / 30) : null;
    return `${o.totalSessoes} sessões · validade de ${meses && meses >= 1 ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : `${o.validadeDias} dias`} após a 1ª sessão`;
  }
  const base = o.sessoesPorCiclo === null ? 'Uso livre no mês' : `${o.sessoesPorCiclo} ${o.sessoesPorCiclo === 1 ? 'sessão' : 'sessões'} por mês (não cumulativas)`;
  return o.intervaloMinimoDias > 0 ? `${base} · intervalo mínimo de ${o.intervaloMinimoDias} dias` : base;
}
