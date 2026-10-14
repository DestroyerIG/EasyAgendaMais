import { ConflictError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { cashRepository } from './cash.repository.js';
import type { CashDayDto, CashMovementInput, CloseCashInput } from './cash.types.js';

type Linha = CashDayDto['linhas'][number];

const n = (v: unknown) => Number(v ?? 0);
const cents = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const hhmm = (d: Date) => d.toISOString().substring(11, 16);

export function calcularGaveta(g: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number }) {
  const esperado = reais(cents(g.fundoInicial) + cents(g.entradasDinheiro) + cents(g.suprimentos) - cents(g.sangrias) - cents(g.saidasDinheiro));
  return { ...g, esperado };
}

async function hoje(businessId: string) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  return todayInTimezone(timezone);
}

export const cashService = {
  async getDay(businessId: string, date?: string): Promise<CashDayDto> {
    const diaDeHoje = await hoje(businessId);
    const dia = date ?? diaDeHoje;
    const session = await cashRepository.findSession(businessId, dia);
    const [comandas, emAtendimento, faltas, despesas, movimentos, responsavel] = await Promise.all([
      session ? cashRepository.findClosedComandas(session.id) : Promise.resolve([]),
      cashRepository.findAppointmentsByStatus(businessId, dia, 'em_atendimento'),
      cashRepository.findAppointmentsByStatus(businessId, dia, 'faltou'),
      cashRepository.findExpenses(businessId, dia),
      session ? cashRepository.findMovements(session.id) : Promise.resolve([]),
      cashRepository.ownerName(businessId),
    ]);

    const forma = (chave: 'pix' | 'debito' | 'credito' | 'dinheiro') => {
      const lista = comandas.filter((k) => k.paymentMethod === chave);
      return { chave, valor: reais(lista.reduce((t, k) => t + cents(n(k.totalCharged)), 0)), quantidade: lista.length };
    };
    const comSinal = comandas.filter((k) => n(k.depositApplied) > 0);
    // Sinal retido de quem faltou só entra quando há caixa aberto naquele dia.
    const faltasComSinal = session ? faltas.filter((a) => n(a.depositAmount) > 0) : [];
    const sinaisCents = comSinal.reduce((t, k) => t + cents(n(k.depositApplied)), 0)
      + faltasComSinal.reduce((t, a) => t + cents(n(a.depositAmount)), 0);
    const formas: CashDayDto['formas'] = [
      forma('pix'),
      { chave: 'sinal_pix', valor: reais(sinaisCents), quantidade: comSinal.length + faltasComSinal.length },
      forma('debito'), forma('credito'), forma('dinheiro'),
    ];
    const entradasCents = formas.reduce((t, f) => t + cents(f.valor), 0);
    const saidasCents = despesas.reduce((t, e) => t + cents(n(e.amount)), 0);

    const linhas: Linha[] = [
      ...comandas.map((k): Linha => ({
        appointmentId: k.appointment.id, comandaId: k.id, numero: k.number, hora: hhmm(k.appointment.time),
        cliente: k.client.name, telefone: k.client.phone, profissional: k.professional.name,
        servicos: k.items.map((i) => i.name).join(' + '),
        pagamento: (k.paymentMethod ?? 'sinal') as Linha['pagamento'],
        depositApplied: n(k.depositApplied), total: reais(cents(n(k.totalCharged)) + cents(n(k.depositApplied))), status: 'Fechada',
      })),
      ...emAtendimento.map((a): Linha => ({
        appointmentId: a.id, comandaId: null, numero: null, hora: hhmm(a.time), cliente: a.client.name, telefone: a.client.phone,
        profissional: a.professional.name, servicos: a.service.name, pagamento: 'em_atendimento',
        depositApplied: 0, total: n(a.service.price), status: 'Aberta',
      })),
      ...faltas.map((a): Linha => ({
        appointmentId: a.id, comandaId: null, numero: null, hora: hhmm(a.time), cliente: a.client.name, telefone: a.client.phone,
        profissional: a.professional.name, servicos: a.service.name, pagamento: 'faltou',
        depositApplied: n(a.depositAmount), total: n(a.service.price), status: 'Falta',
      })),
    ].sort((a, b) => a.hora.localeCompare(b.hora));

    const somaMov = (k: 'sangria' | 'suprimento') => reais(movimentos.filter((m) => m.kind === k).reduce((t, m) => t + cents(n(m.amount)), 0));
    const gaveta = calcularGaveta({
      fundoInicial: n(session?.openingBalance),
      entradasDinheiro: formas.find((f) => f.chave === 'dinheiro')!.valor,
      suprimentos: somaMov('suprimento'),
      sangrias: somaMov('sangria'),
      saidasDinheiro: reais(despesas.filter((e) => e.paymentMethod === 'dinheiro').reduce((t, e) => t + cents(n(e.amount)), 0)),
    });

    return {
      date: dia, isToday: dia === diaDeHoje, responsavel,
      session: session ? {
        id: session.id, openedAt: session.openedAt.toISOString(), openingBalance: n(session.openingBalance),
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        countedBalance: session.countedBalance === null ? null : n(session.countedBalance),
        expectedBalance: session.expectedBalance === null ? null : n(session.expectedBalance),
        difference: session.difference === null ? null : n(session.difference),
      } : null,
      totals: {
        entradas: reais(entradasCents), entradasQtd: comandas.length + comSinal.length + faltasComSinal.length,
        saidas: reais(saidasCents), saidasQtd: despesas.length, saldo: reais(entradasCents - saidasCents),
      },
      comandasResumo: { total: comandas.length + emAtendimento.length + faltas.length, fechadas: comandas.length, abertas: emAtendimento.length, falta: faltas.length },
      formas, linhas,
      despesas: despesas.map((e) => ({ id: e.id, descricao: e.description, categoria: e.category, valor: n(e.amount), formaPagamento: e.paymentMethod, criadoEm: e.createdAt.toISOString() })),
      movimentos: movimentos.map((m) => ({ id: m.id, kind: m.kind as 'sangria' | 'suprimento', valor: n(m.amount), descricao: m.description, criadoEm: m.createdAt.toISOString() })),
      gaveta,
    };
  },

  async open(businessId: string, userId: string, openingBalance: number) {
    const dia = await hoje(businessId);
    try {
      await cashRepository.createSession(businessId, dia, userId, openingBalance);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictError('O caixa de hoje já está aberto');
      throw error;
    }
    return cashService.getDay(businessId, dia);
  },

  async addMovement(businessId: string, userId: string, input: CashMovementInput) {
    const dia = await hoje(businessId);
    const session = await cashRepository.findSession(businessId, dia);
    if (!session) throw new ConflictError('Abra o caixa de hoje antes de registrar movimentos');
    if (session.closedAt) throw new ConflictError('O caixa de hoje já foi fechado');
    await cashRepository.addMovement(session.id, businessId, userId, input);
    return cashService.getDay(businessId, dia);
  },

  async close(businessId: string, userId: string, input: CloseCashInput) {
    const dia = input.date ?? (await hoje(businessId));
    const session = await cashRepository.findSession(businessId, dia);
    if (!session) throw new ConflictError('Não há caixa aberto nesta data');
    if (session.closedAt) throw new ConflictError('Este caixa já foi fechado');
    const { gaveta } = await cashService.getDay(businessId, dia);
    const difference = reais(cents(input.countedBalance) - cents(gaveta.esperado));
    const ok = await cashRepository.closeSession(session.id, userId, {
      countedBalance: input.countedBalance, expectedBalance: gaveta.esperado, difference, notes: input.notes ?? null,
    });
    if (!ok) throw new ConflictError('Este caixa já foi fechado');
    return cashService.getDay(businessId, dia);
  },
};
