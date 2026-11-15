import { calcularEstadoConta } from '../conta/estadoConta.rules.js';
import { normalizeInternalSubscriptionStatus } from '../../services/billing/statusMapper.js';
import { PLAN_PRICES } from '../../config/planCatalog.js';
import { SEGMENTOS_VALIDOS } from '../../config/vocabulario.js';

// Regras puras do painel do SuperAdmin. Recebem as linhas já lidas do banco e não tocam em I/O.
// O status de cobrança vem de calcularEstadoConta (H1): nenhuma regra de contingência se repete aqui.

const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const FUSO = 'America/Sao_Paulo';

export interface LinhaNegocio {
  id: string; nome: string; dono: string; email: string; whatsapp: string;
  cpfCnpj: string | null; endereco: string | null; segmento: string | null;
  plano: string; statusAssinatura: string; ativo: boolean;
  inadimplenteDesde: Date | null; jaPagou: boolean; fimDoPeriodo: Date | null; cartaoCadastrado?: boolean; valorCombinado?: number | null;
  criadoEm: Date; canceladoEm: Date | null; onboardingConcluido: boolean;
  temInstanciaWhatsapp: boolean; whatsappConectadoEm: Date | null; ultimoEnvioEm: Date | null;
  agendamentos30d: number; ultimoAgendamentoEm: Date | null;
  primeiroPagamentoEm: Date | null; pagouMesAnterior: boolean;
  /** Valor do último pagamento confirmado de mensalidade (já com desconto de cupom). Null se nunca pagou. */
  valorPago?: number | null;
}

export type StatusAdmin =
  | 'ativo' | 'teste' | 'carencia' | 'bloqueado_cobranca' | 'teste_encerrado' | 'bloqueado_admin' | 'cancelado';
export type TipoAlerta = 'cobranca' | 'teste_sem_onboarding' | 'whatsapp' | 'sem_agendamento';

function partesLocais(d: Date): { ano: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const pega = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { ano: pega('year'), mes: pega('month'), dia: pega('day') };
}

const chaveDia = (d: Date): string => { const p = partesLocais(d); return `${p.ano}-${p.mes}-${p.dia}`; };

/**
 * Meia-noite do dia 1º do mês local (America/Sao_Paulo), em UTC, `mesesAtras` meses antes.
 * São Paulo não tem horário de verão desde 2019: o deslocamento é fixo em -03:00,
 * então a meia-noite local é sempre 03:00 UTC.
 */
export function inicioDoMes(agora: Date, mesesAtras = 0): Date {
  const { ano, mes } = partesLocais(agora);
  return new Date(Date.UTC(ano, mes - 1 - mesesAtras, 1, 3, 0, 0, 0));
}

/** Preço mensal do negócio. No Salão (sob consulta), o valor combinado; sem ele, o legado de PLAN_PRICES. */
export function precoDoPlano(plano: string, valorCombinado: number | null = null): number {
  if (plano === 'premium' && valorCombinado) return valorCombinado;
  return Object.prototype.hasOwnProperty.call(PLAN_PRICES, plano)
    ? PLAN_PRICES[plano as keyof typeof PLAN_PRICES]
    : 0;
}

export function segmentoDe(segmento: string | null): string {
  return segmento && (SEGMENTOS_VALIDOS as readonly string[]).includes(segmento) ? segmento : 'outro';
}

export function statusAdmin(l: LinhaNegocio, agora: Date): StatusAdmin {
  if (!l.ativo) return 'bloqueado_admin';
  const status = normalizeInternalSubscriptionStatus(l.statusAssinatura);
  const estado = calcularEstadoConta({
    status, inadimplenteDesde: l.inadimplenteDesde, jaPagou: l.jaPagou,
    fimDoPeriodo: l.fimDoPeriodo, agora, cartaoCadastrado: l.cartaoCadastrado,
  });
  if (estado.tipo === 'ativa') return status === 'trialing' ? 'teste' : 'ativo';
  if (estado.tipo === 'carencia') return 'carencia';
  if (estado.motivo === 'cobranca') return 'bloqueado_cobranca';
  if (estado.motivo === 'teste') return 'teste_encerrado';
  return 'cancelado';
}

/** `preco` é o preço de tabela do plano; `receita` é o que o negócio de fato pagou (cupom com desconto entra pelo valor pago). */
type ComStatus = { l: LinhaNegocio; status: StatusAdmin; preco: number; receita: number };

function comStatus(ls: LinhaNegocio[], agora: Date): ComStatus[] {
  return ls.map((l) => ({
    l, status: statusAdmin(l, agora), preco: precoDoPlano(l.plano, l.valorCombinado ?? null),
    receita: l.valorPago && l.valorPago > 0 ? l.valorPago : 0,
  }));
}

