/**
 * Sinal cobrado pelo robô: decide se o agendamento do chat vira pré-reserva com sinal, cria a reserva
 * (serviço compartilhado com a página pública), envia o Pix ou o link e responde enquanto a cliente paga.
 * Não importa whatsappFlowService (evita ciclo): o fluxo chama estas funções.
 */
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { reservaComSinalService, type ReservaComSinal } from '../../modules/recebimentos/reservaComSinal.service.js';
import { calcDeposit } from '../../modules/recebimentos/reservaComSinal.rules.js';
import { automacoesGatilhos } from '../../modules/whatsappAutomacoes/gatilhos.service.js';
import { recebimentosRepository } from '../../modules/recebimentos/recebimentos.repository.js';
import { googleAgendaService } from '../../modules/googleAgenda/googleAgenda.service.js';
import { sendWhatsAppMessage, formatMessage, type SendWhatsAppMessageContext } from './whatsappMessageService.js';
import { updateSession } from './whatsappSessionService.js';
import { STEPS, AVISO_TESTE, type BotConfig } from './whatsappConstants.js';

export interface SinalDoRobo { reserva: ReservaComSinal; negocio: { name: string }; servico: { name: string } }

/** Código mostrado no simulador no lugar do Pix: não é um código válido de propósito. */
export const PIX_DE_TESTE = '00020126-codigo-pix-de-teste-nao-pague';

export function deveCobrarNoRobo(i: {
  botCobraSinal: boolean; pixKey: string | null; pixKeyType: string | null; price: number; depositPercentage: number | null;
}): boolean {
  if (!i.botCobraSinal || !i.pixKey || !i.pixKeyType) return false;
  if (!i.depositPercentage || i.depositPercentage <= 0) return false;
  return calcDeposit(i.price, i.depositPercentage) > 0;
}

/** Lê negócio e serviço e decide se cobra. Só leitura: o simulador também usa. */
const lerSeCobra = async (businessId: string, serviceId: string) => {
  const [negocio, servico] = await Promise.all([
    prisma.business.findFirst({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, pixKey: true, pixKeyType: true, botCobraSinal: true },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, businessId },
      select: { name: true, price: true, depositPercentage: true },
    }),
  ]);
  if (!negocio?.botCobraSinal || !servico) return null;

  const price = Number(servico.price);
  const depositPercentage = servico.depositPercentage === null ? null : Number(servico.depositPercentage);
  if (!negocio.pixKey || !negocio.pixKeyType) {
    if (depositPercentage) logger.warn({ businessId }, 'Robô com cobrança do sinal ligada, mas o negócio está sem chave Pix: agendando sem sinal');
    return null;
  }
  if (!deveCobrarNoRobo({ ...negocio, price, depositPercentage })) return null;
  return { negocio: { ...negocio, pixKey: negocio.pixKey, pixKeyType: negocio.pixKeyType }, servico: { name: servico.name, price, depositPercentage: depositPercentage! } };
};

/** null = não se aplica: agendar como hoje. ConflictError sobe para o chamador. */
export async function reservarComSinalSeAtivo(i: {
  businessId: string; clientId: string; professionalId: string; serviceId: string; date: string; time: string;
}): Promise<SinalDoRobo | null> {
  const cobra = await lerSeCobra(i.businessId, i.serviceId);
  if (!cobra) return null;
  const { negocio, servico } = cobra;
  const reserva = await reservaComSinalService.criar({
    business: { id: negocio.id, name: negocio.name, slug: negocio.slug, pixKey: negocio.pixKey, pixKeyType: negocio.pixKeyType },
    clientId: i.clientId, professionalId: i.professionalId, serviceId: i.serviceId,
    serviceName: servico.name, servicePrice: servico.price, depositPercentage: servico.depositPercentage,
    date: i.date, time: i.time, origem: 'whatsapp',
  });
  return { reserva, negocio: { name: negocio.name }, servico: { name: servico.name } };
}

const valorBr = (v: number): string => v.toFixed(2).replace('.', ',');

interface EnvioDoSinal {
  phone: string; businessId: string; config: BotConfig; sendContext: SendWhatsAppMessageContext;
  dateFormatted: string; time: string;
}

/**
 * Envia o pedido do sinal (Pix: texto + código puro em mensagem separada; cartão/link: texto com o link)
 * e põe a sessão em espera. Se alguma mensagem não sai, cancela a reserva na hora: horário não fica
 * preso sem a cliente ter recebido como pagar.
 */
