import { z } from 'zod';

export const NOTIFICATION_TYPES = ['nova_reserva', 'reserva_expirada', 'pagamento_confirmado'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  description?: string;
  link?: string;
}
