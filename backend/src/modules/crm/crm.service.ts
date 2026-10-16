import { crmRepository, type FichaRow, type AgendamentoLinha } from './crm.repository.js';
import { SEGMENTOS, type Segmento } from './technicalSheetTemplates.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import type { ClientProfileDto, ConsentimentoDto, CrmSettings, FichaInput, FichaTecnicaDto, TimelineEvento } from './crm.types.js';
import { resumirCliente, taxaRetencao, FASE_ROTULO, type Fase } from './crmMetrics.js';
import type { ClienteInsight, InsightsQuery } from './crm.types.js';
import { linhaCsv } from './csv.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';

const FASES: Fase[] = ['novo', 'recorrente', 'fiel', 'em_risco', 'perdido'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitos = (s: string) => s.replace(/\D/g, '');
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const CONSENT_ROTULO = { consentido: 'Consentido', revogado: 'Revogado', nao_informado: 'Não informado' } as const;
const brl = (v: number) => v.toFixed(2).replace('.', ',');
const instante = (date: string, time: string, tz: string) => zonedToUtc(date, time, tz);
const ESTADO_CONSENT = (c: { granted: boolean; revokedAt?: string | null }): ConsentimentoDto['estado'] =>
  (c.granted && !c.revokedAt ? 'consentido' : 'revogado');
const CANAIS = ['painel', 'publico', 'whatsapp'];

function fichaDto(f: FichaRow | null, segmento: Segmento, ownerName: string): FichaTecnicaDto {
  return {
    allergies: f?.allergies ?? null, fields: f?.fields ?? {}, customFields: f?.customFields ?? [],
    updatedAt: f?.updatedAt ?? null, updatedBy: f ? ownerName || null : null,
    segmento, campos: SEGMENTOS[segmento].campos,
  };
}
const segmentoValido = (s: string): Segmento => (s in SEGMENTOS ? (s as Segmento) : 'outro');
const porNome =(a: ClienteInsight, b: ClienteInsight) => a.name.localeCompare(b.name, 'pt-BR');

async function montar(businessId: string) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const hoje = todayInTimezone(timezone);
  const [clientes, { visitas, profissionais: profs }] = await Promise.all([
    crmRepository.clientes(businessId), crmRepository.visitasEProfissionais(businessId),
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

  async profile(businessId: string, clientId: string): Promise<ClientProfileDto> {
    const c = await crmRepository.clientePerfil(businessId, clientId);
    if (!c) throw new NotFoundError('Cliente');
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const hoje = todayInTimezone(timezone);
    const [visitas, agenda, ficha, dono, cfg] = await Promise.all([
      crmRepository.visitasDoCliente(businessId, clientId), crmRepository.agendamentosDoCliente(businessId, clientId),
      crmRepository.ficha(businessId, clientId), crmRepository.ownerName(businessId), crmRepository.configuracao(businessId),
    ]);
    const r = resumirCliente(visitas, hoje, c.birthDate);
    const consent: ConsentimentoDto = c.consentimento
      ? {
        estado: ESTADO_CONSENT(c.consentimento), desde: c.consentimento.grantedAt,
        canal: CANAIS.includes(c.consentimento.channel) ? (c.consentimento.channel as ConsentimentoDto['canal']) : null,
      }
      : { estado: 'nao_informado', desde: null, canal: null };
    return {
      cliente: { id: c.id, name: c.name, phone: c.phone, email: c.email, birthDate: c.birthDate, notes: c.notes, createdAt: c.createdAt },
      fase: r.fase, etiquetas: c.tags, etiquetasAuto: r.etiquetasAuto,
      indicadores: {
        cicloMedio: r.cicloMedio, ticketMedio: r.ticketMedio,
        visitasNoAno: visitas.filter((v) => v.date.startsWith(hoje.slice(0, 4))).length,
        faltasECancelamentos: agenda.filter((a) => a.status === 'faltou' || a.status === 'cancelado').length,
        ultimaVisita: r.ultimaVisita, retornoPrevisto: r.retornoPrevisto,
      },
      consentimento: consent,
      fichaTecnica: fichaDto(ficha, segmentoValido(cfg.segment), dono),
    };
  },

  async timeline(businessId: string, clientId: string, filtro: 'todos' | 'agendamentos' | 'financeiro'): Promise<TimelineEvento[]> {
    const c = await crmRepository.clientePerfil(businessId, clientId);
    if (!c) throw new NotFoundError('Cliente');
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const agenda: AgendamentoLinha[] = await crmRepository.agendamentosDoCliente(businessId, clientId);
    const ev: TimelineEvento[] = [];
    for (const a of agenda) {
      const dd = `${a.date.slice(8, 10)}/${a.date.slice(5, 7)}`;
      ev.push({ tipo: 'agendado', data: a.createdAt, titulo: `Agendamento para ${dd} às ${a.time} · ${a.servico} com ${a.profissional}`, descricao: null, valor: null });
      const inicio = instante(a.date, a.time, timezone);
      const quando = a.finishedAt ?? inicio.toISOString();
      if (a.status === 'concluido') {
        const valor = a.comanda ? Math.round((a.comanda.totalCharged + a.comanda.depositApplied) * 100) / 100 : a.servicePrice;
        ev.push({ tipo: 'concluido', data: quando, titulo: `Atendimento concluído com ${a.profissional}`, descricao: a.comanda?.itens.join(', ') || a.servico, valor });
      } else if (a.status === 'faltou') {
        ev.push({ tipo: 'faltou', data: quando, titulo: 'Não compareceu', descricao: null, valor: null });
      } else if (a.status === 'cancelado') {
        ev.push({ tipo: 'cancelado', data: quando, titulo: 'Agendamento cancelado', descricao: null, valor: null });
      }
      if (a.reminderSent) {
        const d = new Date(inicio.getTime() - 86_400_000).toISOString();
        ev.push({ tipo: 'lembrete', data: d, titulo: 'Lembrete automático enviado pelo WhatsApp', descricao: null, valor: null });
      }
      if (a.avaliacao) {
        ev.push({
          tipo: 'avaliacao', data: a.avaliacao.createdAt, titulo: `Avaliação ${a.avaliacao.rating} estrelas`,
          descricao: a.avaliacao.comment, valor: null, nota: a.avaliacao.rating,
        });
      }
      if (a.source === 'publico' && a.depositAmount && ['confirmado', 'em_atendimento', 'concluido', 'faltou'].includes(a.status)) {
        ev.push({ tipo: 'sinal_pix', data: a.createdAt, titulo: `Sinal Pix de R$ ${brl(a.depositAmount)} pago na reserva online`, descricao: null, valor: a.depositAmount });
      }
    }
    ev.push({ tipo: 'cadastro', data: c.createdAt, titulo: 'Cadastro da cliente', descricao: null, valor: null });
    const tipos = filtro === 'agendamentos' ? ['agendado', 'concluido', 'faltou', 'cancelado', 'lembrete']
      : filtro === 'financeiro' ? ['concluido', 'sinal_pix'] : null;
    return ev.filter((e) => !tipos || tipos.includes(e.tipo)).sort((x, y) => y.data.localeCompare(x.data));
  },

  async saveTechnicalSheet(businessId: string, userId: string, clientId: string, input: FichaInput): Promise<FichaTecnicaDto> {
    const c = await crmRepository.clientePerfil(businessId, clientId);
    if (!c) throw new NotFoundError('Cliente');
    const cfg = await crmRepository.configuracao(businessId);
    const segmento = segmentoValido(cfg.segment);
    const modelo = new Map(SEGMENTOS[segmento].campos.map((k) => [k.key, k]));
    for (const [key, value] of Object.entries(input.fields)) {
      const campo = modelo.get(key);
      if (!campo) throw new ValidationError('Campo desconhecido para o segmento');
      if (value.length > 200) throw new ValidationError(`Valor muito longo em ${campo.label}`);
      if (campo.type === 'opcoes' && value !== '' && !campo.options?.includes(value)) throw new ValidationError(`Opção inválida em ${campo.label}`);
    }
    if ((input.allergies ?? '').length > 1000) throw new ValidationError('Alergias muito longas');
    const salvo = await crmRepository.salvarFicha({
      businessId, clientId, allergies: input.allergies, fields: input.fields, customFields: input.customFields, updatedBy: userId,
    });
    return fichaDto(salvo, segmento, await crmRepository.ownerName(businessId));
  },

  async setConsent(businessId: string, userId: string, clientId: string, granted: boolean): Promise<ConsentimentoDto> {
    const c = await crmRepository.clientePerfil(businessId, clientId);
    if (!c) throw new NotFoundError('Cliente');
    const r = await crmRepository.registrarConsentimento({ businessId, clientId, granted, channel: 'painel', recordedBy: userId });
    return { estado: ESTADO_CONSENT(r), desde: r.grantedAt, canal: 'painel' };
  },

  async getSettings(businessId: string): Promise<CrmSettings> {
    const s = await crmRepository.configuracao(businessId);
    return { segment: segmentoValido(s.segment), dailyRevenueGoal: s.dailyRevenueGoal };
  },

  async saveSettings(businessId: string, input: CrmSettings): Promise<CrmSettings> {
    if (input.dailyRevenueGoal !== null && !(input.dailyRevenueGoal > 0)) throw new ValidationError('A meta diária deve ser maior que zero');
    const s = await crmRepository.salvarConfiguracao(businessId, { segment: input.segment, dailyRevenueGoal: input.dailyRevenueGoal });
    return { segment: segmentoValido(s.segment), dailyRevenueGoal: s.dailyRevenueGoal };
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
