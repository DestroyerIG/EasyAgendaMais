/** Tela "Hoje" (sub-projeto 2B): um resumo só, calculado no fuso do negócio. */
import { todayRepository, type AgendamentoDia, type ProfissionalAtiva } from './today.repository.js';
import { crmRepository } from '../crm/crm.repository.js';
import { resumirCliente } from '../crm/crmMetrics.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { toAppointmentDto, type AppointmentDto } from '../appointments/appointment.serializer.js';

export type Pendencia =
  | { tipo: 'vagas_tarde'; quantidade: number; vagas: Array<{ profissional: string; professionalId: string; inicio: string; fim: string }> }
  | { tipo: 'retorno_vencido'; quantidade: number; clientes: Array<{ id: string; name: string; phone: string; servico: string; venceuHa: number }> }
  | { tipo: 'sinais_pix'; quantidade: number; total: number; expiraEmMinutos: number }
  | { tipo: 'avaliacao'; quantidade: number; avaliacoes: Array<{ clientId: string; cliente: string; phone: string; nota: number; comentario: string | null; data: string }> };

export interface HojeDto {
  saudacao: { ownerName: string; date: string };
  faturamento: { valor: number; meta: number | null; percentual: number | null };
  agendamentos: { total: number; livresTarde: number };
  ocupacao: { percentual: number; variacao: number | null; diaDaSemana: string } | null;
  confirmadosLembrete: { quantidade: number; valor: number };
  pendencias: Pendencia[];
  proximas: AppointmentDto[];
  semana: Array<{ data: string; valor: number }>;
}

// ─── Funções puras (minutos desde 00:00, horário de parede do negócio) ─────────

type Almoco = { start: string; end: string } | null;
type Ocupante = { inicio: number; duracao: number };
type Intervalo = [number, number];

const VAGA_MINIMA = 30;
const MEIO_DIA = 12 * 60;

export const paraMinutos = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const paraHHMM = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const subtrair = (intervalos: Intervalo[], [a, b]: Intervalo): Intervalo[] =>
  intervalos.flatMap(([x, y]): Intervalo[] => {
    if (b <= x || a >= y) return [[x, y]];
    const resto: Intervalo[] = [];
    if (a > x) resto.push([x, a]);
    if (b < y) resto.push([b, y]);
    return resto;
  });

const janela = (inicio: number, fim: number, almoco: Almoco): Intervalo[] => {
  const base: Intervalo[] = fim > inicio ? [[inicio, fim]] : [];
  return almoco ? subtrair(base, [paraMinutos(almoco.start), paraMinutos(almoco.end)]) : base;
};
const soma = (xs: Intervalo[]) => xs.reduce((s, [a, b]) => s + (b - a), 0);

/** Minutos de expediente de uma profissional: abertura–fechamento menos o almoço. */
export const minutosExpediente = (abertura: number, fechamento: number, almoco: Almoco): number =>
  soma(janela(abertura, fechamento, almoco));

/** Minutos agendados dentro do expediente (fora dele e no almoço não contam), limitados ao expediente. */
export function minutosOcupados(abertura: number, fechamento: number, almoco: Almoco, ags: Ocupante[]): number {
  const expediente = janela(abertura, fechamento, almoco);
  const ocupados = ags.reduce((total, ag) => {
    const [a, b] = [ag.inicio, ag.inicio + ag.duracao];
    return total + expediente.reduce((s, [x, y]) => s + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  }, 0);
  return Math.min(ocupados, soma(expediente));
}

/** Buracos de 30 min ou mais entre `inicio` e `fechamento`, sem agendamento e fora do almoço. */
export function vagasLivres(inicio: number, fechamento: number, almoco: Almoco, ags: Ocupante[]): Array<{ inicio: string; fim: string }> {
  const livres = ags.reduce((acc, ag) => subtrair(acc, [ag.inicio, ag.inicio + ag.duracao]), janela(inicio, fechamento, almoco));
  return livres.filter(([a, b]) => b - a >= VAGA_MINIMA).map(([a, b]) => ({ inicio: paraHHMM(a), fim: paraHHMM(b) }));
}

// ─── Montagem ─────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;
const CHAVES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const utcDe = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const somarDias = (ymd: string, n: number) => new Date(utcDe(ymd) + n * DIA_MS).toISOString().slice(0, 10);
const diaDaSemana = (ymd: string) => new Date(utcDe(ymd)).getUTCDay();
const centavos = (v: number) => Math.round(v * 100);

const minutosAgora = (tz: string, agora: Date): number => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' })
    .formatToParts(agora).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
};

