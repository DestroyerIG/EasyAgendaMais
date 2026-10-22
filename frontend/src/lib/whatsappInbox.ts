import api from '@/lib/api';

export type Direcao = 'in' | 'out';
export type Origem = 'cliente' | 'bot' | 'lembrete' | 'confirmacao' | 'pix_recibo' | 'lista_espera'
  | 'retorno' | 'sinal_pix' | 'aniversario' | 'avaliacao' | 'campanha' | 'manual_painel' | 'manual_celular' | 'sistema' | 'painel_evento';
export type StatusMensagem = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou';
export type Atendimento = 'bot' | 'humano';
export type StatusConversa = 'aberta' | 'aguardando' | 'finalizada';

export type FiltroConversa = 'todas' | 'aguardando' | 'bot' | 'finalizadas';
export interface ConversaResumoDto {
  id: string; telefone: string; nome: string | null; clientId: string | null;
  atendimento: Atendimento; status: StatusConversa; responsavel: { id: string; nome: string } | null;
  ultimaMensagemEm: string; previa: string; naoLidas: number; sinalPendente: boolean;
  avatarUrl: string | null;
}
export interface ListaConversasDto {
  itens: ConversaResumoDto[];
  contadores: Record<FiltroConversa, number>;
  proximoCursor: string | null;
}
export interface MensagemDto {
  id: string; direcao: Direcao; origem: Origem; texto: string; tipoMidia: string | null;
  status: StatusMensagem; autor: string | null; criadaEm: string;
}
export interface ListaMensagensDto { itens: MensagemDto[]; temMais: boolean }
export interface AgendamentoRelacionadoDto {
  id: string; data: string; hora: string; status: string; servico: string; valor: number;
  profissional: string; sinal: number | null; expiraEm: string | null;
}
export interface ContextoClienteDto {
  cliente: { id: string; nome: string; telefone: string; desde: string };
  fase: string; ltv: number; cicloMedio: number | null;
  agendamento: AgendamentoRelacionadoDto | null;
  ultimasVisitas: Array<{ data: string; servico: string; valor: number }>;
}
export interface ConversaDetalheDto { conversa: ConversaResumoDto; contexto: ContextoClienteDto | null }

export interface RespostaRapidaDto {
  chave: 'pix' | 'como_chegar' | 'horarios' | 'politica'; rotulo: string;
  disponivel: boolean; texto: string | null; motivo: string | null;
}
export interface ResumoConexaoDto {
  conectado: boolean; numero: string | null; conectadoDesde: string | null; diasConectado: number | null; semInterrupcoes: boolean;
  enviosHoje: { total: number; falhas: number; limite: number; percentual: number; disponiveis: number;
    grupos: { automaticas: number; pix: number; manuais: number } };
  saude: 'Excelente' | 'Boa' | 'Atenção';
  historico: Array<{ id: string; criadaEm: string; cliente: string | null; telefone: string; tipo: string; status: StatusMensagem }>;
}

export const listarConversas = async (filtro: FiltroConversa, cursor?: string) =>
  (await api.get<ListaConversasDto>('/whatsapp/conversations', { params: { filtro, ...(cursor ? { cursor } : {}) } })).data;
export const buscarConversa = async (id: string) => (await api.get<ConversaDetalheDto>(`/whatsapp/conversations/${id}`)).data;
export const listarMensagens = async (id: string, antes?: string) =>
  (await api.get<ListaMensagensDto>(`/whatsapp/conversations/${id}/messages`, { params: antes ? { antes } : {} })).data;
export const enviarMensagem = async (id: string, texto: string) =>
  (await api.post<{ enviado: true }>(`/whatsapp/conversations/${id}/messages`, { texto })).data;
export const assumirConversa = async (id: string) => (await api.post<ConversaResumoDto>(`/whatsapp/conversations/${id}/assumir`)).data;
export const devolverConversa = async (id: string) => (await api.post<ConversaResumoDto>(`/whatsapp/conversations/${id}/devolver`)).data;
export const marcarLidas = async (ids?: string[]) => (await api.post<{ atualizadas: number }>('/whatsapp/conversations/lidas', ids ? { ids } : {})).data;
export const buscarRespostasRapidas = async (id: string) => (await api.get<RespostaRapidaDto[]>(`/whatsapp/conversations/${id}/respostas-rapidas`)).data;
export const buscarResumoConexao = async () => (await api.get<ResumoConexaoDto>('/whatsapp/connection/summary')).data;

const FUSO = 'America/Sao_Paulo';

const partesNoFuso = (d: Date) => {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return { ano: pega('year'), mes: pega('month'), dia: pega('day'), hora: pega('hour'), minuto: pega('minute') };
};

/** "10:42" hoje, "Ontem", ou "14/10" (fuso America/Sao_Paulo, como o restante do painel). */
export function horaCurta(iso: string, agora: Date = new Date()): string {
  const alvo = partesNoFuso(new Date(iso));
  const hoje = partesNoFuso(agora);
  const chave = (p: { ano: string; mes: string; dia: string }) => `${p.ano}-${p.mes}-${p.dia}`;
  if (chave(alvo) === chave(hoje)) return `${alvo.hora}:${alvo.minuto}`;
  const ontem = new Date(Date.UTC(Number(hoje.ano), Number(hoje.mes) - 1, Number(hoje.dia) - 1));
  const dois = (n: number) => String(n).padStart(2, "0");
  const chaveOntem = `${ontem.getUTCFullYear()}-${dois(ontem.getUTCMonth() + 1)}-${dois(ontem.getUTCDate())}`;
  if (chave(alvo) === chaveOntem) return 'Ontem';
  return `${alvo.dia}/${alvo.mes}`;
}

/** "+55 (83) 99876-5432" a partir de dígitos (com ou sem 55). */
export function formatarTelefone(digitos: string): string {
  let n = digitos.replace(/\D/g, '');
  if (n.length >= 12 && n.startsWith('55')) n = n.slice(2);
  if (n.length === 11) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `+55 (${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return digitos;
}

/** "(83) 99876-5432": o mesmo número sem o +55, para listas e cabeçalhos. */
export function formatarTelefoneLocal(digitos: string): string {
  return formatarTelefone(digitos).replace(/^\+55 /, '');
}
