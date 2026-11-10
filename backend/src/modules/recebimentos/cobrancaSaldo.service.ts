import { AppError, ConflictError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { comandasService } from '../comandas/comandas.service.js';
import type { SaveComandaInput } from '../comandas/comandas.types.js';
import { avisarFalhaDoGateway, emailDoPagador } from './cobrancas.service.js';
import { conexaoService } from './conexao.service.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import type { SituacaoCobranca } from './recebimentos.types.js';

// Cobrança do saldo da comanda no balcão. A comanda só é alterada pela cobrança enquanto ela está pendente
// (ver `comandasService.save`); o pagamento confirmado fecha a comanda em `pagamentos.service`.

const PRAZO_MS = 15 * 60 * 1000;

export interface CobrancaSaldoDto {
  id: string;
  via: 'pix';
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
}

type Linha = NonNullable<Awaited<ReturnType<typeof repo.ultimaCobrancaSaldo>>>;

function paraDto(l: Linha, agora: Date = new Date()): CobrancaSaldoDto {
  // Pendente que passou do prazo já vale como expirada para a tela, antes de a rotina marcar.
  const vencida = l.situacao === 'pendente' && l.venceEm !== null && l.venceEm.getTime() <= agora.getTime();
  return {
    id: l.id, via: 'pix', situacao: (vencida ? 'expirada' : l.situacao) as SituacaoCobranca, valor: Number(l.valor),
    codigoPix: l.codigoPix, venceEm: l.venceEm?.toISOString() ?? null, pagoEm: l.pagoEm?.toISOString() ?? null,
  };
}

export const cobrancaSaldoService = {
  async estado(comandaId: string, businessId: string): Promise<EstadoCobranca> {
    const dto = await comandasService.get(comandaId, businessId);
    const [token, ultima] = await Promise.all([
      conexaoService.tokenAtivo(businessId), repo.ultimaCobrancaSaldo(dto.appointment.id),
    ]);
    return { gateway: token?.gateway === 'mercadopago' ? 'mercadopago' : null, cobranca: ultima ? paraDto(ultima) : null };
  },

  /** Grava o rascunho, calcula o saldo no servidor e cria o Pix no gateway. Falha do gateway apaga a linha. */
  async criar(
    comandaId: string, businessId: string, userId: string, input: Omit<SaveComandaInput, 'paymentMethod'>,
  ): Promise<CobrancaSaldoDto> {
    const antes = await comandasService.get(comandaId, businessId);
    if (antes.status === 'fechada') throw new ConflictError('Esta comanda já foi fechada');
    const token = await conexaoService.tokenAtivo(businessId);
    if (!token || token.gateway !== 'mercadopago') {
      throw new AppError('Conecte o Mercado Pago em Recebimentos para cobrar o Pix automaticamente.', 409, 'SEM_GATEWAY');
    }
    // A cobrança anterior em aberto sai de cena antes: com ela pendente, a comanda não aceita gravar.
    await repo.substituirSaldoPendente(antes.appointment.id);
    const dto = await comandasService.save(comandaId, businessId, { ...input, paymentMethod: 'pix' });
    const valor = dto.calc.totalCharged;
    if (valor <= 0) throw new ConflictError('Não há saldo a cobrar nesta comanda');

    const venceEm = new Date(Date.now() + PRAZO_MS);
    const { id } = await repo.criarCobrancaSaldo({
      businessId, appointmentId: dto.appointment.id, usuarioId: userId, gateway: 'mercadopago', valor, venceEm,
    });
    try {
      const r = await gatewayDe('mercadopago').criarPix(token.accessToken, {
        cobrancaId: id, valor, descricao: `Comanda ${dto.number}`, venceEm, pagadorEmail: emailDoPagador('comanda', id),
      });
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
      throw new AppError('Não foi possível gerar o Pix agora. Tente de novo.', 502, 'GATEWAY_INDISPONIVEL');
    }
  },

  /** Cancela a cobrança pendente (o Pix do Mercado Pago só deixa de valer no prazo dele) e destrava a comanda. */
  async cancelar(comandaId: string, businessId: string): Promise<EstadoCobranca> {
    const dto = await comandasService.get(comandaId, businessId);
    await repo.cancelarSaldoPendente(dto.appointment.id);
    return cobrancaSaldoService.estado(comandaId, businessId);
  },
};
