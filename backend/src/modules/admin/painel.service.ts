import { linhaCsv } from '../crm/csv.js';
import { SEGMENTOS_VALIDOS } from '../../config/vocabulario.js';
import { painelRepository } from './painel.repository.js';
import {
  cartoesGestao, conversaoPorSegmento, negociosEmRisco, precoDoPlano, resumoCancelamentos,
  resumoMrr, resumoTestes, segmentoDe, statusAdmin,
  type LinhaNegocio, type StatusAdmin,
} from './painel.rules.js';

// Serviço do painel do SuperAdmin: lê as linhas uma vez por chamada e aplica as regras puras.
// Filtro, ordem e paginação rodam em memória (ver decisão do plano H2).

const MS_DIA = 86_400_000;
const FUSO = 'America/Sao_Paulo';
const BOM = '﻿';

export interface FiltrosNegocios {
  busca?: string;
  segmento?: string;
  status?: StatusAdmin;
  plano?: string;
}

export interface NegocioListado {
  id: string; nome: string; dono: string; email: string; whatsapp: string;
  endereco: string | null; segmento: string; plano: string; preco: number;
  status: StatusAdmin; whatsappConectado: boolean; whatsappConectadoEm: Date | null;
  agendamentos30d: number; ultimaAtividadeEm: Date | null; diasRestantesTeste: number | null;
}

const semAcento = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const soDigitos = (s: string): string => s.replace(/\D/g, '');

function paraListado(l: LinhaNegocio, agora: Date): NegocioListado {
  const status = statusAdmin(l, agora);
  const diasRestantesTeste = status === 'teste' && l.fimDoPeriodo
    ? Math.max(0, Math.ceil((l.fimDoPeriodo.getTime() - agora.getTime()) / MS_DIA))
    : null;
  return {
    id: l.id, nome: l.nome, dono: l.dono, email: l.email, whatsapp: l.whatsapp,
    endereco: l.endereco, segmento: segmentoDe(l.segmento), plano: l.plano, preco: precoDoPlano(l.plano),
    status, whatsappConectado: l.whatsappConectadoEm !== null, whatsappConectadoEm: l.whatsappConectadoEm,
    agendamentos30d: l.agendamentos30d, ultimaAtividadeEm: l.ultimoAgendamentoEm, diasRestantesTeste,
  };
}

function casaBusca(l: LinhaNegocio, busca: string): boolean {
  const termo = semAcento(busca.trim());
  if (termo === '') return true;
  if ([l.nome, l.dono, l.email].some((campo) => semAcento(campo).includes(termo))) return true;
  // Telefone e documento: compara só os dígitos, e só quando a busca tem algum dígito.
  const digitos = soDigitos(busca);
  if (digitos === '') return false;
  return [l.whatsapp, l.cpfCnpj ?? ''].some((campo) => soDigitos(campo).includes(digitos));
}

function filtrar(ls: LinhaNegocio[], f: FiltrosNegocios, agora: Date): NegocioListado[] {
  return ls
    .filter((l) => (f.busca ? casaBusca(l, f.busca) : true))
    .map((l) => ({ criado: l.criadoEm.getTime(), n: paraListado(l, agora) }))
    .filter(({ n }) => (f.segmento ? n.segmento === f.segmento : true)
      && (f.status ? n.status === f.status : true)
      && (f.plano ? n.plano === f.plano : true))
    // Criação mais recente primeiro.
    .sort((a, b) => b.criado - a.criado)
    .map(({ n }) => n);
}

const ROTULO_STATUS: Record<StatusAdmin, string> = {
  ativo: 'Ativo',
  teste: 'Teste',
  carencia: 'Em carência',
  bloqueado_cobranca: 'Bloqueado por cobrança',
  teste_encerrado: 'Teste encerrado',
  bloqueado_admin: 'Bloqueado pelo admin',
  cancelado: 'Cancelado',
};
const ROTULO_PLANO: Record<string, string> = { basico: 'Solo', profissional: 'Equipe', premium: 'Salão' };
const ROTULO_SEGMENTO: Record<string, string> = {
  barbearia: 'Barbearia', unhas: 'Unhas', cilios_sobrancelhas: 'Cílios e sobrancelhas',
  cabelo: 'Cabelo', estetica: 'Estética', outro: 'Outro',
};
const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const momento = (d: Date | null): string | null => (d ? FORMATO_HORA.format(d).replace(', ', ' ') : null);

export const painelService = {
  async visaoGeral(periodDays: number) {
    const agora = new Date();
    const [ls, disparos24h] = await Promise.all([painelRepository.linhasNegocios(), painelRepository.disparos24h()]);
    return {
      atualizadoEm: agora.toISOString(),
      mrr: resumoMrr(ls, agora),
      testes: resumoTestes(ls, agora),
      conversao: conversaoPorSegmento(ls, agora, periodDays),
      cancelamentos: resumoCancelamentos(ls, agora),
      emRisco: negociosEmRisco(ls, agora),
      disparos24h,
    };
  },

  async listar(filtros: FiltrosNegocios & { page: number; limit: number }) {
    const agora = new Date();
    const ls = await painelRepository.linhasNegocios();
    const todos = filtrar(ls, filtros, agora);
    const { page, limit } = filtros;
    const total = todos.length;
    const segmentos = (SEGMENTOS_VALIDOS as readonly string[]).map((segmento) => ({
      segmento,
      total: ls.filter((l) => segmentoDe(l.segmento) === segmento).length,
    }));
    return {
      data: todos.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      cartoes: cartoesGestao(ls, agora),
      segmentos,
    };
  },

  async exportarCsv(filtros: FiltrosNegocios): Promise<string> {
    const agora = new Date();
    const ls = await painelRepository.linhasNegocios();
    const cabecalho = ['Negócio', 'Dono', 'E-mail', 'WhatsApp', 'Segmento', 'Plano', 'Valor', 'Status',
      'WhatsApp conectado', 'Agendamentos (30 dias)', 'Última atividade'];
    const linhas = filtrar(ls, filtros, agora).map((n) => [
      n.nome, n.dono, n.email, n.whatsapp, ROTULO_SEGMENTO[n.segmento] ?? n.segmento,
      ROTULO_PLANO[n.plano] ?? n.plano, n.preco, ROTULO_STATUS[n.status],
      n.whatsappConectado ? 'Sim' : 'Não', String(n.agendamentos30d), momento(n.ultimaAtividadeEm),
    ]);
    return BOM + [linhaCsv(cabecalho), ...linhas.map(linhaCsv)].join('\r\n') + '\r\n';
  },
};
