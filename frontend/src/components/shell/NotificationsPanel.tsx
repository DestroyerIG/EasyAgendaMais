'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bell, CalendarClock, CalendarPlus, CheckCheck, CircleDollarSign, Clock3, Crown, Loader2, Receipt, Star } from 'lucide-react';
import { notificationsApi, type AppNotification, type NotificationType } from '@/lib/notifications';
import { EmptyState } from '@/components/ui';
import { AtivarNotificacoes } from '@/components/push/AtivarNotificacoes';
import { cn } from '@/lib/cn';

const ICON_BY_TYPE: Record<NotificationType, typeof CalendarPlus> = {
  nova_reserva: CalendarPlus,
  reserva_expirada: Clock3,
  pagamento_confirmado: CircleDollarSign,
  clube_adesao: Crown,
  clube_atraso: AlertTriangle,
  agenda_profissional: CalendarClock,
  comanda_pronta: Receipt,
  avaliacao_baixa: Star,
};

const formatRelativo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

export interface NotificationsPanelProps {
  /** Notifica o pai quando a contagem de não lidas muda (ex.: ao marcar como lida). */
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationsPanel({ onUnreadCountChange }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    notificationsApi
      .list()
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, []);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  useEffect(() => {
    if (notifications) onUnreadCountChange?.(unreadCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount, notifications]);

  const marcarComoLida = async (notification: AppNotification) => {
    if (notification.read) return;
    setNotifications((prev) =>
      prev ? prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) : prev
    );
    try {
      await notificationsApi.markRead(notification.id);
    } catch {
      // Falha silenciosa: na próxima abertura do painel, o estado real volta do servidor.
    }
  };

  const marcarTodasComoLidas = async () => {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev));
    } catch {
      // Falha silenciosa: idem.
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="flex max-h-[420px] w-[340px] flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <p className="text-[15px] font-bold text-ink">Notificações</p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={marcarTodasComoLidas}
            disabled={markingAll}
            className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline disabled:opacity-60"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            Marcar todas como lidas
          </button>
        )}
      </div>

      <div className="overflow-y-auto">
        {notifications === null && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
          </div>
        )}

        {notifications?.length === 0 && (
          <EmptyState icon={Bell} title="Nenhuma notificação" description="Avisos de novas reservas e pagamentos aparecem aqui." />
        )}

        {notifications?.map((notification) => {
          const IconeDoTipo = ICON_BY_TYPE[notification.type] ?? Bell;
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => marcarComoLida(notification)}
              className={cn(
                'flex w-full items-start gap-2.5 border-b border-line px-3 py-3 text-left transition-colors hover:bg-surface-2',
                !notification.read && 'bg-brand/5',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  notification.read ? 'bg-surface-2 text-muted' : 'bg-brand/12 text-brand',
                )}
              >
                <IconeDoTipo className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn('text-[13px] leading-snug', notification.read ? 'font-semibold text-ink' : 'font-bold text-ink')}>
                    {notification.title}
                  </span>
                  {!notification.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                </span>
                {notification.description && (
                  <span className="mt-0.5 block truncate text-[12px] text-muted">{notification.description}</span>
                )}
                <span className="mt-0.5 block text-[11px] text-muted">{formatRelativo(notification.createdAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <AtivarNotificacoes compacto className="border-t border-line px-3 py-2" />
    </div>
  );
}
