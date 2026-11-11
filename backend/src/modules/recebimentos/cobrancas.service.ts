import logger from '../../utils/logger.js';
import { conexaoService } from './conexao.service.js';
import { GatewayRecusou, GatewayTerminalOcupado, GatewayTokenInvalido } from './gateways/index.js';
import { infinitePay } from './gateways/infinitePay.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import { backendUrl } from './recebimentos.rules.js';
import type { FormaSinal, GatewayId } from './recebimentos.types.js';

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

/** E-mail de pagador sintético, único por cobrança, no domínio do site. */
export const emailDoPagador = (prefixo: string, cobrancaId: string): string => `${prefixo}-${cobrancaId}@${dominio()}`;

/** Depois de uma falha ao criar a cobrança: conta recusada alerta o dono; acesso revogado pede reconexão. Nunca lança. */
export async function avisarFalhaDoGateway(err: unknown, businessId: string, gateway: GatewayId, accessToken?: string): Promise<void> {
  // Maquininha ocupada não é problema da conta: quem chama avisa a pessoa, sem alertar o dono.
  if (err instanceof GatewayTerminalOcupado) return;
  try {
    if (err instanceof GatewayRecusou) await conexaoService.alertarRecusa(businessId);
    else if (err instanceof GatewayTokenInvalido && await conexaoService.acessoRevogado(businessId, gateway, accessToken)) {
      // Um 401 na criação não prova token vencido: só a conta do gateway prova.
      await conexaoService.marcarReconectar(businessId, err.message);
    }
  } catch (e2) {
    logger.warn({ err: e2, businessId }, 'Recebimentos: falha ao avisar sobre a cobrança');
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
    let gatewayDaCobranca: GatewayId = 'mercadopago';
    try {
      const ip = await conexaoService.credencial(e.businessId);
      if (ip) {
        // A InfinitePay só tem o link (Pix ou cartão na página dela): Pix pedido aqui é o manual.
        if (e.forma === 'pix') return null;
        gatewayDaCobranca = 'infinitepay';
        cobrancaId = (await repo.criarCobranca({
          businessId: e.businessId, appointmentId: e.appointmentId, gateway: 'infinitepay',
          forma: 'cartao', valor: e.valor, venceEm: e.venceEm,
        })).id;
        const c = { cobrancaId, valor: e.valor, descricao: e.descricao, venceEm: e.venceEm, pagadorEmail: emailDoPagador('reserva', cobrancaId) };
        const r = await infinitePay.criarLink(ip.cred, c, {
          volta: `${frontend()}/agendar/${e.slug}?reserva=${e.appointmentId}&retorno=infinitepay`,
          webhook: `${backendUrl()}/api/v1/recebimentos/webhook/infinitepay/${cobrancaId}`,
        });
        // O link não tem id próprio: a referência (o id da cobrança) é o que o webhook devolve.
        await repo.completarCobranca(cobrancaId, { idExterno: cobrancaId, checkoutUrl: r.checkoutUrl });
        return { forma: 'cartao', pixPayload: null, checkoutUrl: r.checkoutUrl };
      }

      conexao = await conexaoService.tokenAtivo(e.businessId);
      if (!conexao) return null;

      cobrancaId = (await repo.criarCobranca({
        businessId: e.businessId, appointmentId: e.appointmentId, gateway: conexao.gateway,
        forma: e.forma, valor: e.valor, venceEm: e.venceEm,
      })).id;

      const gateway = gatewayDe(conexao.gateway);
      const c = { cobrancaId, valor: e.valor, descricao: e.descricao, venceEm: e.venceEm, pagadorEmail: emailDoPagador('reserva', cobrancaId) };

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
      await avisarFalhaDoGateway(err, e.businessId, gatewayDaCobranca, conexao?.accessToken);
      return null;
    }
  },
};
