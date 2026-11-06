import { prisma } from '../../config/prisma.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { publicBookingRepository } from '../publicBooking/publicBooking.repository.js';
import { centavos, reais } from './recebimentos.rules.js';
import type { GatewayId, PagamentoGateway } from './recebimentos.types.js';

// Recebimentos (Mercado Pago): acesso ao banco da conexão do negócio e das cobranças do sinal.

export interface DadosConexao {
  businessId: string;
  gateway: GatewayId;
  contaExternaId: string;
  contaNome: string;
  accessTokenCifrado: string;
  refreshTokenCifrado: string;
  tokenExpiraEm: Date;
}

/** Lançada dentro de uma transação para desfazê-la sem que isso seja um erro. */
class DesfazerTransacao extends Error {}

/** O índice único de (gateway, pagamento externo) barrou: este pagamento já foi gravado. */
const ehRepeticao = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

const dadosDePaga = (p: PagamentoGateway) => ({
  situacao: 'paga', pagamentoExternoId: p.id, formaPaga: p.formaPaga, pagoEm: new Date(),
});

export type ResultadoReativacao = 'reativada' | 'ocupado' | 'sem_efeito';

export const recebimentosRepository = {
  usuario(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { id: true, businessId: true, role: true } });
  },

  conexaoDoNegocio(businessId: string) {
    return prisma.conexaoRecebimento.findUnique({ where: { businessId } });
  },

  conexaoPorContaExterna(gateway: string, contaExternaId: string) {
    return prisma.conexaoRecebimento.findFirst({ where: { gateway, contaExternaId }, select: { businessId: true } });
  },

  /** A mesma conta do gateway não pode estar em dois negócios: o webhook roteia pelo id da conta. */
  async contaEmOutroNegocio(gateway: string, contaExternaId: string, businessId: string): Promise<boolean> {
    const c = await prisma.conexaoRecebimento.findFirst({
      where: { gateway, contaExternaId, businessId: { not: businessId } }, select: { id: true },
    });
    return c !== null;
  },

  /** Só quem está ativa vira "precisa reconectar"; true quando esta chamada fez a troca. */
  async marcarReconectar(businessId: string): Promise<boolean> {
    const { count } = await prisma.conexaoRecebimento.updateMany({
      where: { businessId, situacao: 'ativa' }, data: { situacao: 'precisa_reconectar' },
    });
    return count === 1;
  },

  conexoesAtivas() {
    return prisma.conexaoRecebimento.findMany({ where: { situacao: 'ativa' } });
  },

  /**
   * Mesma conta: atualiza a linha e preserva as formas escolhidas. Outra conta (ou primeira
   * conexão): a linha do negócio é substituída, porque só um gateway fica ativo.
   */
  async salvarConexao(d: DadosConexao) {
    return prisma.$transaction(async (tx) => {
      const anterior = await tx.conexaoRecebimento.findUnique({ where: { businessId: d.businessId } });
      if (anterior && anterior.gateway === d.gateway && anterior.contaExternaId === d.contaExternaId) {
        return tx.conexaoRecebimento.update({ where: { id: anterior.id }, data: { ...d, situacao: 'ativa' } });
      }
      if (anterior) await tx.conexaoRecebimento.delete({ where: { id: anterior.id } });
      return tx.conexaoRecebimento.create({ data: { ...d, situacao: 'ativa', aceitaPix: true, aceitaCartao: false } });
    });
  },

  atualizarConexao(
    id: string,
    patch: {
      situacao?: string; aceitaPix?: boolean; aceitaCartao?: boolean; aceiteCartaoEm?: Date;
      accessTokenCifrado?: string; refreshTokenCifrado?: string; tokenExpiraEm?: Date;
    },
  ) {
    return prisma.conexaoRecebimento.update({ where: { id }, data: patch });
  },

  /** Reserva o alerta com um UPDATE condicional: duas chamadas juntas alertam uma vez só. */
  async reservarAlerta(id: string, agora: Date, intervaloMs: number): Promise<boolean> {
    const { count } = await prisma.conexaoRecebimento.updateMany({
      where: { id, OR: [{ ultimoAlertaEm: null }, { ultimoAlertaEm: { lt: new Date(agora.getTime() - intervaloMs) } }] },
      data: { ultimoAlertaEm: agora },
    });
    return count === 1;
  },

  /** As cobranças ficam: só a conexão some. */
  async apagarConexao(businessId: string) {
    await prisma.conexaoRecebimento.deleteMany({ where: { businessId } });
  },

  async ultimaConfirmacaoEm(businessId: string): Promise<Date | null> {
    const r = await prisma.cobrancaSinal.aggregate({ where: { businessId }, _max: { pagoEm: true } });
    return r._max.pagoEm;
  },

  reservasPendentes(businessId: string) {
    return prisma.cobrancaSinal.count({
      where: { businessId, situacao: 'pendente', appointment: { status: 'aguardando_pagamento' } },
    });
  },

  // ─── Cobranças do sinal ───────────────────────────────────────────────────────

  cobrancaComReserva(cobrancaId: string) {
    return prisma.cobrancaSinal.findUnique({
      where: { id: cobrancaId },
      include: { appointment: { select: { status: true, expiresAt: true } } },
    });
  },

  cobrancaDoNegocio(cobrancaId: string, businessId: string) {
    return prisma.cobrancaSinal.findFirst({ where: { id: cobrancaId, businessId }, select: { id: true } });
  },

  /** A reserva completa, com cliente e serviço, para os avisos. */
  async reservaDaCobranca(cobrancaId: string) {
    const c = await prisma.cobrancaSinal.findUnique({
      where: { id: cobrancaId }, select: { appointmentId: true, businessId: true },
    });
    return c ? appointmentsPrismaRepository.findById(c.appointmentId, c.businessId) : null;
  },

  async outraCobrancaPaga(appointmentId: string, cobrancaId: string): Promise<boolean> {
    const n = await prisma.cobrancaSinal.count({ where: { appointmentId, situacao: 'paga', id: { not: cobrancaId } } });
    return n > 0;
  },

  /** Cobranças que ainda podem receber pagamento. A recusada entra porque o cartão aceita nova tentativa. */
  cobrancasParaConferir(venceuDesde: Date) {
    return prisma.cobrancaSinal.findMany({
      where: { situacao: { in: ['pendente', 'expirada', 'recusada'] }, venceEm: { gte: venceuDesde } },
      select: { id: true },
    });
  },

  /**
   * Grava a cobrança como paga e confirma a reserva, tudo ou nada. Se a reserva não puder mudar,
   * a marca de paga é desfeita para a rodada seguinte decidir de novo. As mensagens saem depois,
   * só para quem recebeu `confirmou: true`: uma queda pode perder um aviso, mas nunca envia dois.
   */
  async marcarPagaEConfirmar(cobrancaId: string, pagamento: PagamentoGateway): Promise<{ confirmou: boolean }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const agora = new Date();
        const { count } = await tx.cobrancaSinal.updateMany({
          where: { id: cobrancaId, situacao: { not: 'paga' } }, data: dadosDePaga(pagamento),
        });
        if (count !== 1) return { confirmou: false };

        const c = await tx.cobrancaSinal.findUniqueOrThrow({ where: { id: cobrancaId }, select: { appointmentId: true } });
        const reserva = await tx.appointment.updateMany({
          where: { id: c.appointmentId, status: 'aguardando_pagamento', expiresAt: { gt: agora } },
          data: { status: 'confirmado' },
        });
        if (reserva.count !== 1) throw new DesfazerTransacao();
        return { confirmou: true };
      });
    } catch (e) {
      if (e instanceof DesfazerTransacao || ehRepeticao(e)) return { confirmou: false };
      throw e;
    }
  },

  /**
   * Pago depois do prazo. Dentro da trava de profissional e dia, relê tudo: cobrança e reserva podem
   * ter mudado desde a decisão, e um cancelamento feito por pessoa nunca é revertido. Este é o único
   * lugar que tira uma reserva de `cancelado`. Horário ocupado: fica paga e a reserva não muda.
   */
  async marcarPagaEReativar(cobrancaId: string, pagamento: PagamentoGateway): Promise<ResultadoReativacao> {
    const origem = await prisma.cobrancaSinal.findUnique({
      where: { id: cobrancaId }, select: { appointment: { select: { professionalId: true, date: true } } },
    });
    if (!origem) return 'sem_efeito';
    const { professionalId } = origem.appointment;
    const dia = origem.appointment.date.toISOString().slice(0, 10);

    try {
      return await publicBookingRepository.withProfessionalDayLock(professionalId, dia, async (tx) => {
        const c = await tx.cobrancaSinal.findUnique({
          where: { id: cobrancaId },
          select: {
            situacao: true,
            appointment: { select: { id: true, businessId: true, status: true, time: true } },
          },
        });
        if (!c) return 'sem_efeito';
        const reserva = c.appointment;
        const podeReativar = reserva.status === 'aguardando_pagamento'
          || (reserva.status === 'cancelado' && c.situacao === 'expirada');
        if (c.situacao === 'paga' || !podeReativar) return 'sem_efeito';

        const { count } = await tx.cobrancaSinal.updateMany({
          where: { id: cobrancaId, situacao: { not: 'paga' } }, data: dadosDePaga(pagamento),
        });
        if (count !== 1) return 'sem_efeito';

        const hora = reserva.time.toISOString().slice(11, 19);
        const ocupado = await appointmentsPrismaRepository.hasConflict(
          reserva.businessId, professionalId, dia, hora, reserva.id, tx,
        );
        if (ocupado) return 'ocupado';

        const mudou = await tx.appointment.updateMany({
          where: { id: reserva.id, status: reserva.status }, data: { status: 'confirmado', expiresAt: null },
        });
        if (mudou.count !== 1) throw new DesfazerTransacao();
        return 'reativada';
      });
    } catch (e) {
      if (e instanceof DesfazerTransacao || ehRepeticao(e)) return 'sem_efeito';
      throw e;
    }
  },

  /** Grava o pagamento sem mexer na reserva. true só para quem fez a troca: a repetição não alerta de novo. */
  async marcarPaga(cobrancaId: string, pagamento: PagamentoGateway): Promise<boolean> {
    try {
      const { count } = await prisma.cobrancaSinal.updateMany({
        where: { id: cobrancaId, situacao: { not: 'paga' } }, data: dadosDePaga(pagamento),
      });
      return count === 1;
    } catch (e) {
      if (ehRepeticao(e)) return false;
      throw e;
    }
  },

  /**
   * Segundo pagamento aprovado de uma cobrança já paga, como o mesmo link de cartão pago duas vezes.
   * Ganha linha própria na reserva: o índice único garante que seja registrado, e alertado, uma vez só.
   */
  async registrarPagamentoRepetido(
    c: { businessId: string; appointmentId: string; gateway: string; forma: string; valor: unknown },
    pagamento: PagamentoGateway,
  ): Promise<boolean> {
    try {
      await prisma.cobrancaSinal.create({
        data: {
          businessId: c.businessId, appointmentId: c.appointmentId, gateway: c.gateway, forma: c.forma,
          valor: String(c.valor), ...dadosDePaga(pagamento),
        },
      });
      return true;
    } catch (e) {
      if (ehRepeticao(e)) return false;
      throw e;
    }
  },

  /** Só sai de `pendente`: `expirada` é a marca do vencimento, e a recusa não pode apagá-la. */
  async marcarRecusada(cobrancaId: string): Promise<void> {
    await prisma.cobrancaSinal.updateMany({ where: { id: cobrancaId, situacao: 'pendente' }, data: { situacao: 'recusada' } });
  },

  /** Muda só a linha que guarda este pagamento. true para quem fez a troca. */
  async marcarEstorno(
    c: { businessId: string; gateway: string },
    pagamento: PagamentoGateway,
    situacao: 'devolvida' | 'contestada',
  ): Promise<boolean> {
    const { count } = await prisma.cobrancaSinal.updateMany({
      where: { businessId: c.businessId, gateway: c.gateway, pagamentoExternoId: pagamento.id, situacao: 'paga' },
      data: { situacao },
    });
    return count === 1;
  },

  /**
   * Cancela a reserva vencida e marca as cobranças pendentes como `expirada`, juntas. Se a reserva
   * saiu de `aguardando_pagamento` depois da leitura da rotina, nada fica: `expirada` com reserva
   * cancelada significa vencimento, e é o que autoriza reativar. A cobrança vem antes da reserva,
   * na mesma ordem da confirmação, para as duas transações nunca travarem uma à outra.
   */
  async expirarReserva(appointmentId: string, agora: Date): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.cobrancaSinal.updateMany({ where: { appointmentId, situacao: 'pendente' }, data: { situacao: 'expirada' } });
        const { count } = await tx.appointment.updateMany({
          where: { id: appointmentId, status: 'aguardando_pagamento', expiresAt: { lt: agora } },
          data: { status: 'cancelado' },
        });
        if (count !== 1) throw new DesfazerTransacao();
      });
      return true;
    } catch (e) {
      if (e instanceof DesfazerTransacao) return false;
      throw e;
    }
  },

  /** Cancelar não devolve nada sozinho: quem administra recebe o lembrete, se havia sinal pago. */
  async lembrarDevolucaoAoCancelar(businessId: string, appointmentId: string): Promise<void> {
    const pagas = await prisma.cobrancaSinal.findMany({
      where: { businessId, appointmentId, situacao: 'paga' },
      select: { valor: true, appointment: { select: { client: { select: { name: true } } } } },
    });
    const [primeira] = pagas;
    if (!primeira) return;
    const total = pagas.reduce((soma, c) => soma + centavos(c.valor), 0) / 100;
    await notificationsService.notify(businessId, {
      type: 'recebimento_alerta',
      title: 'Reserva cancelada com sinal pago',
      description: `${primeira.appointment.client.name} pagou ${reais(total)} de sinal. Se for o caso, devolva o valor no Mercado Pago.`,
    });
  },
};
