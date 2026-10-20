import { z } from 'zod';
import type { EnvioDto } from '../whatsappFila/fila.service.js';
import type { Encaixe } from './retorno.rules.js';

export interface OportunidadeDto {
  cliente: { id: string; nome: string; telefone: string };
  atrasoDias: number; servico: string; profissional: string; professionalId: string;
  ultimaVisitaHaDias: number; cicloDias: number; valorUltimaVisita: number; encaixes: Encaixe[];
  podeReceber: boolean; motivoBloqueio: string | null; ultimoConviteEm: string | null; envio: EnvioDto | null; texto: string;
}
export interface RetornoDto {
  resumo: { recuperacaoEstimada: number; oportunidades: number };
  linkAgendamento: string | null; numeroNegocio: string | null; itens: OportunidadeDto[];
}

// z.coerce.boolean() trataria "false" como true; aqui a string é interpretada de fato.
const booleano = z.preprocess((v) => (v === 'false' || v === '0' ? false : v), z.coerce.boolean());
export const FiltrosRetorno = z.object({
  professionalId: z.string().uuid().optional(),
  somenteComEncaixe: booleano.optional(),
});