// Pagante = ativo ou em carência E com pagamento confirmado: é a base do MRR. Conta de cupom gratuito,
// cortesia ou ajuste manual do admin (status ativo sem pagamento) não é pagante e não entra no MRR.
const ehPagante = (x: ComStatus) => (x.status === 'ativo' || x.status === 'carencia') && x.receita > 0;
// Quem pagou no mês anterior e hoje está cancelado ou bloqueado por cobrança saiu da base.
const ehChurn = (x: ComStatus) =>
  x.l.pagouMesAnterior && (x.status === 'cancelado' || x.status === 'bloqueado_cobranca');
const soma = (xs: ComStatus[]) => xs.reduce((acc, x) => acc + x.receita, 0);
const pct = (parte: number, total: number) => (total === 0 ? null : (parte / total) * 100);

export function resumoMrr(ls: LinhaNegocio[], agora: Date) {
  const xs = comStatus(ls, agora);
  const mesAtual = inicioDoMes(agora).getTime();
  const mrr = soma(xs.filter(ehPagante));
  // O valor é o do último pagamento de mensalidade: não há histórico de troca de plano.
  const mrrMesAnterior = soma(xs.filter((x) => x.l.pagouMesAnterior));
  const novos = soma(xs.filter((x) => ehPagante(x)
    && x.l.primeiroPagamentoEm !== null && x.l.primeiroPagamentoEm.getTime() >= mesAtual));
  const churn = soma(xs.filter(ehChurn));
  const variacaoPct = mrrMesAnterior === 0 ? null : ((mrr - mrrMesAnterior) / mrrMesAnterior) * 100;
  return { mrr, mrrMesAnterior, variacaoPct, novos, churn };
}

export function resumoTestes(ls: LinhaNegocio[], agora: Date) {
  const testes = comStatus(ls, agora).filter((x) => x.status === 'teste');
  const t = agora.getTime();
  const vencendo48h = testes.filter((x) => x.l.fimDoPeriodo
    && x.l.fimDoPeriodo.getTime() > t && x.l.fimDoPeriodo.getTime() <= t + 48 * MS_HORA).length;
  const novosNaSemana = testes.filter((x) => x.l.criadoEm.getTime() >= t - 7 * MS_DIA).length;
  return { ativos: testes.length, vencendo48h, novosNaSemana };
}

export function conversaoPorSegmento(ls: LinhaNegocio[], agora: Date, dias: number) {
  const corte = agora.getTime() - dias * MS_DIA;
  const xs = comStatus(ls, agora);
  const coorte = xs.filter((x) => x.l.criadoEm.getTime() >= corte);
  const linhaDe = (criados: ComStatus[]) => {
    const pagantes = criados.filter((x) => x.l.jaPagou).length;
    return { criados: criados.length, pagantes, taxaPct: pct(pagantes, criados.length) };
  };
  const segmentos = (SEGMENTOS_VALIDOS as readonly string[]).map((segmento) => {
    const doSegmento = (x: ComStatus) => segmentoDe(x.l.segmento) === segmento;
    // Ticket médio: pagantes de hoje no segmento, mesmo os que entraram antes da coorte.
    const pagantesHoje = xs.filter((x) => doSegmento(x) && ehPagante(x));
    return {
      segmento,
      ...linhaDe(coorte.filter(doSegmento)),
      ticketMedio: pagantesHoje.length === 0 ? null : soma(pagantesHoje) / pagantesHoje.length,
    };
  });
  return { geral: linhaDe(coorte), segmentos };
}

export function resumoCancelamentos(ls: LinhaNegocio[], agora: Date) {
  const xs = comStatus(ls, agora);
  const mesAtual = inicioDoMes(agora).getTime();
  const cancelamentosMes = xs.filter((x) => x.l.canceladoEm !== null && x.l.canceladoEm.getTime() >= mesAtual).length;
  const churned = xs.filter(ehChurn);
  const base = xs.filter((x) => x.l.pagouMesAnterior).length;
  return {
    cancelamentosMes,
    churnContas: churned.length,
    receitaCancelada: soma(churned),
    retencaoPct: pct(base - churned.length, base),
  };
}

export function cartoesGestao(ls: LinhaNegocio[], agora: Date) {
  const xs = comStatus(ls, agora);
  const pagantes = xs.filter(ehPagante);
  const mrr = soma(pagantes);
  const testes = xs.filter((x) => x.status === 'teste');
  const hoje = chaveDia(agora);
  const inadimplentes = xs.filter((x) => x.status === 'carencia' || x.status === 'bloqueado_cobranca');
  return {
    base: xs.length,
    pagantes: pagantes.length,
    mrr,
    ticketMedio: pagantes.length === 0 ? null : mrr / pagantes.length,
    testes: testes.length,
    testesVencemHoje: testes.filter((x) => x.l.fimDoPeriodo && chaveDia(x.l.fimDoPeriodo) === hoje).length,
    conversaoPct: conversaoPorSegmento(ls, agora, 30).geral.taxaPct,
    inadimplentes: inadimplentes.length,
    valorPendente: soma(inadimplentes),
    bloqueioTotal: xs.filter((x) => x.status === 'bloqueado_cobranca').length,
  };
}

