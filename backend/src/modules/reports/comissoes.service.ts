import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { evaluateFeatureAccess } from '../../services/featureAccessService.js';
import { FeatureAccessError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { reportsRepository as repo } from './reports.repository.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { type Periodo, intervaloUtc } from './periodo.js';
import {
  type AdiantamentoAberto, type ComandaApurada, type ModeloRepasse,
  apurar, cents, consumirAdiantamentos, diferencaDesdePagamento, reais, saldoAdiantamento, statusRepasse, totalizar,
} from './comissoes.rules.js';

// Apuração, repasses e adiantamentos das profissionais (sub-projeto 3).

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const podeSalaoParceiro = (plan: unknown, subscriptionStatus: unknown) =>
  evaluateFeatureAccess({ feature: 'salao_parceiro', plan, subscriptionStatus }).allowed;

interface Contexto { plan?: unknown; subscriptionStatus?: unknown }

async function modeloEfetivo(businessId: string, ctx: Contexto): Promise<{ salvo: ModeloRepasse; efetivo: ModeloRepasse; liberado: boolean }> {
  const salvo = (await repo.modeloRepasse(businessId)) === 'salao_parceiro' ? 'salao_parceiro' : 'comissao';
  const liberado = podeSalaoParceiro(ctx.plan, ctx.subscriptionStatus);
  return { salvo, efetivo: salvo === 'salao_parceiro' && liberado ? 'salao_parceiro' : 'comissao', liberado };
}

const paraApurada = (k: Awaited<ReturnType<typeof repo.comandasFechadas>>[number]): ComandaApurada => {
  let comissaoServico = 0;
  let comissaoProduto = 0;
  for (const i of k.items) {
    if (i.kind === 'produto') comissaoProduto += cents(i.commissionAmount);
    else comissaoServico += cents(i.commissionAmount);
  }
  return {
    professionalId: k.professionalId,
    // A sessão coberta sai a R$ 0 na comanda, mas é serviço que a profissional produziu.
    servicos: reais(cents(k.servicesTotal) + k.items.reduce((t, i) => t + cents(i.valorCoberto), 0)), produtos: Number(k.productsTotal),
    desconto: Number(k.discountAmount), gorjeta: Number(k.tipAmount),
    comissaoServico: reais(comissaoServico), comissaoProduto: reais(comissaoProduto),
  };
};

const abertos = (lista: Awaited<ReturnType<typeof repo.adiantamentos>>): AdiantamentoAberto[] =>
  lista
    .map((a) => ({ id: a.id, professionalId: a.professionalId, valor: Number(a.valor), valorAbatido: Number(a.valorAbatido), data: ymd(a.data) }))
    .filter((a) => saldoAdiantamento(a) > 0);

async function apurarPeriodo(businessId: string, p: Periodo) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const [comandas, adiantamentos] = await Promise.all([
    repo.comandasFechadas(businessId, intervaloUtc(p, timezone)),
    repo.adiantamentos(businessId, { ate: p.fim }),
  ]);
  const abertosLista = abertos(adiantamentos);
  return { linhas: apurar(comandas.map(paraApurada), abertosLista), abertos: abertosLista };
}

