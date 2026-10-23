import api from '@/lib/api';
import type { EnvioDto } from '@/lib/whatsappRetorno';

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
