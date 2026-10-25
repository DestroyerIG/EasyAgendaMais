import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { reportsRepository as repo } from './reports.repository.js';
import { clubeRepository } from '../clube/clube.repository.js';
import {
  type Periodo, diaNoFuso, diasEntre, intervaloUtc, mesDe, periodoAnterior, somarDias,
} from './periodo.js';
import { cents, reais } from './comissoes.rules.js';
import {
  ORDEM_ORIGENS, type Origem, JANELA_ATRIBUICAO_DIAS, classificarOrigem, horarioDePico, insightOcupacao,
  mapaOcupacao, metaMensal, projecaoDoMes, retornoNoCiclo, taxaFaltas, ticketMedio, variacao,
} from './indicadores.rules.js';

// Tela Relatórios (sub-projeto 3): indicadores, origem, ocupação e evolução.

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => d.toISOString().substring(11, 16);

type Comanda = Awaited<ReturnType<typeof repo.comandasFechadas>>[number];

// Receita da comanda (sem gorjeta) separada em serviços e produtos, com o desconto rateado.
const receita = (k: Comanda) => {
  const s = cents(k.servicesTotal);
  const p = cents(k.productsTotal);
  const d = cents(k.discountAmount);
  const descProd = s + p > 0 ? Math.round((d * p) / (s + p)) : 0;
  return { servicos: s - (d - descProd), produtos: p - descProd, total: s + p - d };
};

const somaReceita = (lista: Comanda[]) => lista.reduce((t, k) => t + receita(k).total, 0);
const somaClube = (lista: { valor: unknown }[]) => lista.reduce((t, b) => t + cents(b.valor), 0);

const visitasPorCliente = (lista: { clientId: string; date: Date }[]) => {
  const m = new Map<string, string[]>();
  for (const v of lista) {
    const d = ymd(v.date);
    const atual = m.get(v.clientId) ?? [];
    if (atual[atual.length - 1] !== d) atual.push(d);
    m.set(v.clientId, atual);
  }
  return m;
};

const ROTULO_ORIGEM: Record<Origem, string> = {
  publico: 'Página pública',
  whatsapp: 'Bot do WhatsApp',
  painel: 'Balcão / painel',
  retorno_campanhas: 'Hora de voltar e campanhas',
};

async function retornoDoPeriodo(businessId: string, p: Periodo, agendamentos: Awaited<ReturnType<typeof repo.agendamentos>>) {
  const clientes = [...new Set(agendamentos.filter((a) => a.status === 'concluido').map((a) => a.clientId))];
  const visitas = await repo.visitasConcluidas(businessId, clientes, p.fim);
  return retornoNoCiclo(visitasPorCliente(visitas), p);
}

