import { z } from 'zod';

export type Direcao = 'in' | 'out';
export type Origem = 'cliente' | 'bot' | 'lembrete' | 'confirmacao' | 'pix_recibo' | 'lista_espera' | 'retorno'
  | 'sinal_pix' | 'aniversario' | 'avaliacao' | 'campanha' | 'manual_painel' | 'manual_celular' | 'sistema' | 'painel_evento';
export type StatusMensagem = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou';
export type Atendimento = 'bot' | 'humano';
export type StatusConversa = 'aberta' | 'aguardando' | 'finalizada';
export const LIMITE_DIARIO = 250;
export const HORAS_VOLTA_ROBO = 12;
export const HORAS_FINALIZAR_ROBO = 24;
export const DIAS_RETENCAO = 180;

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

export const ListaConversasQuery = z.object({
  filtro: z.enum(['todas', 'aguardando', 'bot', 'finalizadas']).default('todas'),
  cursor: z.string().datetime().optional(),
});
export const MensagensQuery = z.object({ antes: z.string().datetime().optional() });
export const EnviarSchema = z.object({ texto: z.string().trim().min(1, 'Escreva a mensagem').max(4096, 'Mensagem muito longa') });
export const LidasSchema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });
