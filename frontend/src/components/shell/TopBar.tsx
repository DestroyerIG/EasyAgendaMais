'use client';

import { useEffect, useState } from 'react';
import { Avatar, Icon } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { NavItemId } from '@/lib/navigation';
import { notificationsApi } from '@/lib/notifications';
import { AccountMenuContent } from './AccountMenu';
import { useTour } from '@/components/tour/TourProvider';
import { NotificationsPanel } from './NotificationsPanel';
import { BuscaGeral } from './BuscaGeral';
import { BuscaCelular } from './BuscaCelular';

const UNREAD_POLL_MS = 60_000;

/** Contagem de não lidas: busca ao montar e a cada UNREAD_POLL_MS; o painel
 * aberto corrige o valor na hora via onUnreadCountChange, sem esperar o poll. */
function useUnreadNotificationsCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const fetchCount = () => {
      notificationsApi
        .unreadCount()
        .then((value) => { if (!cancelado) setCount(value); })
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, UNREAD_POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(interval);
    };
  }, []);

  return [count, setCount] as const;
}

export interface TopBarProps {
  activeId: NavItemId | null;
  pageTitle: string;
  businessName: string;
  logoUrl?: string | null;
  roleLabel: string;
  onLogout: () => void;
  onAvaliar?: () => void;
}

export function TopBar({ activeId, pageTitle, businessName, logoUrl, roleLabel, onLogout, onAvaliar }: TopBarProps) {
  const tour = useTour();
  const onTour = tour.disponivel ? tour.iniciar : undefined;
  const [desktopAccountOpen, setDesktopAccountOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false);
  const [mobileNotificationsOpen, setMobileNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useUnreadNotificationsCount();

  return (
    <>
      {/* Barra superior do computador — hoje-desktop.html / INVENTARIO 0.3 */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-line bg-surface/90 px-6 backdrop-blur-md lg:flex">
        <div className="flex items-center text-[14px] font-semibold text-ink">{pageTitle}</div>
        <div className="flex items-center gap-4">
          <BuscaGeral />
          <DropdownMenu open={desktopNotificationsOpen} onOpenChange={setDesktopNotificationsOpen}>
            <DropdownMenuTrigger
              title="Notificações"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Icon name="notifications" size={20} />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-auto p-0">
              <NotificationsPanel onUnreadCountChange={setUnreadCount} />
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-6 w-px bg-line" />
          <DropdownMenu open={desktopAccountOpen} onOpenChange={setDesktopAccountOpen}>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2.5 pl-1">
              <Avatar name={businessName} src={logoUrl} size={32} className="rounded-xl border border-line bg-surface-2 font-bold text-ink" />
              <span className="hidden flex-col text-left leading-none md:flex">
                <span className="text-[13px] font-bold text-ink">{businessName}</span>
                <span className="mt-0.5 text-[11px] font-medium text-muted">{roleLabel}</span>
              </span>
              <span className="sr-only">Menu da conta</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-[232px]">
              <AccountMenuContent onLogout={onLogout} onAvaliar={onAvaliar} onTour={onTour} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Barra superior do celular — hoje-mobile.html / INVENTARIO 0.4 */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={businessName} src={logoUrl} size={36} className="rounded-lg bg-surface-2 font-bold text-ink" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold leading-none text-muted">Espaço Ativo</span>
            <span className="flex min-w-0 items-center gap-1 text-[17px] font-bold leading-tight text-ink">
              <span className="truncate">{businessName}</span>
              <Icon name="unfold_more" size={18} className="shrink-0 text-muted" />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BuscaCelular />
          <DropdownMenu open={mobileNotificationsOpen} onOpenChange={setMobileNotificationsOpen}>
            <DropdownMenuTrigger
              title="Notificações"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
            >
              <Icon name="notifications" size={22} />
              {unreadCount > 0 && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-auto p-0">
              <NotificationsPanel onUnreadCountChange={setUnreadCount} />
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu open={mobileAccountOpen} onOpenChange={setMobileAccountOpen}>
            <DropdownMenuTrigger aria-label="Menu da conta" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-on-brand">
              <Icon name="person" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-[232px]">
              <AccountMenuContent onLogout={onLogout} onAvaliar={onAvaliar} onTour={onTour} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
