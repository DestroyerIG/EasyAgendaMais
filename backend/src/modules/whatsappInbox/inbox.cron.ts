import logger from '../../utils/logger.js';
import { inboxRepository as repo } from './inbox.repository.js';
import { DIAS_RETENCAO, HORAS_FINALIZAR_ROBO, HORAS_VOLTA_ROBO } from './inbox.types.js';

const HORA = 3_600_000;

export const inboxCron = {
  /** Conversa com atendimento humano sem mensagem há 12 h volta para o robô e é finalizada. */
  async voltarAoRoboPorInatividade(agora: Date = new Date()): Promise<number> {
    try {
      const paradas = await repo.conversasHumanasParadas(new Date(agora.getTime() - HORAS_VOLTA_ROBO * HORA));
      for (const c of paradas) {
        await repo.atualizarConversa(c.id, { handler: 'bot', status: 'finalizada', assignedUserId: null });
        await repo.inserirMensagem({
          businessId: c.businessId, conversationId: c.id, phoneKey: c.phoneKey, direction: 'out',
          origin: 'painel_evento', body: 'Voltou ao robô por inatividade', mediaType: null,
          providerMessageId: null, status: 'enviada', sentByUserId: null,
        });
      }
      return paradas.length;
    } catch (err) {
      logger.warn({ err }, 'inboxCron: voltarAoRoboPorInatividade falhou');
      return 0;
    }
  },

  /** Conversa do robô sem mensagem há 24 h é finalizada. */
  async finalizarConversasDoRobo(agora: Date = new Date()): Promise<number> {
    try {
      return await repo.finalizarConversasDoRobo(new Date(agora.getTime() - HORAS_FINALIZAR_ROBO * HORA));
    } catch (err) {
      logger.warn({ err }, 'inboxCron: finalizarConversasDoRobo falhou');
      return 0;
    }
  },

  /** Apaga mensagens com mais de 180 dias e as conversas que ficaram vazias. */
  async limparAntigas(agora: Date = new Date()): Promise<{ mensagens: number; conversas: number }> {
    try {
      const limite = new Date(agora.getTime() - DIAS_RETENCAO * 24 * HORA);
      const mensagens = await repo.apagarMensagensAntigas(limite);
      const conversas = await repo.apagarConversasVazias(limite);
      return { mensagens, conversas };
    } catch (err) {
      logger.warn({ err }, 'inboxCron: limparAntigas falhou');
      return { mensagens: 0, conversas: 0 };
    }
  },
};
