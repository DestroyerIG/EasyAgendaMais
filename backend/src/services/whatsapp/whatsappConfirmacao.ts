/**
 * Texto de "agendamento confirmado" do robô, usado quando o sinal de uma reserva do WhatsApp é pago.
 * Não importa whatsappFlowService (módulo grande, risco de ciclo): usa só a configuração do robô e o formatador.
 */
import { prisma } from '../../config/prisma.js';
import type { AppointmentWithRelations } from '../../modules/appointments/appointments.types.js';
import { getBotConfig } from './whatsappConfigService.js';
import { formatMessage } from './whatsappMessageService.js';

const NOME_NEGOCIO_PADRAO = 'nossa equipe';

async function nomeDoNegocio(businessId: string): Promise<string> {
  try {
    const negocio = await prisma.business.findFirst({ where: { id: businessId }, select: { name: true } });
    return negocio?.name || NOME_NEGOCIO_PADRAO;
  } catch {
    return NOME_NEGOCIO_PADRAO;
  }
}

/** Mesmas variáveis da confirmation_message que o fluxo envia quando não há sinal. */
export async function textoAgendamentoConfirmado(a: AppointmentWithRelations): Promise<string> {
  const config = await getBotConfig(a.businessId);
  const iso = a.date.toISOString();
  return formatMessage(config.confirmation_message, {
    serviceName: a.service.name,
    professionalName: a.professional.name,
    dateFormatted: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
    time: a.time.toISOString().slice(11, 16),
    servicePrice: Number(a.service.price).toFixed(2),
    clientName: a.client.name,
    businessName: config.confirmation_message?.includes('{nome_negocio}') ? await nomeDoNegocio(a.businessId) : undefined,
  });
}
