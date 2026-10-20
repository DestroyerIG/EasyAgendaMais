import api from '@/lib/api';

export interface Encaixe { inicio: string; curto: string; longo: string }

export interface EnvioDto {
  id: string; clientId: string | null;
  status: 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'pulado' | 'cancelado';
  motivo: string | null; agendadoPara: string; enviadoEm: string | null;
  /** "HH:MM" no fuso do negócio, calculado pelo servidor para quem está na fila. */
  previstoHora: string | null;
}

export interface OportunidadeDto {
  cliente: { id: string; nome: string; telefone: string; avatarUrl: string | null };
  atrasoDias: number; servico: string; profissional: string; professionalId: string;
  ultimaVisitaHaDias: number; cicloDias: number; valorUltimaVisita: number; encaixes: Encaixe[];
  podeReceber: boolean; motivoBloqueio: string | null; ultimoConviteEm: string | null; envio: EnvioDto | null; texto: string;
}

export interface RetornoDto {
  resumo: { recuperacaoEstimada: number; oportunidades: number };
  linkAgendamento: string | null; numeroNegocio: string | null; itens: OportunidadeDto[];
}

export interface FiltrosRetornoTela { professionalId?: string; somenteComEncaixe?: boolean; incluirLink: boolean }

export interface RecusadoDto { clientId: string; motivo: string }
export interface EnviarConvitesDto { envios: EnvioDto[]; recusados: RecusadoDto[] }

export const buscarRetorno = async (f: FiltrosRetornoTela) =>
  (await api.get<RetornoDto>('/whatsapp/retorno', { params: f })).data;

export const enviarConvites = async (itens: Array<{ clientId: string; texto?: string }>, incluirLink: boolean) =>
  (await api.post<EnviarConvitesDto>('/whatsapp/retorno/enviar', { itens, incluirLink })).data;

export const testarConvite = async (clientId: string, incluirLink: boolean) =>
  (await api.post('/whatsapp/retorno/testar', { clientId, incluirLink })).data;
