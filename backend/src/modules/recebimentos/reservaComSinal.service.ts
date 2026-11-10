import { ConflictError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { buildPixPayload } from '../../utils/pixPayload.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { publicBookingRepository } from '../publicBooking/publicBooking.repository.js';
import { automacoesGatilhos } from '../whatsappAutomacoes/gatilhos.service.js';
import { cobrancasService } from './cobrancas.service.js';
import { conexaoService } from './conexao.service.js';
import { calcDeposit } from './reservaComSinal.rules.js';
import type { FormaSinal } from './recebimentos.types.js';

// Cria a reserva aguardando o sinal e a cobrança dele. Compartilhado pela página pública e pelo robô.

export interface EntradaReservaComSinal {
  business: { id: string; name: string; slug: string | null; pixKey: string; pixKeyType: string };
  clientId: string; professionalId: string; serviceId: string;
  serviceName: string; servicePrice: number; depositPercentage: number;
  date: string; time: string; // 'YYYY-MM-DD', 'HH:mm'
  origem: 'publico' | 'whatsapp';
  formaPedida?: FormaSinal; // ausente = primeira forma liberada do negócio
}

export interface ReservaComSinal {
  appointment: Awaited<ReturnType<typeof publicBookingRepository.createPendingAppointment>>;
  depositAmount: number; pixPayload: string | null; checkoutUrl: string | null;
  forma: FormaSinal; automatica: boolean; cartaoIndisponivel: boolean;
  toleranciaMin: number; expiresAt: Date;
}

/**
 * Forma de pagamento que vale para o pedido. Sem forma pedida, a primeira liberada (o negócio pode
 * receber só no cartão). Cartão pedido com a conexão fora do ar cai no Pix manual e avisa;
 * cartão que o negócio nunca liberou é pedido inválido.
 */
const resolverForma = async (businessId: string, pedida: FormaSinal | undefined) => {
  const formas = await conexaoService.formas(businessId);
  const formaEscolhida: FormaSinal = pedida ?? formas[0] ?? 'pix';
  const cartaoForaDoAr = formaEscolhida === 'cartao' && !formas.includes('cartao')
    && await conexaoService.cartaoForaDoAr(businessId);
  if (formaEscolhida === 'cartao' && !formas.includes('cartao') && !cartaoForaDoAr) {
    throw new ValidationError('Este negócio não recebe o sinal no cartão');
  }
  const formaPedida: FormaSinal = cartaoForaDoAr ? 'pix' : formaEscolhida;
  return { formas, formaPedida, cartaoForaDoAr };
};

export const reservaComSinalService = {
  /** Só valida a forma pedida (lança se o negócio não recebe no cartão), sem criar nada. */
  async validarForma(businessId: string, pedida: FormaSinal | undefined): Promise<void> {
    await resolverForma(businessId, pedida);
  },

  async criar(e: EntradaReservaComSinal): Promise<ReservaComSinal> {
    const { business } = e;
    const { formas, formaPedida, cartaoForaDoAr } = await resolverForma(business.id, e.formaPedida);

    // Calcula o depósito e monta o payload Pix ANTES de criar a reserva: buildPixPayload
    // pode lançar (ex.: amount <= 0), e não queremos uma reserva "fantasma" em
    // aguardando_pagamento (segurando o horário) se o payload falhar.
    const depositAmount = calcDeposit(e.servicePrice, e.depositPercentage);
    const pixManualPayload = buildPixPayload({
      pixKey: business.pixKey,
      pixKeyType: business.pixKeyType as never,
      merchantName: business.name,
      merchantCity: 'BRASIL',
      amount: depositAmount,
      description: `Sinal - ${e.serviceName}`,
    });

    const toleranciaMin = await automacoesGatilhos.toleranciaSinal(business.id);
    const expiresAt = new Date(Date.now() + toleranciaMin * 60 * 1000);

    // Checagem de conflito + criação dentro de uma única transação com advisory lock
    // por profissional+dia: duas requisições simultâneas para o mesmo horário são
    // serializadas, e a segunda enxerga a reserva da primeira e recebe 409.
    const appointment = await publicBookingRepository.withProfessionalDayLock(
      e.professionalId, e.date, async (tx) => {
        const conflict = await appointmentsPrismaRepository.hasConflict(
          business.id, e.professionalId, e.date, `${e.time}:00`, undefined, tx,
        );
        if (conflict) throw new ConflictError('Este horário acabou de ser reservado por outra pessoa');

        return publicBookingRepository.createPendingAppointment({
          businessId: business.id,
          clientId: e.clientId,
          professionalId: e.professionalId,
          serviceId: e.serviceId,
          date: e.date,
          time: e.time,
          expiresAt,
          depositAmount,
          source: e.origem,
        }, tx);
      },
    );

    // Cobrança automática fora da transação (não segura a trava durante a chamada ao gateway).
    // Qualquer falha cai no Pix manual; o cartão que falha vira Pix manual e avisa.
    const usaGateway = !cartaoForaDoAr && (formaPedida === 'cartao' || formas.includes('pix'));
    const cobranca = usaGateway
      ? await cobrancasService.criar({
        businessId: business.id, slug: business.slug ?? '', appointmentId: appointment.id, forma: formaPedida,
        valor: depositAmount, descricao: `Sinal - ${e.serviceName}`, venceEm: expiresAt,
      })
      : null;
    const forma: FormaSinal = cobranca ? formaPedida : 'pix';
    const cartaoIndisponivel = cartaoForaDoAr || (formaPedida === 'cartao' && !cobranca);
    const pixPayload = forma === 'pix' ? (cobranca?.pixPayload ?? pixManualPayload) : null;
    const checkoutUrl = cobranca?.checkoutUrl ?? null;

    logger.info({ appointmentId: appointment.id, businessId: business.id, origem: e.origem }, 'Reserva com sinal criada, aguardando pagamento');

    return { appointment, depositAmount, pixPayload, checkoutUrl, forma, automatica: cobranca !== null, cartaoIndisponivel, toleranciaMin, expiresAt };
  },
};