export const relatoriosService = {
  async visaoGeral(businessId: string, p: Periodo) {
    const { timezone, diasAbertos } = await getBusinessScheduleSettings(businessId);
    const hoje = todayInTimezone(timezone);
    const ant = periodoAnterior(p);
    const mes = mesDe(hoje);

    const [comandas, comandasAnt, comandasMes, ags, agsAnt, config, clube, clubeMes] = await Promise.all([
      repo.comandasFechadas(businessId, intervaloUtc(p, timezone)),
      repo.comandasFechadas(businessId, intervaloUtc(ant, timezone)),
      repo.comandasFechadas(businessId, intervaloUtc({ inicio: mes.inicio, fim: hoje }, timezone)),
      repo.agendamentos(businessId, p),
      repo.agendamentos(businessId, ant),
      repo.configuracao(businessId),
      clubeRepository.recebimentos(businessId, intervaloUtc(p, timezone)),
      clubeRepository.recebimentos(businessId, intervaloUtc({ inicio: mes.inicio, fim: hoje }, timezone)),
    ]);

    const fatComandas = somaReceita(comandas);
    const fat = fatComandas + somaClube(clube);
    const ticket = ticketMedio(fatComandas, comandas.length);
    const ticketAnt = ticketMedio(somaReceita(comandasAnt), comandasAnt.length);
    const conta = (lista: typeof ags, s: string) => lista.filter((a) => a.status === s).length;
    const faltas = taxaFaltas(conta(ags, 'concluido'), conta(ags, 'faltou'));
    const faltasAnt = taxaFaltas(conta(agsAnt, 'concluido'), conta(agsAnt, 'faltou'));
    const [retorno, retornoAnt] = await Promise.all([retornoDoPeriodo(businessId, p, ags), retornoDoPeriodo(businessId, ant, agsAnt)]);

    // Origem: agendamentos não cancelados, com atribuição de Hora de voltar e campanhas.
    const validos = ags.filter((a) => a.status !== 'cancelado');
    let origem: { id: Origem; rotulo: string; quantidade: number; percentual: number; faturamento: number }[] = [];
    if (validos.length) {
      const criados = validos.map((a) => a.createdAt.getTime());
      const envios = await repo.enviosDeRetorno(
        businessId,
        [...new Set(validos.map((a) => a.clientId))],
        { gte: new Date(Math.min(...criados) - JANELA_ATRIBUICAO_DIAS * 86400000), lt: new Date(Math.max(...criados) + 1) },
      );
      const enviosPor = new Map<string, Date[]>();
      for (const e of envios) {
        if (!e.clientId || !e.sentAt) continue;
        enviosPor.set(e.clientId, [...(enviosPor.get(e.clientId) ?? []), e.sentAt]);
      }
      const receitaPorAgendamento = new Map(comandas.map((k) => [k.appointment?.id, receita(k).total]));
      const soma = new Map<Origem, { quantidade: number; faturamento: number }>();
      for (const a of validos) {
        const o = classificarOrigem(a.source, a.createdAt, enviosPor.get(a.clientId) ?? []);
        const s = soma.get(o) ?? { quantidade: 0, faturamento: 0 };
        s.quantidade += 1;
        s.faturamento += receitaPorAgendamento.get(a.id) ?? 0;
        soma.set(o, s);
      }
      origem = ORDEM_ORIGENS.map((id) => {
        const s = soma.get(id) ?? { quantidade: 0, faturamento: 0 };
        return {
          id, rotulo: ROTULO_ORIGEM[id], quantidade: s.quantidade,
          percentual: Math.round((s.quantidade / validos.length) * 100), faturamento: reais(s.faturamento),
        };
      });
    }

    const fatMes = somaReceita(comandasMes) + somaClube(clubeMes);
    const meta = metaMensal(config.metaDiaria, mes, diasAbertos);
    const projecao = projecaoDoMes(fatMes, hoje, mes);
    const produtos = comandas.reduce((t, k) => t + receita(k).produtos, 0);

    return {
      periodo: p,
      anterior: ant,
      indicadores: {
        ticketMedio: { valor: ticket === null ? null : reais(ticket), anterior: ticketAnt === null ? null : reais(ticketAnt), variacao: variacao(ticket, ticketAnt) },
        retornoNoCiclo: { valor: retorno.taxa, base: retorno.base, variacao: variacao(retorno.taxa, retornoAnt.taxa) },
        faltas: { valor: faltas, variacao: variacao(faltas, faltasAnt), sinalPix: config.sinalPix, lembretes: config.lembretes },
        faturamentoMes: {
          valor: reais(fatMes), meta: meta === null ? null : reais(meta),
          percentual: meta ? Math.round((fatMes / meta) * 100) : null,
        },
      },
      faturamento: reais(fat),
      comandas: comandas.length,
      origem: { total: validos.length, itens: origem },
      rodape: {
        produtosPercentual: fat > 0 ? Math.round((produtos / fat) * 100) : null,
        projecaoMes: reais(projecao),
        diasRestantes: diasEntre(hoje, mes.fim),
      },
    };
  },

  async ocupacao(businessId: string, p: Periodo) {
    const { openingTime, closingTime, diasAbertos } = await getBusinessScheduleSettings(businessId);
    const [profissionais, ags] = await Promise.all([repo.profissionais(businessId), repo.agendamentos(businessId, p)]);
    const ocupando = ags
      .filter((a) => ['confirmado', 'em_atendimento', 'concluido', 'faltou'].includes(a.status))
      .map((a) => ({ professionalId: a.professionalId, date: ymd(a.date), time: hhmm(a.time), duracao: a.service?.durationMinutes ?? 0 }));
    const mapa = mapaOcupacao(p, { openingTime, closingTime, diasAbertos }, profissionais, ocupando);
    const porId = new Map(profissionais.map((x) => [x.id, x]));
    return {
      periodo: p,
      diasAbertos,
      linhas: mapa.linhas.map((l) => ({
        professional: { id: l.professionalId, nome: porId.get(l.professionalId)?.name ?? '', especialidade: porId.get(l.professionalId)?.especialidade ?? null },
        celulas: l.celulas.map(({ dia, turno, ocupacao }) => ({ dia, turno, ocupacao })),
      })),
      media: mapa.media.map(({ dia, turno, ocupacao }) => ({ dia, turno, ocupacao })),
      insight: insightOcupacao(mapa.media, p),
      pico: horarioDePico(mapa.media),
    };
  },

  async evolucao(businessId: string) {
    const { timezone, diasAbertos } = await getBusinessScheduleSettings(businessId);
    const hoje = todayInTimezone(timezone);
    const meses: Periodo[] = [];
    let ref = hoje;
    for (let i = 0; i < 6; i++) {
      meses.unshift(mesDe(ref));
      ref = somarDias(`${ref.slice(0, 7)}-01`, -1);
    }
    const [comandas, config, clube] = await Promise.all([
      repo.comandasFechadas(businessId, intervaloUtc({ inicio: meses[0].inicio, fim: hoje }, timezone)),
      repo.configuracao(businessId),
      clubeRepository.recebimentos(businessId, intervaloUtc({ inicio: meses[0].inicio, fim: hoje }, timezone)),
    ]);
    const balde = new Map(meses.map((m) => [m.inicio.slice(0, 7), { servicos: 0, produtos: 0 }]));
    for (const k of comandas) {
      if (!k.closedAt) continue;
      const b = balde.get(diaNoFuso(k.closedAt, timezone).slice(0, 7));
      if (!b) continue;
      const r = receita(k);
      b.servicos += r.servicos;
      b.produtos += r.produtos;
    }
    // Mensalidades e pacotes recebidos entram como serviço no mês do pagamento.
    for (const k of clube) {
      if (!k.pagoEm) continue;
      const b = balde.get(diaNoFuso(k.pagoEm, timezone).slice(0, 7));
      if (b) b.servicos += cents(k.valor);
    }
    const atual = meses[meses.length - 1];
    return {
      meses: meses.map((m) => {
        const b = balde.get(m.inicio.slice(0, 7))!;
        const meta = metaMensal(config.metaDiaria, m, diasAbertos);
        const ehAtual = m === atual;
        return {
          mes: m.inicio.slice(0, 7),
          servicos: reais(b.servicos), produtos: reais(b.produtos), total: reais(b.servicos + b.produtos),
          meta: meta === null ? null : reais(meta),
          atual: ehAtual,
          projecao: ehAtual ? reais(projecaoDoMes(b.servicos + b.produtos, hoje, m)) : null,
        };
      }),
    };
  },
};
