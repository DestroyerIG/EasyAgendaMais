import { AppError, ConflictError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { comandasService } from '../comandas/comandas.service.js';
import type { ComandaDetailDto, PaymentMethod, SaveComandaInput } from '../comandas/comandas.types.js';
import { avisarFalhaDoGateway, emailDoPagador, urlDoSite } from './cobrancas.service.js';
import { conexaoService } from './conexao.service.js';
import { GatewayCheckoutDesligado, GatewayTerminalOcupado } from './gateways/index.js';
import { gatewayDe } from './gateways/porId.js';
import { infinitePay } from './gateways/infinitePay.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import { backendUrl, nomeDoTerminal } from './recebimentos.rules.js';
import type { GatewayId, SituacaoCobranca } from './recebimentos.types.js';

// Cobrança do saldo da comanda no balcão. A comanda só é alterada pela cobrança enquanto ela está pendente
// (ver `comandasService.save`); o pagamento confirmado fecha a comanda em `pagamentos.service`.

const PRAZO_MS = 15 * 60 * 1000;
/** O link é pago no celular do cliente, sem pressa de balcão: prazo maior. */
const PRAZO_LINK_MS = 60 * 60 * 1000;

/**
 * Como cobrar: Pix do Mercado Pago, débito/crédito na maquininha Point, ou link da InfinitePay (o cliente
 * escolhe Pix ou cartão na página; `forma` é a que o dono marcou na comanda, que vale se o pagamento não disser).
 */
export type ComoCobrar =
  | { via: 'pix' }
  | { via: 'maquininha'; forma: 'debito' | 'credito' }
  | { via: 'link'; forma: 'pix' | 'debito' | 'credito' };

export interface CobrancaSaldoDto {
  id: string;
  via: 'pix' | 'maquininha' | 'link';
  situacao: SituacaoCobranca;
  valor: number;
  codigoPix: string | null;
  /** Endereço do link de pagamento (só na via `link`). */
  checkoutUrl: string | null;
  venceEm: string | null;
  pagoEm: string | null;
}

export interface EstadoCobranca {
  /** Gateway que cobra o saldo agora; null quando não há conexão utilizável (a tela cai no Pix manual). */
  gateway: 'mercadopago' | 'infinitepay' | null;
  cobranca: CobrancaSaldoDto | null;
  /** Maquininha Point escolhida em Recebimentos (só com o Mercado Pago ativo). */
  terminal: { id: string; nome: string } | null;
  /** A ordem já estava na maquininha e não pôde ser cancelada por aqui: cancelar lá também. */
  avisoMaquininha: boolean;
}

type Linha = NonNullable<Awaited<ReturnType<typeof repo.ultimaCobrancaSaldo>>>;
type Entrada = Omit<SaveComandaInput, 'paymentMethod'>;

const SEM_MERCADO_PAGO = 'Conecte o Mercado Pago em Recebimentos para cobrar automaticamente.';
const SEM_INFINITEPAY = 'Conecte a InfinitePay em Recebimentos para enviar o link de pagamento.';

const viaDa = (forma: string): CobrancaSaldoDto['via'] => (forma === 'point' ? 'maquininha' : forma === 'link' ? 'link' : 'pix');

function paraDto(l: Linha, agora: Date = new Date()): CobrancaSaldoDto {
  // Pendente que passou do prazo já vale como expirada para a tela, antes de a rotina marcar.
  const vencida = l.situacao === 'pendente' && l.venceEm !== null && l.venceEm.getTime() <= agora.getTime();
  return {
    id: l.id, via: viaDa(l.forma), situacao: (vencida ? 'expirada' : l.situacao) as SituacaoCobranca,
    valor: Number(l.valor), codigoPix: l.codigoPix, checkoutUrl: l.checkoutUrl ?? null,
    venceEm: l.venceEm?.toISOString() ?? null, pagoEm: l.pagoEm?.toISOString() ?? null,
  };
}

async function estado(comandaId: string, businessId: string, avisoMaquininha = false): Promise<EstadoCobranca> {
  const dto = await comandasService.get(comandaId, businessId);
  const [token, ultima] = await Promise.all([
    conexaoService.tokenAtivo(businessId), repo.ultimaCobrancaSaldo(dto.appointment.id),
  ]);
  const mercadoPago = token?.gateway === 'mercadopago';
  const gateway = mercadoPago ? 'mercadopago' : (await conexaoService.gatewayAtivo(businessId)) === 'infinitepay' ? 'infinitepay' : null;
  const terminalId = mercadoPago ? await repo.terminalPadrao(businessId) : null;
  return {
    gateway,
    cobranca: ultima ? paraDto(ultima) : null,
    terminal: terminalId ? { id: terminalId, nome: nomeDoTerminal(terminalId) } : null,
    avisoMaquininha,
  };
}

/** Grava o rascunho, calcula o saldo no servidor e abre a linha `pendente` (que dá o id usado como referência). */
async function abrirCobranca(a: {
  comandaId: string; businessId: string; userId: string; input: Entrada; antes: ComandaDetailDto; paymentMethod: PaymentMethod;
  gateway: GatewayId; forma?: 'point' | 'link'; terminalId?: string; prazoMs: number;
}) {
  // A cobrança anterior em aberto sai de cena antes: com ela pendente, a comanda não aceita gravar.
  await repo.substituirSaldoPendente(a.antes.appointment.id);
  const dto = await comandasService.save(a.comandaId, a.businessId, { ...a.input, paymentMethod: a.paymentMethod });
  const valor = dto.calc.totalCharged;
  if (valor <= 0) throw new ConflictError('Não há saldo a cobrar nesta comanda');
  const venceEm = new Date(Date.now() + a.prazoMs);
  const { id } = await repo.criarCobrancaSaldo({
    businessId: a.businessId, appointmentId: dto.appointment.id, usuarioId: a.userId, gateway: a.gateway, valor, venceEm,
    ...(a.forma ? { forma: a.forma } : {}), ...(a.terminalId ? { terminalId: a.terminalId } : {}),
  });
  return {
    id, valor, venceEm,
    nova: { cobrancaId: id, valor, descricao: `Comanda ${dto.number}`, venceEm, pagadorEmail: emailDoPagador('comanda', id) },
  };
}

/** Falha ao criar no gateway: a linha sai, o dono é avisado quando for problema da conta, e o erro que a tela mostra é devolvido. */
async function falhar(err: unknown, a: { id: string; businessId: string; comandaId: string; gateway: GatewayId; accessToken?: string }, mensagem: string): Promise<never> {
  logger.warn({ err, businessId: a.businessId, comandaId: a.comandaId }, 'Recebimentos: falha ao criar a cobrança do saldo');
  try {
    await repo.apagarCobranca(a.id);
  } catch (e2) {
    logger.warn({ err: e2, cobrancaId: a.id }, 'Recebimentos: falha ao apagar a cobrança do saldo');
  }
  await avisarFalhaDoGateway(err, a.businessId, a.gateway, a.accessToken);
  if (err instanceof GatewayTerminalOcupado) {
    throw new AppError('Esta maquininha já tem uma cobrança aguardando. Termine ou cancele nela e tente de novo.', 409, 'MAQUININHA_OCUPADA');
  }
  if (err instanceof GatewayCheckoutDesligado) {
    throw new AppError('O link de pagamento não está liberado na sua conta InfinitePay. Peça a liberação à InfinitePay.', 409, 'LINK_DESLIGADO');
  }
  throw new AppError(mensagem, 502, 'GATEWAY_INDISPONIVEL');
}

export const cobrancaSaldoService = {
  estado: (comandaId: string, businessId: string) => estado(comandaId, businessId),

  /** Cria a cobrança no gateway do negócio. Falha do gateway apaga a linha. */
  async criar(comandaId: string, businessId: string, userId: string, input: Entrada, como: ComoCobrar): Promise<CobrancaSaldoDto> {
    const antes = await comandasService.get(comandaId, businessId);
    if (antes.status === 'fechada') throw new ConflictError('Esta comanda já foi fechada');
    const base = { comandaId, businessId, userId, input, antes };

    // ─── Link da InfinitePay ─────────────────────────────────────────────────────
    if (como.via === 'link') {
      const ip = await conexaoService.credencial(businessId);
      if (!ip) throw new AppError(SEM_INFINITEPAY, 409, 'SEM_GATEWAY');
      const { id, valor, venceEm, nova } = await abrirCobranca({
        ...base, paymentMethod: como.forma, gateway: 'infinitepay', forma: 'link', prazoMs: PRAZO_LINK_MS,
      });
      try {
        const r = await infinitePay.criarLink(ip.cred, nova, {
          volta: `${urlDoSite()}/pagamento-recebido`,
          webhook: `${backendUrl()}/api/v1/recebimentos/webhook/infinitepay/${id}`,
        });
        // O link não tem id próprio: a referência (o id da cobrança) é o que o webhook devolve.
        await repo.completarCobranca(id, { idExterno: id, checkoutUrl: r.checkoutUrl });
        return { id, via: 'link', situacao: 'pendente', valor, codigoPix: null, checkoutUrl: r.checkoutUrl, venceEm: venceEm.toISOString(), pagoEm: null };
      } catch (err) {
        return falhar(err, { id, businessId, comandaId, gateway: 'infinitepay' }, 'Não foi possível gerar o link de pagamento agora. Tente de novo.');
      }
    }

    // ─── Mercado Pago: Pix ou maquininha Point ────────────────────────────────────
    const token = await conexaoService.tokenAtivo(businessId);
    if (!token || token.gateway !== 'mercadopago') throw new AppError(SEM_MERCADO_PAGO, 409, 'SEM_GATEWAY');
    const terminalId = como.via === 'maquininha' ? await repo.terminalPadrao(businessId) : null;
    if (como.via === 'maquininha' && !terminalId) {
      throw new AppError('Escolha a maquininha em Recebimentos para cobrar no cartão.', 409, 'SEM_MAQUININHA');
    }
    const { id, valor, venceEm, nova } = await abrirCobranca({
      ...base, paymentMethod: como.via === 'maquininha' ? como.forma : 'pix', gateway: 'mercadopago', prazoMs: PRAZO_MS,
      ...(como.via === 'maquininha' && terminalId ? { forma: 'point' as const, terminalId } : {}),
    });
    const contexto = { id, businessId, comandaId, gateway: 'mercadopago' as const, accessToken: token.accessToken };
    try {
      const gateway = gatewayDe('mercadopago');
      if (como.via === 'maquininha' && terminalId) {
        const r = await gateway.criarOrdemPoint(token.accessToken, nova, {
          terminalId, tipo: como.forma === 'debito' ? 'debit_card' : 'credit_card',
        });
        await repo.completarCobranca(id, { idExterno: r.idExterno });
        return { id, via: 'maquininha', situacao: 'pendente', valor, codigoPix: null, checkoutUrl: null, venceEm: venceEm.toISOString(), pagoEm: null };
      }
      const r = await gateway.criarPix(token.accessToken, nova);
      await repo.completarCobranca(id, { idExterno: r.idExterno, codigoPix: r.codigoPix });
      return { id, via: 'pix', situacao: 'pendente', valor, codigoPix: r.codigoPix, checkoutUrl: null, venceEm: venceEm.toISOString(), pagoEm: null };
    } catch (err) {
      return falhar(
        err, contexto,
        como.via === 'maquininha' ? 'Não foi possível enviar a cobrança para a maquininha agora. Tente de novo.' : 'Não foi possível gerar o Pix agora. Tente de novo.',
      );
    }
  },

  /**
   * Cancela a cobrança pendente e destrava a comanda. O Pix só deixa de valer no prazo dele; a ordem da
   * maquininha é cancelada no gateway quando o modelo permite, e senão o aviso pede para cancelar lá também.
   * O link da InfinitePay não tem cancelamento: fica cancelada aqui e um pagamento tardio ainda quita ou alerta.
   */
  async cancelar(comandaId: string, businessId: string): Promise<EstadoCobranca> {
    const dto = await comandasService.get(comandaId, businessId);
    const ultima = await repo.ultimaCobrancaSaldo(dto.appointment.id);
    let avisoMaquininha = false;
    if (ultima && ultima.situacao === 'pendente' && ultima.forma === 'point' && ultima.idExterno) {
      const token = await conexaoService.tokenAtivo(businessId);
      if (token?.gateway === 'mercadopago') {
        try {
          avisoMaquininha = (await gatewayDe('mercadopago').cancelarOrdem(token.accessToken, ultima.idExterno, ultima.id)) === 'pedir_no_terminal';
        } catch (err) {
          logger.warn({ err, businessId, comandaId }, 'Recebimentos: falha ao cancelar a ordem da maquininha');
          avisoMaquininha = true;
        }
      } else {
        avisoMaquininha = true;
      }
    }
    await repo.cancelarSaldoPendente(dto.appointment.id);
    return estado(comandaId, businessId, avisoMaquininha);
  },
};
