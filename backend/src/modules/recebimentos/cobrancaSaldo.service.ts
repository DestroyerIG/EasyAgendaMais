import { AppError, ConflictError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { comandasService } from '../comandas/comandas.service.js';
import type { SaveComandaInput } from '../comandas/comandas.types.js';
import { avisarFalhaDoGateway, emailDoPagador } from './cobrancas.service.js';
import { conexaoService } from './conexao.service.js';
import { GatewayTerminalOcupado } from './gateways/index.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import { nomeDoTerminal } from './recebimentos.rules.js';
import type { SituacaoCobranca } from './recebimentos.types.js';

// Cobrança do saldo da comanda no balcão. A comanda só é alterada pela cobrança enquanto ela está pendente
// (ver `comandasService.save`); o pagamento confirmado fecha a comanda em `pagamentos.service`.

const PRAZO_MS = 15 * 60 * 1000;

/** Como cobrar: Pix do gateway, ou débito/crédito na maquininha Point escolhida em Recebimentos. */
export type ComoCobrar = { via: 'pix' } | { via: 'maquininha'; forma: 'debito' | 'credito' };

export interface CobrancaSaldoDto {
  id: string;
  via: 'pix' | 'maquininha';
  situacao: SituacaoCobranca;
  valor: number;
  codigoPix: string | null;
  venceEm: string | null;
  pagoEm: string | null;
}

export interface EstadoCobranca {
  /** Gateway que cobra o saldo agora; null quando não há conexão utilizável (a tela cai no Pix manual). */
  gateway: 'mercadopago' | null;
  cobranca: CobrancaSaldoDto | null;
  /** Maquininha Point escolhida em Recebimentos (só com o Mercado Pago ativo). */
  terminal: { id: string; nome: string } | null;
  /** A ordem já estava na maquininha e não pôde ser cancelada por aqui: cancelar lá também. */
  avisoMaquininha: boolean;
}

type Linha = NonNullable<Awaited<ReturnType<typeof repo.ultimaCobrancaSaldo>>>;

function paraDto(l: Linha, agora: Date = new Date()): CobrancaSaldoDto {
  // Pendente que passou do prazo já vale como expirada para a tela, antes de a rotina marcar.
  const vencida = l.situacao === 'pendente' && l.venceEm !== null && l.venceEm.getTime() <= agora.getTime();
  return {
    id: l.id, via: l.forma === 'point' ? 'maquininha' : 'pix', situacao: (vencida ? 'expirada' : l.situacao) as SituacaoCobranca,
    valor: Number(l.valor), codigoPix: l.codigoPix, venceEm: l.venceEm?.toISOString() ?? null, pagoEm: l.pagoEm?.toISOString() ?? null,
  };
}

async function estado(comandaId: string, businessId: string, avisoMaquininha = false): Promise<EstadoCobranca> {
  const dto = await comandasService.get(comandaId, businessId);
  const [token, ultima] = await Promise.all([
    conexaoService.tokenAtivo(businessId), repo.ultimaCobrancaSaldo(dto.appointment.id),
  ]);
  const mercadoPago = token?.gateway === 'mercadopago';
  const terminalId = mercadoPago ? await repo.terminalPadrao(businessId) : null;
  return {
    gateway: mercadoPago ? 'mercadopago' : null,
    cobranca: ultima ? paraDto(ultima) : null,
    terminal: terminalId ? { id: terminalId, nome: nomeDoTerminal(terminalId) } : null,
    avisoMaquininha,
  };
}

export const cobrancaSaldoService = {
  estado: (comandaId: string, businessId: string) => estado(comandaId, businessId),

  /** Grava o rascunho, calcula o saldo no servidor e cria a cobrança no gateway. Falha do gateway apaga a linha. */
  async criar(
    comandaId: string, businessId: string, userId: string, input: Omit<SaveComandaInput, 'paymentMethod'>, como: ComoCobrar,
  ): Promise<CobrancaSaldoDto> {
    const antes = await comandasService.get(comandaId, businessId);
    if (antes.status === 'fechada') throw new ConflictError('Esta comanda já foi fechada');
    const token = await conexaoService.tokenAtivo(businessId);
    if (!token || token.gateway !== 'mercadopago') {
      throw new AppError('Conecte o Mercado Pago em Recebimentos para cobrar automaticamente.', 409, 'SEM_GATEWAY');
    }
    const terminalId = como.via === 'maquininha' ? await repo.terminalPadrao(businessId) : null;
    if (como.via === 'maquininha' && !terminalId) {
      throw new AppError('Escolha a maquininha em Recebimentos para cobrar no cartão.', 409, 'SEM_MAQUININHA');
    }
    // A cobrança anterior em aberto sai de cena antes: com ela pendente, a comanda não aceita gravar.
    await repo.substituirSaldoPendente(antes.appointment.id);
    const dto = await comandasService.save(comandaId, businessId, {
      ...input, paymentMethod: como.via === 'maquininha' ? como.forma : 'pix',
    });
    const valor = dto.calc.totalCharged;
    if (valor <= 0) throw new ConflictError('Não há saldo a cobrar nesta comanda');

    const venceEm = new Date(Date.now() + PRAZO_MS);
    const { id } = await repo.criarCobrancaSaldo({
      businessId, appointmentId: dto.appointment.id, usuarioId: userId, gateway: 'mercadopago', valor, venceEm,
      ...(como.via === 'maquininha' && terminalId ? { forma: 'point' as const, terminalId } : {}),
    });
    const nova = { cobrancaId: id, valor, descricao: `Comanda ${dto.number}`, venceEm, pagadorEmail: emailDoPagador('comanda', id) };
    try {
      const gateway = gatewayDe('mercadopago');
      if (como.via === 'maquininha' && terminalId) {
        const r = await gateway.criarOrdemPoint(token.accessToken, nova, {
          terminalId, tipo: como.forma === 'debito' ? 'debit_card' : 'credit_card',
        });
        await repo.completarCobranca(id, { idExterno: r.idExterno });
        return { id, via: 'maquininha', situacao: 'pendente', valor, codigoPix: null, venceEm: venceEm.toISOString(), pagoEm: null };
      }
      const r = await gateway.criarPix(token.accessToken, nova);
      await repo.completarCobranca(id, { idExterno: r.idExterno, codigoPix: r.codigoPix });
      return { id, via: 'pix', situacao: 'pendente', valor, codigoPix: r.codigoPix, venceEm: venceEm.toISOString(), pagoEm: null };
    } catch (err) {
      logger.warn({ err, businessId, comandaId }, 'Recebimentos: falha ao criar a cobrança do saldo');
      try {
        await repo.apagarCobranca(id);
      } catch (e2) {
        logger.warn({ err: e2, cobrancaId: id }, 'Recebimentos: falha ao apagar a cobrança do saldo');
      }
      await avisarFalhaDoGateway(err, businessId, 'mercadopago', token.accessToken);
      if (err instanceof GatewayTerminalOcupado) {
        throw new AppError('Esta maquininha já tem uma cobrança aguardando. Termine ou cancele nela e tente de novo.', 409, 'MAQUININHA_OCUPADA');
      }
      throw new AppError(
        como.via === 'maquininha' ? 'Não foi possível enviar a cobrança para a maquininha agora. Tente de novo.' : 'Não foi possível gerar o Pix agora. Tente de novo.',
        502, 'GATEWAY_INDISPONIVEL',
      );
    }
  },

  /**
   * Cancela a cobrança pendente e destrava a comanda. O Pix só deixa de valer no prazo dele; a ordem da
   * maquininha é cancelada no gateway quando o modelo permite, e senão o aviso pede para cancelar lá também.
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