const ymdDe = (d: Date) => d.toISOString().slice(0, 10);
const inicioDe = (a: AgendamentoDia) => paraMinutos(a.time.toISOString().slice(11, 16));
const aguardandoValido = (a: { status: string; expiresAt: Date | null }, agora: Date) =>
  a.status === 'aguardando_pagamento' && !!a.expiresAt && a.expiresAt.getTime() > agora.getTime();
/** Agendamento que ocupa a agenda: tudo menos cancelado e aguardando pagamento já expirado. */
const ocupa = (a: AgendamentoDia, agora: Date) =>
  a.status !== 'cancelado' && (a.status !== 'aguardando_pagamento' || aguardandoValido(a, agora));
const ocupante = (a: AgendamentoDia): Ocupante => ({ inicio: inicioDe(a), duracao: a.service.durationMinutes });

/** Percentual bruto (sem arredondar) de ocupação de um dia; null sem minutos disponíveis. */
function ocupacaoBruta(profs: ProfissionalAtiva[], abertura: number, fechamento: number, ags: AgendamentoDia[]): number | null {
  let disponivel = 0;
  let ocupado = 0;
  for (const p of profs) {
    disponivel += minutosExpediente(abertura, fechamento, p.almoco);
    ocupado += minutosOcupados(abertura, fechamento, p.almoco, ags.filter((a) => a.professionalId === p.id).map(ocupante));
  }
  return disponivel > 0 ? (ocupado / disponivel) * 100 : null;
}

