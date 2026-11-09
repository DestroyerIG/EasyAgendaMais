import logger from '../../utils/logger.js';
import { conexaoService } from './conexao.service.js';
import { GatewayRecusou, GatewayTokenInvalido } from './gateways/index.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import type { FormaSinal } from './recebimentos.types.js';

// Cobrança do sinal de uma reserva pública no gateway do negócio.

const frontend = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Domínio do e-mail de pagador: o do site, sem `www.`; `localhost` se a URL não tiver domínio. */
function dominio(): string {
  try {
    return new URL(frontend()).hostname.replace(/^www\./, '') || 'localhost';
  } catch {
    return 'localhost';
  }
}

export interface EntradaCobranca {
  businessId: string;
  slug: string;
  appointmentId: string;
  forma: FormaSinal;
  valor: number;
  descricao: string;
  venceEm: Date;
}

export interface CobrancaCriada {
  forma: FormaSinal;
  pixPayload: string | null;
  checkoutUrl: string | null;
}

export const cobrancasService = {
  /**
   * Cria a cobrança no gateway. A linha nasce antes da chamada, para ter o id que vai como
   * referência; se o gateway falhar, a linha é apagada. Devolve `null` em qualquer falha: quem
   * chama cai no Pix manual. Nunca lança.
   */
  async criar(e: EntradaCobranca): Promise<CobrancaCriada | null> {
    let cobrancaId: string | null = null;
    let conexao: Awaited<ReturnType<typeof conexaoService.tokenAtivo>> = null;
    try {
      conexao = await conexaoService.tokenAtivo(e.businessId);
      if (!conexao) return null;

      cobrancaId = (await repo.criarCobranca({
        businessId: e.businessId, appointmentId: e.appointmentId, gateway: conexao.gateway,
        forma: e.forma, valor: e.valor, venceEm: e.venceEm,
      })).id;

      const gateway = gatewayDe(conexao.gateway);
      const c = { cobrancaId, valor: e.valor, descricao: e.descricao, venceEm: e.venceEm, pagadorEmail: `reserva-${cobrancaId}@${dominio()}` };

      if (e.forma === 'pix') {
        const r = await gateway.criarPix(conexao.accessToken, c);
        await repo.completarCobranca(cobrancaId, { idExterno: r.idExterno, codigoPix: r.codigoPix });
        return { forma: 'pix', pixPayload: r.codigoPix, checkoutUrl: null };
      }

      const volta = (retorno: string) => `${frontend()}/agendar/${e.slug}?reserva=${e.appointmentId}&retorno=${retorno}`;
      const r = await gateway.criarCheckoutCartao(conexao.accessToken, c, {
        sucesso: volta('sucesso'), pendente: volta('pendente'), falha: volta('falha'),
      });
      await repo.completarCobranca(cobrancaId, { idExterno: r.idExterno, checkoutUrl: r.checkoutUrl });
      return { forma: 'cartao', pixPayload: null, checkoutUrl: r.checkoutUrl };
    } catch (err) {
      logger.warn({ err, businessId: e.businessId, appointmentId: e.appointmentId, forma: e.forma }, 'Recebimentos: falha ao criar a cobrança');
      // A linha que sobrar (apagar falhou) não aparece na página: sem id externo, não há o que pagar.
      if (cobrancaId) {
        try {
          await repo.apagarCobranca(cobrancaId);
        } catch (e2) {
          logger.warn({ err: e2, cobrancaId }, 'Recebimentos: falha ao apagar a cobrança');
        }
      }
      try {
        if (err instanceof GatewayRecusou) await conexaoService.alertarRecusa(e.businessId);
        else if (err instanceof GatewayTokenInvalido && conexao && await conexaoService.acessoRevogado(e.businessId, conexao.gateway, conexao.accessToken)) {
          // Um 401 na criação não prova token vencido: só a conta do gateway prova.
          await conexaoService.marcarReconectar(e.businessId, err.message);
        }
      } catch (e2) {
        logger.warn({ err: e2, businessId: e.businessId }, 'Recebimentos: falha ao avisar sobre a cobrança');
      }
      return null;
    }
  },
};
