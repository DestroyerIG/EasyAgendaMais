import { prisma } from '../../config/prisma.js';
import type { GatewayId } from './recebimentos.types.js';

// Recebimentos (Mercado Pago): acesso ao banco da conexão do negócio.

export interface DadosConexao {
  businessId: string;
  gateway: GatewayId;
  contaExternaId: string;
  contaNome: string;
  accessTokenCifrado: string;
  refreshTokenCifrado: string;
  tokenExpiraEm: Date;
}

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
};
