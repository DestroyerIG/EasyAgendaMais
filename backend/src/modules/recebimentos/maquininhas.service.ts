import { AppError, NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { avisarFalhaDoGateway } from './cobrancas.service.js';
import { conexaoService } from './conexao.service.js';
import { GatewayRecusou, type Terminal } from './gateways/index.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import { nomeDoTerminal } from './recebimentos.rules.js';
import type { UsuarioLogado } from './recebimentos.types.js';

// Maquininhas Point da conta do Mercado Pago do negócio: listar, ativar o modo PDV e escolher a que
// cobra o débito e o crédito da comanda. Só a dona mexe (as rotas já filtram o papel).

export interface MaquininhaDto { id: string; nome: string; modo: Terminal['modo'] }
export interface MaquininhasDto { padrao: string | null; terminais: MaquininhaDto[] }

const SEM_GATEWAY = 'Conecte o Mercado Pago para usar a maquininha Point.';
const PASSO_A_PASSO =
  'Não foi possível ativar o modo PDV. Associe a maquininha a uma loja e a um caixa no app do Mercado Pago, depois tente de novo.';

async function mercadoPago(businessId: string): Promise<string> {
  const token = await conexaoService.tokenAtivo(businessId);
  if (!token || token.gateway !== 'mercadopago') throw new AppError(SEM_GATEWAY, 409, 'SEM_GATEWAY');
  return token.accessToken;
}

/** Terminais da conta. Falha do gateway vira 502 sem detalhes; acesso revogado pede a reconexão. */
async function terminaisDaConta(businessId: string, accessToken: string): Promise<Terminal[]> {
  try {
    return await gatewayDe('mercadopago').listarTerminais(accessToken);
  } catch (err) {
    logger.warn({ err, businessId }, 'Recebimentos: falha ao listar as maquininhas');
    await avisarFalhaDoGateway(err, businessId, 'mercadopago', accessToken);
    throw new AppError('Não foi possível consultar as maquininhas agora. Tente de novo.', 502, 'GATEWAY_INDISPONIVEL');
  }
}

async function listar(user: UsuarioLogado): Promise<MaquininhasDto> {
  const accessToken = await mercadoPago(user.businessId);
  const [terminais, padrao] = await Promise.all([terminaisDaConta(user.businessId, accessToken), repo.terminalPadrao(user.businessId)]);
  return { padrao, terminais: terminais.map((t) => ({ id: t.id, nome: nomeDoTerminal(t.id), modo: t.modo })) };
}

export const maquininhasService = {
  listar,

  /** Manda o terminal para o modo PDV (o único em que recebe cobranças do sistema) e devolve a lista atualizada. */
  async ativarPdv(user: UsuarioLogado, terminalId: string): Promise<MaquininhasDto> {
    const accessToken = await mercadoPago(user.businessId);
    const terminais = await terminaisDaConta(user.businessId, accessToken);
    if (!terminais.some((t) => t.id === terminalId)) throw new NotFoundError('Maquininha');
    try {
      await gatewayDe('mercadopago').ativarPdv(accessToken, terminalId);
    } catch (err) {
      logger.warn({ err, businessId: user.businessId }, 'Recebimentos: falha ao ativar o modo PDV');
      if (err instanceof GatewayRecusou) throw new AppError(PASSO_A_PASSO, 409, 'PDV_INDISPONIVEL');
      await avisarFalhaDoGateway(err, user.businessId, 'mercadopago', accessToken);
      throw new AppError('Não foi possível falar com o Mercado Pago agora. Tente de novo.', 502, 'GATEWAY_INDISPONIVEL');
    }
    return listar(user);
  },

  /** Maquininha que cobra o débito e o crédito. Só aceita terminal da conta; `null` limpa a escolha. */
  async definirPadrao(user: UsuarioLogado, terminalId: string | null): Promise<MaquininhasDto> {
    if (terminalId !== null) {
      const accessToken = await mercadoPago(user.businessId);
      const terminais = await terminaisDaConta(user.businessId, accessToken);
      if (!terminais.some((t) => t.id === terminalId)) throw new NotFoundError('Maquininha');
    }
    await repo.definirTerminalPadrao(user.businessId, terminalId);
    return terminalId === null ? { padrao: null, terminais: [] } : listar(user);
  },
};
