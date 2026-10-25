import api from '@/lib/api';
import type { ComandaDetail, ComandaExtraInput, ComandaShortcut, PaymentMethod } from '@/lib/comanda';
import { corpoDaFoto, type EnvioFotoExtra, type FotoCliente } from '@/lib/clientPhotos';
import type { Periodo, ModeloRepasse, StatusRepasse, FormaRepasse } from '@/lib/relatorios';

// App da profissional (fase 5). Espelha backend/src/modules/bancada.

export type StatusAgendamento = 'aguardando_pagamento' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'faltou';

export interface ItemAgenda {
  id: string; time: string; status: StatusAgendamento; source: string;
  deposito: number; confirmouWhatsapp: boolean;
  cliente: { id: string; name: string; phone: string };
  servico: { id: string; nome: string; duracao: number; preco: number };
  comanda: { id: string; status: 'rascunho' | 'fechada'; pago: number; forma: PaymentMethod | null; enviadaRecepcaoEm: string | null } | null;
}

export interface VisitaComEla { id: string; data: string; servicos: string; valor: number | null }

export interface Destaque {
  agendamentoId: string;
  emMinutos: number | null;
  fase: string;
  visitas: number;
  alergias: string | null;
  ficha: { rotulo: string; valor: string }[];
  ultimoTrabalho: VisitaComEla | null;
}

export interface Hoje {
  profissional: { id: string; nome: string };
  data: string; hoje: string;
  profissionalCobra: boolean;
  resumo: { total: number; emAndamento: number; concluidos: number };
  destaque: Destaque | null;
  agenda: ItemAgenda[];
}

export interface ClienteDela { id: string; name: string; phone: string }

export interface FichaRapida {
  cliente: { id: string; name: string; phone: string; notes: string | null; [k: string]: unknown };
  fase: string;
  etiquetas: { id: string; name: string; color?: string }[];
  etiquetasAuto: string[];
  indicadores: { visitas: number; ticketMedio: number | null; cicloMedio: number | null };
  fichaTecnica: {
    allergies: string | null;
    fields: Record<string, string>;
    customFields: { label: string; value: string }[];
    campos: { key: string; label: string }[];
  };
  fotos: FotoCliente[];
  visitas: VisitaComEla[];
}

export type ComandaBancada = ComandaDetail & { profissionalCobra: boolean; enviadaRecepcaoEm?: string | null };

export interface BancadaComandaInput {
  extras: ComandaExtraInput[];
  discount?: number; tip?: number; paymentMethod?: PaymentMethod | null; usarCobertura?: boolean;
}

export interface ItemExtrato {
  id: string; numero: number; fechadaEm: string; hora: string; cliente: string; pago: number;
  itens: { kind: 'servico' | 'produto'; nome: string; quantidade: number; valor: number; coberto: boolean }[];
  parte: { servico: number; produto: number; gorjeta: number; total: number };
}

export interface ResumoAvaliacoes { media: number | null; quantidade: number }

export interface Avaliacao {
  id: string; nota: number; comentario: string | null; criadaEm: string; origem: 'link' | 'whatsapp' | string;
  cliente: string; servico: string; data: string;
}

export interface MeusNumeros {
  periodo: Periodo;
  profissional: { id: string; nome: string };
  modelo: ModeloRepasse;
  resumo: {
    atendimentos: number; faturamento: number; comissaoServico: number; comissaoProduto: number; gorjetas: number;
    adiantamentos: number; aPagar: number; status: StatusRepasse;
    repasse: { pagoEm: string; forma: FormaRepasse } | null;
  } | null;
  extrato: ItemExtrato[];
  avaliacoes: ResumoAvaliacoes;
}

export const MOTIVOS_CANCELAMENTO = ['Imprevisto da profissional', 'Pedido da cliente', 'Horário marcado errado', 'Outro'] as const;

export const bancadaApi = {
  hoje: async (data?: string) => (await api.get<Hoje>('/bancada/hoje', { params: data ? { data } : {} })).data,
  clientes: async (busca?: string) =>
    (await api.get<ClienteDela[]>('/bancada/clientes', { params: busca ? { busca } : {} })).data,
  ficha: async (id: string) => (await api.get<FichaRapida>(`/bancada/clientes/${id}`)).data,
  salvarNota: async (id: string, notas: string | null) =>
    (await api.put<{ notas: string | null }>(`/bancada/clientes/${id}/nota`, { notas })).data,
  enviarFoto: async (clientId: string, arquivo: File, extra: EnvioFotoExtra = {}) =>
    (await api.post<FotoCliente>(`/bancada/clientes/${clientId}/fotos`, await corpoDaFoto(arquivo, extra))).data,
  iniciar: async (appointmentId: string) => (await api.post<ComandaBancada>(`/bancada/agendamentos/${appointmentId}/iniciar`)).data,
  horarios: async (agendamento: string, data: string) =>
    (await api.get<string[]>('/bancada/horarios', { params: { agendamento, data } })).data,
  reagendar: async (id: string, body: { data: string; hora: string; avisarCliente: boolean }) =>
    (await api.post<{ data: string; hora: string; avisoEnviado: boolean }>(`/bancada/agendamentos/${id}/reagendar`, body)).data,
  cancelar: async (id: string, body: { motivo: string; avisarCliente: boolean }) =>
    (await api.post<{ cancelado: true; avisoEnviado: boolean }>(`/bancada/agendamentos/${id}/cancelar`, body)).data,
  atalhos: async () => (await api.get<ComandaShortcut[]>('/bancada/atalhos')).data,
  comanda: async (id: string) => (await api.get<ComandaBancada>(`/bancada/comandas/${id}`)).data,
  salvarComanda: async (id: string, body: BancadaComandaInput) => (await api.put<ComandaBancada>(`/bancada/comandas/${id}`, body)).data,
  enviarParaRecepcao: async (id: string, body: BancadaComandaInput) =>
    (await api.post<ComandaBancada>(`/bancada/comandas/${id}/enviar`, body)).data,
  fecharComanda: async (id: string, body: BancadaComandaInput) =>
    (await api.post<ComandaBancada>(`/bancada/comandas/${id}/fechar`, body)).data,
  numeros: async (p?: Periodo) => (await api.get<MeusNumeros>('/bancada/numeros', { params: p ?? {} })).data,
  avaliacoes: async (p?: Periodo) =>
    (await api.get<ResumoAvaliacoes & { itens: Avaliacao[] }>('/bancada/avaliacoes', { params: p ?? {} })).data,
};

// ─── Regras de tela ───────────────────────────────────────────────────────────

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

/** "Agora", "Em 20 min", "Em 1h05". */
export function rotuloEmMinutos(min: number | null): string | null {
  if (min === null) return null;
  if (min <= 0) return 'Agora';
  if (min < 60) return `Em ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `Em ${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** Espelha bancada.rules: reagendar só confirmado, que ainda não passou. */
export const podeReagendar = (a: Pick<ItemAgenda, 'status' | 'time'>, data: string, hoje: string, agora: string) =>
  a.status === 'confirmado' && (data > hoje || (data === hoje && a.time >= agora));

/** Espelha bancada.rules: cancelar confirmado ou aguardando o sinal, de hoje em diante. */
export const podeCancelar = (a: Pick<ItemAgenda, 'status'>, data: string, hoje: string) =>
  (a.status === 'confirmado' || a.status === 'aguardando_pagamento') && data >= hoje;

export const horaAgora = (d: Date = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  aguardando_pagamento: 'Aguardando sinal',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
};
