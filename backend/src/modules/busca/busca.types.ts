import { z } from 'zod';

export const BuscaQuerySchema = z.object({ q: z.string().trim().min(2).max(80) });

export type ClienteBusca = { id: string; nome: string; telefone: string };
export type AgendamentoBusca = {
  id: string;
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  status: string;
  clienteNome: string;
  servicoNome: string;
  profissionalNome: string;
};
export type ResultadoBusca = { clientes: ClienteBusca[]; agendamentos: AgendamentoBusca[] };
