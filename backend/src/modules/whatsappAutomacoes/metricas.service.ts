import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRepository } from '../whatsappInbox/inbox.repository.js';
import { mascararTelefone } from '../whatsappInbox/inbox.rules.js';
import type { Origem, StatusMensagem } from '../whatsappInbox/inbox.types.js';
import { metricasRepository as repo } from './metricas.repository.js';
import { REGRAS } from './automacoes.types.js';

export interface PainelAutomacoesDto {
  receitaMes: number; receitaVariacaoPct: number | null;
  faltasEvitadas: number;
  taxaResposta: { pct: number | null; mediaMin: number | null; selo: 'Excelente' | 'Boa' | 'Baixa' | null };
  porRegra: {
    confirmacao: { faltasEvitadas: number };
    sinal_pix: { recebido: number };
    retorno: { recuperado: number };
    lista_espera: { vagasPreenchidas: number };
    lembrete: { enviados: number; lidosPct: number | null };
    aniversario: { aniversariantes: number; agendamentos: number };
    avaliacao: { notaMedia: number | null; novas: number };
  };
  conexao: { conectado: boolean; numero: string | null };
}

export interface HistoricoAutomacoesDto {
  itens: Array<{ id: string; criadaEm: string; cliente: string | null; telefone: string; tipo: Origem; status: StatusMensagem }>;
}

/** As origens das 7 regras (o histórico de Automações mostra só essas). */
export const ORIGENS_REGRAS: Origem[] = [...REGRAS];

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Primeiro instante do mês (YYYY-MM) no fuso, deslocado `delta` meses. */
function inicioDoMes(ano: number, mes: number, delta: number, tz: string): Date {
  const t = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return zonedToUtc(t.toISOString().slice(0, 10), '00:00', tz);
}

function selo(pct: number): 'Excelente' | 'Boa' | 'Baixa' {
  if (pct >= 80) return 'Excelente';
  if (pct >= 50) return 'Boa';
  return 'Baixa';
}

async function receita(businessId: string, inicio: Date, fim: Date) {
  const [r, sinais] = await Promise.all([repo.receitaAutomacoes(businessId, inicio, fim), repo.sinaisRecebidos(businessId, inicio, fim)]);
  return { retorno: r.retorno, sinais, total: centavos(r.retorno + r.outros + sinais) };
}

export const metricas = {
  async painel(businessId: string, agora: Date = new Date()): Promise<PainelAutomacoesDto> {
    const cfg = await getBusinessScheduleSettings(businessId);
    const tz = cfg.timezone || 'America/Sao_Paulo';
    const [ano, mes] = todayInTimezone(tz, agora).split('-').map(Number) as [number, number];
    const inicio = inicioDoMes(ano, mes, 0, tz);
    const fim = inicioDoMes(ano, mes, 1, tz);
    const anterior = inicioDoMes(ano, mes, -1, tz);

    const [atual, passado, confirmados, reagendar, resp, vagas, lemb, aniv, aval, status, negocio] = await Promise.all([
      receita(businessId, inicio, fim),
      receita(businessId, anterior, inicio),
      repo.confirmadosPeloCliente(businessId, inicio, fim),
      repo.pedidosDeReagendar(businessId, inicio, fim),
      repo.respostas(businessId, inicio, fim),
      repo.vagasPreenchidas(businessId, inicio, fim),
      repo.lembretes(businessId, inicio, fim),
      repo.aniversario(businessId, inicio, fim),
      repo.avaliacoes(businessId, inicio, fim),
      whatsappService.getStatus(businessId),
      inboxRepository.dadosConexao(businessId),
    ]);

    const faltasEvitadas = confirmados + reagendar;
    const pct = resp.total > 0 ? Math.round((resp.respondidas / resp.total) * 100) : null;

    return {
      receitaMes: atual.total,
      receitaVariacaoPct: passado.total > 0 ? Math.round(((atual.total - passado.total) / passado.total) * 100) : null,
      faltasEvitadas,
      taxaResposta: {
        pct,
        mediaMin: pct !== null && resp.mediaMin !== null ? Math.round(resp.mediaMin) : null,
        selo: pct === null ? null : selo(pct),
      },
      porRegra: {
        confirmacao: { faltasEvitadas },
        sinal_pix: { recebido: centavos(atual.sinais) },
        retorno: { recuperado: centavos(atual.retorno) },
        lista_espera: { vagasPreenchidas: vagas },
        lembrete: { enviados: lemb.enviados, lidosPct: lemb.enviados > 0 ? Math.round((lemb.lidos / lemb.enviados) * 100) : null },
        aniversario: aniv,
        avaliacao: { notaMedia: aval.media === null ? null : Math.round(aval.media * 10) / 10, novas: aval.novas },
      },
      conexao: { conectado: status?.status === 'connected', numero: status?.connectedNumber ?? negocio.whatsapp ?? null },
    };
  },

  async historico(businessId: string, limite = 30): Promise<HistoricoAutomacoesDto> {
    const rows = await inboxRepository.historicoEnvios(businessId, limite, ORIGENS_REGRAS);
    return {
      itens: rows.filter((m) => (ORIGENS_REGRAS as string[]).includes(m.origin)).map((m) => ({
        id: m.id,
        criadaEm: m.createdAt.toISOString(),
        cliente: m.conversation?.client?.name ?? null,
        telefone: mascararTelefone(m.conversation?.phone ?? m.phoneKey),
        tipo: m.origin as Origem,
        status: m.status as StatusMensagem,
      })),
    };
  },
};
