import api from '@/lib/api';
import { formatPhone } from '@/lib/formatters';

// Espelho de backend/src/modules/busca/busca.types.ts.
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

export type ItemBusca = {
  chave: string;
  grupo: 'clientes' | 'agendamentos' | 'telas';
  titulo: string;
  detalhe?: string;
  icone?: string;
  href: string;
};

export const TERMO_MAX = 80;

/** Mínimo de 2 caracteres, ou 3 quando o termo só tem dígitos e sinais de telefone. */
export function podeBuscar(termo: string): boolean {
  const t = termo.trim();
  if (/^[\d()+\-. ]+$/.test(t)) return t.replace(/\D/g, '').length >= 3;
  return t.length >= 2;
}

function somaDia(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function rotuloQuando(data: string, hora: string, hoje: string): string {
  if (data === hoje) return `Hoje, ${hora}`;
  if (data === somaDia(hoje, 1)) return `Amanhã, ${hora}`;
  const [a, m, d] = data.split('-');
  const dia = `${d}/${m}`;
  return a === hoje.slice(0, 4) ? `${dia}, ${hora}` : `${dia}/${a}, ${hora}`;
}

export const buscaApi = {
  buscar: async (q: string, signal?: AbortSignal) =>
    (await api.post<ResultadoBusca>('/busca', { q }, { signal })).data,
};

export function montarItens(r: ResultadoBusca, telas: ItemBusca[], hoje: string): ItemBusca[] {
  const clientes: ItemBusca[] = r.clientes.map((c) => ({
    chave: `cliente-${c.id}`,
    grupo: 'clientes',
    titulo: c.nome,
    detalhe: formatPhone(c.telefone),
    href: `/clientes/${c.id}`,
  }));
  const agendamentos: ItemBusca[] = r.agendamentos.map((a) => ({
    chave: `agendamento-${a.id}`,
    grupo: 'agendamentos',
    titulo: `${a.clienteNome} · ${a.servicoNome}`,
    detalhe: `${rotuloQuando(a.data, a.hora, hoje)} · ${a.profissionalNome}`,
    href: `/agendamentos?data=${a.data}&agendamento=${a.id}`,
  }));
  return [...clientes, ...agendamentos, ...telas];
}