/** Cadastros novos: contagem por janela ("hoje" é o dia local) e os mais recentes. Vale para qualquer status. */
export function resumoCadastros(ls: LinhaNegocio[], agora: Date, limite = 8) {
  const t = agora.getTime();
  const hoje = chaveDia(agora);
  const desde = (dias: number) => ls.filter((l) => l.criadoEm.getTime() >= t - dias * MS_DIA).length;
  const recentes = [...ls]
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
    .slice(0, limite)
    .map((l) => ({
      id: l.id, nome: l.nome, dono: l.dono, plano: l.plano, segmento: segmentoDe(l.segmento),
      criadoEm: l.criadoEm, status: statusAdmin(l, agora), onboardingConcluido: l.onboardingConcluido,
    }));
  return {
    hoje: ls.filter((l) => chaveDia(l.criadoEm) === hoje).length,
    ultimos7d: desde(7),
    ultimos30d: desde(30),
    recentes,
  };
}

const ORDEM_ALERTA: TipoAlerta[] = ['cobranca', 'teste_sem_onboarding', 'whatsapp', 'sem_agendamento'];

export interface AlertaRisco {
  id: string; nome: string; dono: string; whatsapp: string; segmento: string; plano: string;
  tipo: TipoAlerta; desde: Date;
  /** Pagante: o valor pago de fato. Nos demais, o preço de tabela (valor em potencial). */
  mrr: number;
  pagante: boolean;
}

export function negociosEmRisco(ls: LinhaNegocio[], agora: Date): AlertaRisco[] {
  const t = agora.getTime();
  const alertas: AlertaRisco[] = [];

  for (const x of comStatus(ls, agora)) {
    const { l, status, preco } = x;
    // 'carencia' sempre casa com 'cobranca' primeiro, então as regras seguintes só enxergam os demais status.
    let tipo: TipoAlerta | null = null;
    let desde: Date | null = null;

    if (status === 'carencia' || status === 'bloqueado_cobranca') {
      tipo = 'cobranca';
      desde = l.inadimplenteDesde ?? agora;
    } else if (status === 'teste' && l.fimDoPeriodo && l.fimDoPeriodo.getTime() > t
      && l.fimDoPeriodo.getTime() <= t + 48 * MS_HORA && !l.onboardingConcluido) {
      tipo = 'teste_sem_onboarding';
      desde = l.criadoEm;
    } else if ((status === 'ativo' || status === 'teste')
      && l.temInstanciaWhatsapp && l.whatsappConectadoEm === null
      && l.ultimoEnvioEm !== null && l.ultimoEnvioEm.getTime() < t - 2 * MS_DIA) {
      // O sistema apaga whatsapp_connected_at ao desconectar e não guarda a hora da queda:
      // o último envio que saiu é a "última conexão conhecida". Sem envio nenhum, não há alerta.
      tipo = 'whatsapp';
      desde = l.ultimoEnvioEm;
    } else if (status === 'ativo' && l.jaPagou) {
      const ref = l.ultimoAgendamentoEm ?? l.primeiroPagamentoEm;
      if (ref && ref.getTime() < t - 7 * MS_DIA) {
        tipo = 'sem_agendamento';
        desde = ref;
      }
    }

    if (tipo && desde) {
      alertas.push({
        id: l.id, nome: l.nome, dono: l.dono, whatsapp: l.whatsapp,
        segmento: segmentoDe(l.segmento), plano: l.plano, tipo, desde,
        mrr: ehPagante(x) ? x.receita : preco, pagante: ehPagante(x),
      });
    }
  }

  return alertas.sort((a, b) =>
    ORDEM_ALERTA.indexOf(a.tipo) - ORDEM_ALERTA.indexOf(b.tipo) || a.desde.getTime() - b.desde.getTime());
}

/**
 * Por que o teste grátis não pode ser estendido, ou null quando pode. Fonte única da regra:
 * usada pela rota PATCH /admin/tenants/:id/trial e pelo detalhe (podeEstenderTeste).
 * - 'status': só quem está em teste, ou terminou o teste sem nunca pagar (incomplete sem pagamento);
 * - teste com cartão: pode estender; o vencimento da 1ª cobrança é movido no Asaas (adminService).
 */
export function motivoParaNaoEstenderTeste(
  l: Pick<LinhaNegocio, 'statusAssinatura' | 'jaPagou'>,
): 'status' | null {
  const status = normalizeInternalSubscriptionStatus(l.statusAssinatura);
  const emTeste = status === 'trialing' || (status === 'incomplete' && !l.jaPagou);
  if (!emTeste) return 'status';
  return null;
}
