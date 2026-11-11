import api from '@/lib/api';

export type NotificationType =
  | 'nova_reserva' | 'reserva_expirada' | 'pagamento_confirmado' | 'clube_adesao' | 'clube_atraso'
  | 'agenda_profissional' | 'comanda_pronta' | 'avaliacao_baixa' | 'google_agenda' | 'recebimento_alerta'
  | 'hora_atendimento';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const response = await api.get('/notifications');
    return response.data;
  },

  async unreadCount(): Promise<number> {
    const response = await api.get('/notifications/unread-count');
    return response.data.count;
  },

  async markRead(id: string): Promise<void> {
    await api.put(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<void> {
    await api.put('/notifications/read-all');
  },
};
