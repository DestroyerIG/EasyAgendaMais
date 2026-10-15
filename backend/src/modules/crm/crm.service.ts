import { crmRepository } from './crm.repository.js';
import { resumirCliente, taxaRetencao, FASE_ROTULO, type Fase } from './crmMetrics.js';
import type { ClienteInsight, InsightsQuery } from './crm.types.js';
import { linhaCsv } from './csv.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';

const FASES: Fase[] = ['novo', 'recorrente', 'fiel', 'em_risco', 'perdido'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitos = (s: string) => s.replace(/\D/g, '');
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const CONSENT_ROTULO = { consentido: 'Consentido', revogado: 'Revogado', nao_informado: 'Não informado' } as const;
const porNome = (a: ClienteInsight, b: ClienteInsight) => a.name.localeCompare(b.name, 'pt-BR');

async function montar(businessId: string) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const hoje = todayInTimezone(timezone);
  const [clientes, visitas, profs] = await Promise.all([
    crmRepository.clientes(businessId), crmRepository.visitas(businessId), crmRepository.profissionaisPorCliente(businessId),
  ]);
  const insights = clientes.map((c): ClienteInsight => {
    const r = resumirCliente(visitas.get(c.id) ?? [], hoje, c.birthDate);
    return {
      ...c, fase: r.fase, etiquetasAuto: r.etiquetasAuto, ultimaVisita: r.ultimaVisita, cicloMedio: r.cicloMedio,
      retornoPrevisto: r.retornoPrevisto, ltv: r.ltv, atendimentos: r.visitas,
    };
  });
  return { hoje, insights, visitas, profs };
}

const porUltimaVisita = (a: ClienteInsight, b: ClienteInsight) => {
  if (!a.ultimaVisita && !b.ultimaVisita) return porNome(a, b);
  if (!a.ultimaVisita) return 1;
  if (!b.ultimaVisita) return -1;
  return b.ultimaVisita.date.localeCompare(a.ultimaVisita.date);
};
// Vencidos primeiro (data menor = mais vencido), depois por data; sem previsão no fim.
const porRetorno = (a: ClienteInsight, b: ClienteInsight) => {
  const da = a.retornoPrevisto.data;
  const db = b.retornoPrevisto.data;
  if (!da && !db) return porNome(a, b);
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
};

export const crmService = {
  async insights(businessId: string, q: InsightsQuery) {
    const { insights, profs } = await montar(businessId);
    let base = insights;
    if (q.etiqueta) base = base.filter((c) => c.tags.some((t) => t.id === q.etiqueta));
    if (q.profissional) base = base.filter((c) => profs.get(c.id)?.has(q.profissional as string));
    if (q.busca) {
      const termo = semAcento(q.busca);
      const num = digitos(q.busca);
      base = base.filter((c) => semAcento(c.name).includes(termo) || semAcento(c.email ?? '').includes(termo)
        || (num !== '' && digitos(c.phone).includes(num)));
    }
    const contagemPorFase = { todas: base.length, novo: 0, recorrente: 0, fiel: 0, em_risco: 0, perdido: 0 } as Record<Fase | 'todas', number>;
    for (const c of base) contagemPorFase[c.fase]++;
    const filtrados = q.fase ? base.filter((c) => c.fase === q.fase) : base;
    const cmp = q.ordem === 'nome' ? porNome
      : q.ordem === 'ltv' ? (a: ClienteInsight, b: ClienteInsight) => b.ltv - a.ltv || porNome(a, b)
      : q.ordem === 'retorno' ? porRetorno : porUltimaVisita;
    const ordenados = [...filtrados].sort(cmp);
    const inicio = (q.page - 1) * q.pageSize;
    return { itens: ordenados.slice(inicio, inicio + q.pageSize), total: ordenados.length, contagemPorFase };
  },

  async fases(businessId: string) {
    const { hoje, insights, visitas } = await montar(businessId);
    const colunas = FASES.map((fase) => {
      const doGrupo = insights.filter((c) => c.fase === fase).sort(porUltimaVisita);
      return {
        fase, rotulo: FASE_ROTULO[fase], contagem: doGrupo.length,
        ltvTotal: doGrupo.reduce((s, c) => s + Math.round(c.ltv * 100), 0) / 100,
        cartoes: doGrupo.slice(0, 20),
      };
    });
    const ativas = insights.filter((c) => c.active && c.ultimaVisita && c.ultimaVisita.diasAtras <= 120);
    const mes = hoje.slice(0, 7);
    const ativasNovasNoMes = ativas.filter((c) => {
      const primeira = (visitas.get(c.id) ?? []).map((v) => v.date).sort()[0];
      return !!primeira && primeira.startsWith(mes);
    }).length;
    const comVisita = insights.filter((c) => c.atendimentos >= 1);
    const ltvMedio = comVisita.length
      ? Math.round(comVisita.reduce((s, c) => s + Math.round(c.ltv * 100), 0) / comVisita.length) / 100 : null;
    const datasPorCliente = new Map<string, string[]>();
    for (const [id, v] of visitas) datasPorCliente.set(id, v.map((x) => x.date));
    return { colunas, kpis: { ativas: ativas.length, ativasNovasNoMes, ltvMedio, retencao: taxaRetencao(datasPorCliente, hoje) } };
  },

  async exportCsv(businessId: string): Promise<string> {
    const { insights } = await montar(businessId);
    const linhas = [linhaCsv([
      'Nome', 'Telefone', 'E-mail', 'Aniversário', 'Fase', 'Última visita', 'Ciclo médio (dias)', 'LTV', 'Atendimentos', 'Etiquetas', 'Consentimento WhatsApp',
    ])];
    for (const c of [...insights].sort(porNome)) {
      linhas.push(linhaCsv([
        c.name, c.phone, c.email, c.birthDate ? br(c.birthDate) : null, FASE_ROTULO[c.fase],
        c.ultimaVisita ? br(c.ultimaVisita.date) : null,
        c.cicloMedio === null ? null : String(c.cicloMedio),
        c.ltv, String(c.atendimentos),
        [...c.tags.map((t) => t.name), ...c.etiquetasAuto].join(', '),
        CONSENT_ROTULO[c.consentimento],
      ]));
    }
    return '﻿' + linhas.join('\r\n') + '\r\n';
  },
};
