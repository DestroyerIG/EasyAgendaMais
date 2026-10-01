'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { BOTTOM_NAV_IDS, NEW_APPOINTMENT_HREF, getNavItem, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';

export interface BottomNavProps {
  activeId: NavItemId | null;
  onOpenMore: () => void;
}

const itemClass =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand';

function NavLink({ id, activeId }: { id: NavItemId; activeId: NavItemId | null }) {
  const { label, href, icon } = getNavItem(id);
  const active = id === activeId;
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn(itemClass, active ? 'text-brand-text' : 'text-muted')}>
      <Icon name={icon} size={20} filled={active} />
      {label}
    </Link>
  );
}

export function BottomNav({ activeId, onOpenMore }: BottomNavProps) {
  const [first, second, third] = BOTTOM_NAV_IDS;
  const moreActive = activeId !== null && !BOTTOM_NAV_IDS.includes(activeId);

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <NavLink id={first} activeId={activeId} />
      <NavLink id={second} activeId={activeId} />
      <div className="flex flex-1 items-center justify-center">
        <Link
          href={NEW_APPOINTMENT_HREF}
          aria-label="Novo agendamento"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon name="add" size={24} />
        </Link>
      </div>
      <NavLink id={third} activeId={activeId} />
      <button type="button" onClick={onOpenMore} className={cn(itemClass, moreActive ? 'text-brand-text' : 'text-muted')}>
        <Icon name="menu" size={20} filled={moreActive} />
        Mais
      </button>
    </nav>
  );
}