export const comissoesService = {
  async apuracao(businessId: string, p: Periodo, ctx: Contexto) {
    const [{ linhas }, repasses, modelo] = await Promise.all([
      apurarPeriodo(businessId, p),
      repo.repasses(businessId, p),
      modeloEfetivo(businessId, ctx),
    ]);
    const ids = [...new Set([...linhas.map((l) => l.professionalId), ...repasses.map((r) => r.professionalId)])];
    const profissionais = await repo.profissionais(businessId, ids);
    const porId = new Map(profissionais.map((x) => [x.id, x]));
    const repassePor = new Map(repasses.map((r) => [r.professionalId, r]));

    const itens = ids.flatMap((id) => {
      const prof = porId.get(id);
      if (!prof) return [];
      const l = linhas.find((x) => x.professionalId === id) ?? {
        professionalId: id, atendimentos: 0, servicos: 0, produtos: 0, faturamento: 0, comissaoServico: 0, comissaoProduto: 0,
        comissao: 0, cotaSalao: 0, gorjetas: 0, adiantamentosAbertos: 0, adiantamentos: 0, aPagar: 0,
      };
      const r = repassePor.get(id);
      const adiantamentos = r ? cents(r.adiantamentos) : l.adiantamentos;
      const aPagar = r ? cents(r.valorPago) : l.aPagar;
      const diferenca = r ? diferencaDesdePagamento(l, r) : 0;
      return [{
        professional: {
          id: prof.id, nome: prof.name, foto: prof.photo, ativa: prof.active,
          cnpj: prof.cnpj, especialidade: prof.especialidade,
        },
        atendimentos: l.atendimentos,
        servicos: reais(l.servicos), produtos: reais(l.produtos), faturamento: reais(l.faturamento),
        comissaoServico: reais(l.comissaoServico), comissaoProduto: reais(l.comissaoProduto), comissao: reais(l.comissao),
        cotaSalao: reais(l.cotaSalao), gorjetas: reais(l.gorjetas),
        adiantamentos: reais(adiantamentos), adiantamentosAbertos: reais(l.adiantamentosAbertos), aPagar: reais(aPagar),
        status: statusRepasse(aPagar, Boolean(r)),
        repasse: r ? { id: r.id, pagoEm: r.pagoEm.toISOString(), forma: r.forma, observacao: r.observacao, valorPago: Number(r.valorPago) } : null,
        diferencaDesdePagamento: reais(diferenca),
      }];
    }).sort((a, b) => a.professional.nome.localeCompare(b.professional.nome, 'pt-BR'));

    const t = totalizar(linhas);
    return {
      periodo: p,
      modelo: modelo.efetivo,
      modeloSalvo: modelo.salvo,
      salaoParceiroLiberado: modelo.liberado,
      totais: {
        faturamento: reais(t.faturamento), cotaSalao: reais(t.cotaSalao), cotaProfissionais: reais(t.cotaProfissionais),
        gorjetas: reais(t.gorjetas), retencaoMedia: t.retencaoMedia,
        aPagar: reais(itens.filter((i) => i.status === 'pendente').reduce((s, i) => s + cents(i.aPagar), 0)),
      },
      itens,
    };
  },

  async pagar(
    businessId: string, userId: string, ctx: Contexto,
    d: { professionalId: string; inicio: string; fim: string; forma: string; observacao?: string | null },
  ) {
    const p = { inicio: d.inicio, fim: d.fim };
    const prof = await repo.professional(businessId, d.professionalId);
    if (!prof) throw new NotFoundError('Profissional');
    const existente = await repo.repassePorPeriodo(businessId, d.professionalId, p);
    if (existente) return existente;

    const [{ linhas, abertos: abertosLista }, modelo] = await Promise.all([apurarPeriodo(businessId, p), modeloEfetivo(businessId, ctx)]);
    const l = linhas.find((x) => x.professionalId === d.professionalId);
    if (!l) throw new ValidationError('Nenhuma comanda fechada desta profissional no período.');
    const bruto = l.comissao + l.gorjetas;
    const { abatimentos, total } = consumirAdiantamentos(bruto, abertosLista.filter((a) => a.professionalId === d.professionalId));

    try {
      return await repo.transacao(async (tx) => {
        const repasse = await tx.repasse.create({
          data: {
            businessId, professionalId: d.professionalId,
            periodoInicio: new Date(`${p.inicio}T00:00:00Z`), periodoFim: new Date(`${p.fim}T00:00:00Z`),
            servicos: reais(l.servicos), produtos: reais(l.produtos),
            comissaoServico: reais(l.comissaoServico), comissaoProduto: reais(l.comissaoProduto),
            gorjetas: reais(l.gorjetas), adiantamentos: reais(total), valorPago: reais(bruto - total),
            modelo: modelo.efetivo, forma: d.forma, pagoPor: userId, observacao: d.observacao?.trim() || null,
          },
        });
        for (const a of abatimentos) {
          // Abate só se o saldo ainda cobre (outro pagamento simultâneo não pode usar o mesmo valor).
          const atual = await tx.adiantamento.findUnique({ where: { id: a.id } });
          if (!atual || saldoAdiantamento({ valor: Number(atual.valor), valorAbatido: Number(atual.valorAbatido) }) < a.valor) {
            throw new ValidationError('Um adiantamento mudou durante o pagamento. Atualize a tela e tente de novo.');
          }
          await tx.adiantamento.update({ where: { id: a.id }, data: { valorAbatido: { increment: reais(a.valor) } } });
          await tx.repasseAdiantamento.create({ data: { repasseId: repasse.id, adiantamentoId: a.id, valor: reais(a.valor) } });
        }
        return repasse;
      });
    } catch (e) {
      // Dois cliques ao mesmo tempo: a chave única segura o segundo, que devolve o primeiro.
      if ((e as { code?: string }).code === 'P2002') {
        const r = await repo.repassePorPeriodo(businessId, d.professionalId, p);
        if (r) return r;
      }
      throw e;
    }
  },

  async desfazer(businessId: string, id: string) {
    const r = await repo.repasse(businessId, id);
    if (!r) throw new NotFoundError('Repasse');
    await repo.transacao(async (tx) => {
      for (const a of r.abatimentos) {
        await tx.adiantamento.update({ where: { id: a.adiantamentoId }, data: { valorAbatido: { decrement: Number(a.valor) } } });
      }
      await tx.repasse.delete({ where: { id: r.id } });
    });
    return { id: r.id };
  },

  async listarAdiantamentos(businessId: string, f: { professionalId?: string; abertos?: boolean }) {
    const lista = await repo.adiantamentos(businessId, { professionalId: f.professionalId });
    return lista
      .map((a) => ({
        id: a.id, professionalId: a.professionalId, valor: Number(a.valor), valorAbatido: Number(a.valorAbatido),
        saldo: reais(saldoAdiantamento({ valor: Number(a.valor), valorAbatido: Number(a.valorAbatido) })),
        data: ymd(a.data), descricao: a.descricao,
      }))
      .filter((a) => !f.abertos || a.saldo > 0);
  },

  async lancarAdiantamento(businessId: string, userId: string, d: { professionalId: string; valor: number; data?: string; descricao?: string | null }) {
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const hoje = todayInTimezone(timezone);
    const dia = d.data ?? hoje;
    if (dia > hoje) throw new ValidationError('A data do adiantamento não pode ser futura.');
    if (!(await repo.professional(businessId, d.professionalId))) throw new NotFoundError('Profissional');
    const a = await repo.criarAdiantamento(businessId, userId, {
      professionalId: d.professionalId, valor: d.valor, data: dia, descricao: d.descricao?.trim() || null,
    });
    return { id: a.id, professionalId: a.professionalId, valor: Number(a.valor), valorAbatido: 0, saldo: Number(a.valor), data: ymd(a.data), descricao: a.descricao };
  },

  async excluirAdiantamento(businessId: string, id: string) {
    const a = await repo.adiantamento(businessId, id);
    if (!a) throw new NotFoundError('Adiantamento');
    if (!(await repo.excluirAdiantamentoAberto(businessId, id))) {
      throw new ValidationError('Este adiantamento já foi descontado num repasse. Desfaça o pagamento antes de excluir.');
    }
    return { id };
  },

  async salvarModelo(businessId: string, ctx: Contexto, modelo: ModeloRepasse) {
    if (modelo === 'salao_parceiro') {
      const decisao = evaluateFeatureAccess({ feature: 'salao_parceiro', plan: ctx.plan, subscriptionStatus: ctx.subscriptionStatus });
      if (!decisao.allowed) throw new FeatureAccessError('salao_parceiro', decisao);
    }
    await repo.salvarModeloRepasse(businessId, modelo);
    return { modelo };
  },
};
