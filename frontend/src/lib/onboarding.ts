import api from '@/lib/api';
import type { Segmento } from '@/lib/technicalSheetTemplates';
import type { Vocabulario } from '@/lib/vocabulario';
import type { GatewayId } from '@/lib/recebimentos';

// Onboarding guiado (fase 6). Espelha backend/src/modules/onboarding.

export type ModoEquipe = 'sozinha' | 'equipe';
export type DiaSemana = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface EstadoOnboarding { pendente: boolean; bloqueante: boolean; etapa: number }

export interface Horarios {
  diasAbertos: DiaSemana[];
  abertura: string;
  fechamento: string;
  intervaloMinutos: number;
  pausa: { inicio: string; fim: string } | null;
}

export interface ServicoOnboarding { nome: string; duracaoMinutos: number; preco: number; sinalPct: number | null }

/** O que a etapa Serviços envia: sinal e Pix ficam para a etapa Recebimentos. */
export type ServicoEntrada = Omit<ServicoOnboarding, 'sinalPct'>;

export interface ServicoSugerido extends ServicoOnboarding { descricao: string; marcado: boolean }

export interface Onboarding {
  estado: EstadoOnboarding;
  negocio: { nome: string; responsavel: string; segmento: Segmento | null; modoEquipe: ModoEquipe | null };
  horarios: Horarios;
  servicos: Array<ServicoOnboarding & { id: string }>;
  pagina: { slug: string | null; slugSugerido: string; logoUrl: string | null; brandColor: string | null; fotos: number };
  whatsappConectado: boolean;
  temChavePix: boolean;
  recebimentos: {
    conexao: { gateway: GatewayId; contaNome: string; situacao: 'ativa' | 'precisa_reconectar' } | null;
    temChavePix: boolean;
  };
  vocabulario: Vocabulario;
}

export interface PrimeiroPasso { id: 'pagina' | 'whatsapp' | 'pix'; titulo: string; href: string }

export const onboardingApi = {
  ver: async () => (await api.get<Onboarding>('/onboarding')).data,
  catalogo: async (segmento: Segmento) => (await api.get<ServicoSugerido[]>('/onboarding/catalogo', { params: { segmento } })).data,
  salvarNegocio: async (segmento: Segmento, modoEquipe: ModoEquipe) =>
    (await api.put<Onboarding>('/onboarding/negocio', { segmento, modoEquipe })).data,
  salvarHorarios: async (h: Horarios) => (await api.put<Onboarding>('/onboarding/horarios', h)).data,
  salvarServicos: async (servicos: ServicoEntrada[]) =>
    (await api.put<Onboarding>('/onboarding/servicos', { servicos })).data,
  salvarRecebimentos: async (d: { chavePix?: { chave: string; tipo: TipoChavePix }; servicos: Array<{ id: string; sinalPct: number | null }> }) =>
    (await api.put<Onboarding>('/onboarding/recebimentos', d)).data,
  concluir: async () => (await api.post<Onboarding>('/onboarding/concluir')).data,
  primeirosPassos: async () => (await api.get<PrimeiroPasso[]>('/onboarding/primeiros-passos')).data,
  dispensarPrimeirosPassos: async () => { await api.post('/onboarding/primeiros-passos/dispensar'); },
};

/** As 6 etapas do onboarding, sempre com estes nomes e nesta ordem. */
export const ETAPAS = ['Seu negócio', 'Horários', 'Serviços', 'Recebimentos', 'Sua página', 'WhatsApp e link'] as const;

export const SEGMENTOS_ONBOARDING: Array<{ id: Segmento; titulo: string; descricao: string; icone: string }> = [
  { id: 'barbearia', titulo: 'Barbearia', descricao: 'Cortes masculinos, barba, pigmentação e estética facial.', icone: 'content_cut' },
  { id: 'unhas', titulo: 'Unhas', descricao: 'Manicure, pedicure, alongamentos em gel e nail art.', icone: 'brush' },
  { id: 'cilios_sobrancelhas', titulo: 'Cílios e Sobrancelha', descricao: 'Extensão de cílios, lash lifting, design e micropigmentação.', icone: 'visibility' },
  { id: 'cabelo', titulo: 'Salão de Beleza', descricao: 'Cortes, mechas, colorimetria, escovas e tratamentos capilares.', icone: 'face_3' },
  { id: 'estetica', titulo: 'Estética & Bem-estar', descricao: 'Limpeza de pele, massoterapia, drenagem e procedimentos corporais.', icone: 'spa' },
  { id: 'outro', titulo: 'Outro segmento', descricao: 'Tatuagem, podologia, maquiagem ou atendimentos personalizados.', icone: 'auto_awesome_mosaic' },
];

// O segmento escolhido na landing fica no navegador até a etapa 1 (a conta só nasce na confirmação do e-mail).
const CHAVE_SEGMENTO = 'easyagenda:segmento-cadastro';
const DA_LANDING: Record<string, Segmento> = {
  barbearia: 'barbearia', unhas: 'unhas', cilios: 'cilios_sobrancelhas', cilios_sobrancelhas: 'cilios_sobrancelhas',
  salao: 'cabelo', cabelo: 'cabelo', estetica: 'estetica', outro: 'outro',
};

export const segmentoDaLanding = (valor: string | null | undefined): Segmento | null => (valor ? DA_LANDING[valor] ?? null : null);

export function guardarSegmentoDoCadastro(valor: string | null | undefined) {
  const s = segmentoDaLanding(valor);
  if (!s) return;
  try { localStorage.setItem(CHAVE_SEGMENTO, s); } catch { /* sem armazenamento: a etapa 1 começa sem nada marcado */ }
}

export function segmentoDoCadastro(): Segmento | null {
  try { return segmentoDaLanding(localStorage.getItem(CHAVE_SEGMENTO)); } catch { return null; }
}

export function esquecerSegmentoDoCadastro() {
  try { localStorage.removeItem(CHAVE_SEGMENTO); } catch { /* nada a limpar */ }
}

export const DIAS: Array<{ id: DiaSemana; curto: string; longo: string }> = [
  { id: 'seg', curto: 'SEG', longo: 'Segunda-feira' },
  { id: 'ter', curto: 'TER', longo: 'Terça-feira' },
  { id: 'qua', curto: 'QUA', longo: 'Quarta-feira' },
  { id: 'qui', curto: 'QUI', longo: 'Quinta-feira' },
  { id: 'sex', curto: 'SEX', longo: 'Sexta-feira' },
  { id: 'sab', curto: 'SÁB', longo: 'Sábado' },
  { id: 'dom', curto: 'DOM', longo: 'Domingo' },
];

export const INTERVALOS = [0, 15, 20, 30, 45, 60, 90, 120] as const;