export const todayService = {
  async resumo(businessId: string): Promise<HojeDto> {
    const agora = new Date();
    const cfg = await getBusinessScheduleSettings(businessId);
    const tz = cfg.timezone || 'America/Sao_Paulo';
    const hoje = todayInTimezone(tz, agora);
    const agoraMin = minutosAgora(tz, agora);
    const abertura = paraMinutos(cfg.openingTime);
    const fechamento = paraMinutos(cfg.closingTime);
    const abre = (ymd: string) => cfg.diasAbertos[CHAVES_DIA[diaDaSemana(ymd)]] === true;
    const semanasAnteriores = [7, 14, 21, 28].map((n) => somarDias(hoje, -n));
    const inicioSemana = somarDias(hoje, -6);

    const [negocio, profs, ags, faturamento, doMes, sinais, avaliacoes, futuros, clientes, visitas] = await Promise.all([
      todayRepository.negocio(businessId),
      todayRepository.profissionaisAtivas(businessId),
      todayRepository.agendamentosNasDatas(businessId, [hoje, ...semanasAnteriores]),
      todayRepository.faturamentoPorDia(businessId, inicioSemana, hoje),
      todayRepository.agendamentosDoMes(businessId, `${hoje.slice(0, 8)}01`, hoje),
      todayRepository.sinaisPendentes(businessId),
      todayRepository.avaliacoesRecentes(businessId, new Date(agora.getTime() - 7 * DIA_MS)),
      todayRepository.clientesComAgendamentoFuturo(businessId, hoje, agora),
      crmRepository.clientes(businessId),
      crmRepository.visitas(businessId),
    ]);

    const validosDoDia = (ymd: string) => ags.filter((a) => ymdDe(a.date) === ymd && ocupa(a, agora));
    const deHoje = validosDoDia(hoje);
    const temExpediente = abre(hoje) && profs.length > 0;

    // Faturamento e semana
    const porDia = new Map(faturamento.map((f) => [f.date, f.valor]));
    const valor = porDia.get(hoje) ?? 0;
    const meta = negocio.meta && negocio.meta > 0 ? negocio.meta : null;
    const semana = Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana, i)).map((data) => ({ data, valor: porDia.get(data) ?? 0 }));

    // Ocupação vs média do mesmo dia nas 4 semanas anteriores
    let ocupacao: HojeDto['ocupacao'] = null;
    const brutaHoje = temExpediente ? ocupacaoBruta(profs, abertura, fechamento, deHoje) : null;
    if (brutaHoje !== null) {
      const percentual = Math.round(brutaHoje);
      const anteriores = semanasAnteriores
        .filter(abre)
        .map((d) => ocupacaoBruta(profs, abertura, fechamento, validosDoDia(d)))
        .filter((x): x is number => x !== null);
      const media = anteriores.length ? anteriores.reduce((s, x) => s + x, 0) / anteriores.length : null;
      ocupacao = {
        percentual,
        variacao: media === null ? null : Math.round(percentual - media),
        diaDaSemana: NOMES_DIA[diaDaSemana(hoje)],
      };
    }

    // Vagas da tarde: de max(12:00, agora) ao fechamento, por profissional
    const vagas: Array<{ profissional: string; professionalId: string; inicio: string; fim: string }> = [];
    if (temExpediente) {
      const inicio = Math.max(MEIO_DIA, agoraMin, abertura);
      for (const p of profs) {
        const dela = deHoje.filter((a) => a.professionalId === p.id).map(ocupante);
        for (const v of vagasLivres(inicio, fechamento, p.almoco, dela)) vagas.push({ profissional: p.name, professionalId: p.id, ...v });
      }
      vagas.sort((a, b) => a.inicio.localeCompare(b.inicio)); // sort estável: empate mantém a ordem das profissionais
    }

    // Confirmados por lembrete (mês)
    const lembrete = doMes.filter((a) => a.status === 'concluido' && a.reminderSent);
    const confirmadosLembrete = { quantidade: lembrete.length, valor: lembrete.reduce((s, a) => s + centavos(a.receita), 0) / 100 };

    // Pendências, em ordem fixa; só entram as que existem
    const pendencias: Pendencia[] = [];
    if (vagas.length > 0) pendencias.push({ tipo: 'vagas_tarde', quantidade: vagas.length, vagas: vagas.slice(0, 3) });

    const vencidas = clientes.flatMap((c) => {
      if (!c.active || futuros.has(c.id)) return [];
      const r = resumirCliente(visitas.get(c.id) ?? [], hoje, null);
      const ativa = r.ultimaVisita !== null && r.ultimaVisita.diasAtras <= 120;
      if (!ativa || r.retornoPrevisto.venceuHa === null) return [];
      return [{ id: c.id, name: c.name, phone: c.phone, servico: r.ultimaVisita!.servico, venceuHa: r.retornoPrevisto.venceuHa }];
    }).sort((a, b) => b.venceuHa - a.venceuHa || a.name.localeCompare(b.name, 'pt-BR'));
    if (vencidas.length > 0) pendencias.push({ tipo: 'retorno_vencido', quantidade: vencidas.length, clientes: vencidas.slice(0, 20) });

    const sinaisValidos = sinais.filter((s) => s.expiresAt && s.expiresAt.getTime() > agora.getTime());
    if (sinaisValidos.length > 0) {
      const primeiro = Math.min(...sinaisValidos.map((s) => s.expiresAt!.getTime()));
      pendencias.push({
        tipo: 'sinais_pix', quantidade: sinaisValidos.length,
        total: sinaisValidos.reduce((s, x) => s + centavos(x.depositAmount), 0) / 100,
        expiraEmMinutos: Math.ceil((primeiro - agora.getTime()) / 60_000),
      });
    }

    const ruins = avaliacoes.filter((a) => a.nota <= 3);
    if (ruins.length > 0) pendencias.push({ tipo: 'avaliacao', quantidade: ruins.length, avaliacoes: ruins });

    // Próximas 2 h (em atendimento entra mesmo tendo começado antes de agora)
    const limite = agoraMin + 120;
    const proximas = deHoje
      .filter((a) => {
        const ini = inicioDe(a);
        if (a.status === 'em_atendimento') return ini <= limite;
        return (a.status === 'confirmado' || aguardandoValido(a, agora)) && ini >= agoraMin && ini <= limite;
      })
      .sort((a, b) => inicioDe(a) - inicioDe(b))
      .map((a) => toAppointmentDto(a as unknown as Parameters<typeof toAppointmentDto>[0]));

    return {
      saudacao: { ownerName: negocio.ownerName, date: hoje },
      faturamento: { valor, meta, percentual: meta === null ? null : Math.round((valor / meta) * 100) },
      agendamentos: { total: deHoje.length, livresTarde: vagas.length },
      ocupacao,
      confirmadosLembrete,
      pendencias,
      proximas,
      semana,
    };
  },
};