export async function enviarPedidoDoSinal(sinal: SinalDoRobo, e: EnvioDoSinal): Promise<boolean> {
  const { reserva } = sinal;
  const dados = {
    businessName: sinal.negocio.name, serviceName: sinal.servico.name,
    depositAmount: valorBr(reserva.depositAmount), prazoMin: String(reserva.toleranciaMin),
    dateFormatted: e.dateFormatted, time: e.time,
  };
  const comLink = !reserva.pixPayload && reserva.checkoutUrl;
  const textos = comLink
    ? [formatMessage(e.config.deposit_checkout_message, { ...dados, paymentLink: reserva.checkoutUrl! })]
    : [formatMessage(e.config.deposit_request_message, dados), reserva.pixPayload ?? ''];

  let enviado = true;
  for (const texto of textos) {
    enviado = await sendWhatsAppMessage(e.phone, texto, e.sendContext).catch(() => false);
    if (!enviado) break;
  }

  if (!enviado) {
    logger.error({ businessId: e.businessId, appointmentId: reserva.appointment.id }, 'Pedido do sinal não foi enviado: cancelando a pré-reserva');
    await cancelarSePendente(reserva.appointment.id, e.businessId).catch((err: unknown) =>
      logger.error({ err, appointmentId: reserva.appointment.id }, 'Falha ao cancelar a pré-reserva sem Pix enviado'));
    return false;
  }

  await updateSession(e.phone, e.businessId, STEPS.AWAITING_DEPOSIT, {
    appointmentId: reserva.appointment.id, expiresAt: reserva.expiresAt.toISOString(),
  });
  return true;
}

/**
 * Simulador: se o negócio cobraria, mostra o pedido do sinal com um código de teste e o AVISO_TESTE,
 * sem criar reserva nem cobrança. Devolve null quando não cobraria (segue a confirmação de teste de hoje).
 */
export async function simularPedidoDoSinal(
  i: { businessId: string; serviceId: string },
  e: EnvioDoSinal,
): Promise<boolean | null> {
  const cobra = await lerSeCobra(i.businessId, i.serviceId);
  if (!cobra) return null;
  const prazo = await automacoesGatilhos.toleranciaSinal(i.businessId);
  const texto = formatMessage(e.config.deposit_request_message, {
    businessName: cobra.negocio.name, serviceName: cobra.servico.name,
    depositAmount: valorBr(calcDeposit(cobra.servico.price, cobra.servico.depositPercentage)), prazoMin: String(prazo),
    dateFormatted: e.dateFormatted, time: e.time,
  });
  if (!await sendWhatsAppMessage(e.phone, texto, e.sendContext)) return false;
  return sendWhatsAppMessage(e.phone, `${PIX_DE_TESTE}\n\n${AVISO_TESTE}`, e.sendContext);
}

/**
 * Cancela só se a reserva ainda estiver aguardando o sinal (nunca uma já paga). Sem os efeitos de
 * updateStatus (aviso à profissional, lista de espera): a pré-reserva nunca chegou a ser confirmada.
 */
const cancelarSePendente = async (appointmentId: string, businessId: string): Promise<boolean> => {
  const cancelou = await recebimentosRepository.cancelarReservaPendente(appointmentId, businessId);
  if (cancelou) void googleAgendaService.sincronizarSaida({ appointmentId });
  return cancelou;
};

/**
 * A cliente pediu para cancelar a pré-reserva. 'paga' = o sinal foi pago nesse meio-tempo (a confirmação
 * sai pelo pagamento); 'encerrada' = já tinha vencido ou sido cancelada.
 */
export async function cancelarEsperaDoSinal(appointmentId: string, businessId: string): Promise<'cancelada' | 'paga' | 'encerrada'> {
  if (await cancelarSePendente(appointmentId, businessId)) return 'cancelada';
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, businessId }, select: { status: true } });
  return a && ['confirmado', 'em_atendimento', 'concluido'].includes(a.status) ? 'paga' : 'encerrada';
}

/** Reserva ainda à espera do sinal e dentro do prazo? Devolve o prazo; null se expirou, foi paga ou cancelada. */
export async function reservaEmEspera(appointmentId: string, businessId: string, agora = new Date()): Promise<{ expiresAt: Date } | null> {
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    select: { status: true, expiresAt: true },
  });
  if (!a || a.status !== 'aguardando_pagamento' || !a.expiresAt || a.expiresAt <= agora) return null;
  return { expiresAt: a.expiresAt };
}

/** Minutos que faltam para o prazo, arredondados para cima (nunca 0 enquanto em espera). */
export const minutosRestantes = (expiresAt: Date, agora = new Date()): number =>
  Math.max(1, Math.ceil((expiresAt.getTime() - agora.getTime()) / 60_000));
