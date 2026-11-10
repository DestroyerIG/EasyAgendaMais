import logger from '../../utils/logger.js';
// @ts-ignore — sendWhatsAppMessage é um serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { pushService } from '../push/push.service.js';
import { googleAgendaService } from '../googleAgenda/googleAgenda.service.js';
import { textoAgendamentoConfirmado } from '../../services/whatsapp/whatsappConfirmacao.js';
import { deleteSession } from '../../services/whatsapp/whatsappSessionService.js';
import { normalizeWhatsAppNumber } from '../../utils/whatsapp.js';
import type { AppointmentWithRelations } from './appointments.types.js';

export const dataBr = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}`;
export const horaDe = (t: Date) => t.toISOString().slice(11, 16);
export const primeiroNome = (nome: string) => nome.split(' ')[0] || nome;

/** Push para a profissional. Nunca derruba a operação: o texto é montado aqui dentro, protegido. */
export function avisarProfissional(a: AppointmentWithRelations, titulo: string, corpo: () => string): void {
  try {
    void pushService.paraProfissional(a.businessId, a.professionalId, { titulo, corpo: corpo(), link: '/bancada', tag: `agendamento-${a.id}` });
  } catch (err) {
    logger.warn({ err, appointmentId: a.id }, 'Push para a profissional não enviado');
  }
}

/**
 * Tudo o que acontece quando o sinal de uma reserva é confirmado (botão manual ou pagamento
 * automático): WhatsApp ao cliente, notificação, aviso à profissional e agenda externa.
 * Nunca lança: cada passo falha sozinho, sem impedir os demais.
 * `sincronizar: false` deixa a agenda externa para quem chama (updateStatus já sincroniza ao final).
 */
export async function avisarSinalConfirmado(
  a: AppointmentWithRelations,
  opts: { sincronizar?: boolean } = {},
): Promise<void> {
  const { sincronizar = true } = opts;

  const doRobo = a.source === 'whatsapp';

  try {
    const message = doRobo
      ? await textoAgendamentoConfirmado(a)
      : `Olá ${a.client.name}! Seu sinal foi confirmado e seu horário está garantido. Te esperamos!`;
    await sendWhatsAppMessage(a.client.phone, message, { businessId: a.businessId, origin: 'pix_recibo' });
  } catch (err) {
    logger.warn({ err, appointmentId: a.id }, 'WhatsApp de sinal confirmado não enviado');
  }

  if (doRobo) {
    // O robô esperava o pagamento: encerra a conversa (a sessão fica sob o telefone normalizado, como o fluxo a criou).
    try {
      await deleteSession(normalizeWhatsAppNumber(a.client.phone) || a.client.phone, a.businessId);
    } catch (err) {
      logger.warn({ err, appointmentId: a.id }, 'Sessão do robô não apagada após o sinal');
    }
  }

  try {
    await notificationsService.notify(a.businessId, {
      type: 'pagamento_confirmado',
      title: 'Pagamento confirmado',
      description: `${a.client.name} · ${a.service.name}`,
    });
  } catch (err) {
    logger.warn({ err, appointmentId: a.id }, 'Notificação de pagamento confirmado falhou');
  }

  avisarProfissional(a, 'Novo agendamento', () => `${primeiroNome(a.client.name)} · ${a.service.name} · ${dataBr(a.date)} às ${horaDe(a.time)}`);

  if (sincronizar) {
    try {
      void Promise.resolve(googleAgendaService.sincronizarSaida({ appointmentId: a.id }))
        .catch((err) => logger.warn({ err, appointmentId: a.id }, 'Sincronização da agenda após sinal falhou'));
    } catch (err) {
      logger.warn({ err, appointmentId: a.id }, 'Sincronização da agenda após sinal falhou');
    }
  }
}
