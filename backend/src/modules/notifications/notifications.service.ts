import logger from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';
import { notificationsRepository } from './notifications.repository.js';
import type { NotificationDto, NotifyInput } from './notifications.types.js';
import { pushService } from '../push/push.service.js';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  type: row.type as NotificationDto['type'],
  title: row.title,
  description: row.description,
  link: row.link,
  read: row.read,
  createdAt: row.createdAt.toISOString(),
});

export const notificationsService = {
  async list(businessId: string, limit?: number): Promise<NotificationDto[]> {
    const rows = await notificationsRepository.findByBusiness(businessId, limit);
    return rows.map(toDto);
  },

  async unreadCount(businessId: string): Promise<number> {
    return notificationsRepository.countUnread(businessId);
  },

  async markRead(id: string, businessId: string): Promise<void> {
    const updated = await notificationsRepository.markRead(id, businessId);
    if (!updated) throw new NotFoundError('Notificação');
  },

  async markAllRead(businessId: string): Promise<number> {
    return notificationsRepository.markAllRead(businessId);
  },

  /**
   * Cria uma notificação para o negócio. Nunca lança — uma falha aqui não pode
   * derrubar o fluxo que está notificando (criação de reserva, confirmação de
   * pagamento, expiração), igual ao envio de WhatsApp.
   */
  async notify(businessId: string, input: NotifyInput, opts: { semPush?: boolean } = {}): Promise<void> {
    try {
      await notificationsRepository.create(businessId, input);
    } catch (error) {
      logger.error({ err: error, businessId, type: input.type }, 'Falha ao criar notificação');
    }
    // `semPush`: avisos que só a profissional recebe no celular (o chamador manda o push dela).
    if (opts.semPush) return;
    // O sino também vai por push para quem ativou no aparelho (nunca lança).
    void pushService.paraEquipe(businessId, { titulo: input.title, corpo: input.description, link: input.link ?? '/', tag: input.type });
  },
};
