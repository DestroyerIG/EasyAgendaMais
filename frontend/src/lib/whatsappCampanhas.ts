import api from '@/lib/api';
import type { EnvioDto } from '@/lib/whatsappRetorno';
import type { Termos } from '@/lib/vocabulario';

export type Segmento = 'em_risco' | 'reativacao' | 'aniversariantes' | 'vips' | 'todas';
export type Cadencia = 10 | 25 | 60;
export type StatusCampanha = 'rascunho' | 'agendada' | 'cancelada' | 'enviando' | 'concluida';

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  em_risco: 'Não vêm há mais de 30 dias (Em risco)',
  reativacao: 'Inativas há mais de 60 dias (Reativação)',
  aniversariantes: 'Aniversariantes do mês',
  vips: 'Top 10% mais frequentes (VIPs)',
  todas: 'Todas as clientes',
};

/** Rótulo do segmento no vocabulário do negócio ("Inativos", "Todos os clientes" na barbearia). */
export const rotuloSegmento = (s: Segmento, t: Termos) =>
  t.adaptar(ROTULO_SEGMENTO[s].replace('Inativas', t.cli.g('Inativas', 'Inativos')));

export const ROTULO_STATUS: Record<StatusCampanha, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  enviando: 'Enviando',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const LIMITE_TEXTO_CAMPANHA = 1000;
export const RODAPE_SAIR = 'Responda SAIR para não receber novidades.';
export const VARIAVEIS_CAMPANHA = ['primeiro_nome', 'profissional', 'servico', 'horarios_livres', 'link'];

export interface CampanhaDto {
  id: string; nome: string; segmento: Segmento;
  professionalId: string | null; serviceId: string | null; texto: string;
  data: string; hora: string; cadencia: Cadencia; status: StatusCampanha;
  total: number; enviadas: number; createdAt: string;
}

export interface PublicoFiltro {
  segmento: Segmento; professionalId: string | null; serviceId: string | null; texto: string;
}

export interface PublicoDto {
  selecionadas: number; receberao: number; resguardadas: number;
  amostra: { nome: string; telefone: string; texto: string } | null;
}

export interface DetalhesCampanhaDto {
  campanha: CampanhaDto;
  contagem: { enviadas: number; naFila: number; puladas: number; falhas: number; canceladas: number };
  itens: Array<{ id: string; nome: string; telefone: string; status: EnvioDto['status']; motivo: string | null; enviadoEm: string | null }>;
}

export interface SalvarCampanha extends PublicoFiltro {
  nome: string; data: string; hora: string; cadencia: Cadencia; acao: 'rascunho' | 'agendar';
}

export interface OpcoesCampanhaDto {
  profissionais: Array<{ id: string; nome: string }>;
  servicos: Array<{ id: string; nome: string }>;
}

const BASE = '/whatsapp/campanhas';

export const listarCampanhas = async () => (await api.get<CampanhaDto[]>(BASE)).data;
export const opcoesCampanha = async () => (await api.get<OpcoesCampanhaDto>(`${BASE}/opcoes`)).data;
export const previaPublico = async (f: PublicoFiltro) => (await api.post<PublicoDto>(`${BASE}/publico`, f)).data;
export const criarCampanha = async (body: SalvarCampanha) =>
  (await api.post<{ campanha: CampanhaDto; jaNaFila: number }>(BASE, body)).data;
export const salvarCampanha = async (id: string, body: SalvarCampanha) =>
  (await api.put<{ campanha: CampanhaDto; jaNaFila: number }>(`${BASE}/${id}`, body)).data;
export const detalhesCampanha = async (id: string) => (await api.get<DetalhesCampanhaDto>(`${BASE}/${id}`)).data;
export const cancelarCampanha = async (id: string) => (await api.post(`${BASE}/${id}/cancelar`)).data;

const FIM_DO_DIA_MIN = 20 * 60;

/** Tempo estimado de envio (total ÷ cadência por hora) e aviso quando passa das 20h. */
export function previsaoDuracao(total: number, cadencia: Cadencia, hora: string): string {
  const minutos = Math.ceil((total / cadencia) * 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const texto = h > 0 ? `${h}h ${m}min` : `${m}min`;
  const [hh, mm] = hora.split(':').map(Number);
  return hh * 60 + mm + minutos > FIM_DO_DIA_MIN ? `${texto} — continua no dia seguinte às 08:00` : texto;
}

/** Nome curto do segmento, usado no nome automático (igual ao backend, campanhas.rules.ts). */
export const NOME_CURTO_SEGMENTO: Record<Segmento, string> = {
  em_risco: 'Em risco',
  reativacao: 'Reativação',
  aniversariantes: 'Aniversariantes',
  vips: 'VIPs',
  todas: 'Todas',
};

/** Ex.: "Reativação · 21/10" (mesma regra de nomeAutomatico no backend). */
export function nomeAutomatico(segmento: Segmento, hojeYmd: string): string {
  return `${NOME_CURTO_SEGMENTO[segmento]} · ${hojeYmd.slice(8, 10)}/${hojeYmd.slice(5, 7)}`;
}

const INTERVALO_MIN_S = 45;
const CADENCIA_PADRAO = 25;

/** Espelho de intervaloCampanha (whatsappFila/fila.rules.ts): 3600 / cadência ±25%, nunca abaixo de 45 s. */
export function intervaloCampanha(cadencia: number, rand: () => number = Math.random): number {
  const porHora = cadencia > 0 ? cadencia : CADENCIA_PADRAO;
  return Math.max(INTERVALO_MIN_S, Math.round((3600 / porHora) * (0.75 + 0.5 * rand())));
}

/** Faixa mostrada em "Intervalo Dinâmico": 60/h → "45 a 75 segundos". */
export const faixaIntervalo = (cadencia: Cadencia) =>
  `${intervaloCampanha(cadencia, () => 0)} a ${intervaloCampanha(cadencia, () => 1)} segundos`;

/** Horários de início: 08:00 a 19:30, de 30 em 30 minutos. */
export const HORARIOS_CAMPANHA: string[] = Array.from({ length: 24 }, (_, i) =>
  `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export const DIAS_AGENDAMENTO = 30;

const FUSO = 'America/Sao_Paulo';

/** Data e hora de agora no fuso do painel. */
export function agoraNoFuso(agora: Date = new Date()): { ymd: string; hhmm: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(agora).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

export function somarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Id do rascunho criado num agendamento que falhou (400 com details: [{ campanhaId }]).
 * O interceptor de `api` move os details para `data.details`; sem ele ficam em `data.error.details`.
 */
export function campanhaIdDoErro(erro: unknown): string | null {
  const data = (erro as { response?: { data?: { details?: unknown; error?: unknown } } } | null)?.response?.data;
  const doErro = data?.error && typeof data.error === 'object' ? (data.error as { details?: unknown }).details : undefined;
  for (const details of [data?.details, doErro]) {
    if (!Array.isArray(details)) continue;
    for (const d of details) {
      if (d && typeof d === 'object' && typeof (d as { campanhaId?: unknown }).campanhaId === 'string') {
        return (d as { campanhaId: string }).campanhaId;
      }
    }
  }
  return null;
}
