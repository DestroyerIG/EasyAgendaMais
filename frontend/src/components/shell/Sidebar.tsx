'use client';

import Link from 'next/link';
import Image from 'next/image';
import { NAV_ITEMS, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';
import { AccountMenu } from './AccountMenu';

export interface SidebarProps {
  activeId: NavItemId | null;
  businessName: string;
  onLogout: () => void;
}

export function Sidebar({ activeId, businessName, onLogout }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <Image src={easyAgendaLogo} alt="" width={32} height={32} className="h-8 w-8" priority />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">EasyAgenda+</p>
          <p className="truncate text-[15px] font-bold text-ink">{businessName}</p>
        </div>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, label, href, icon: Icon }) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-control px-3 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active ? 'bg-brand/12 text-brand-text' : 'text-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-3">
        <AccountMenu businessName={businessName} onLogout={onLogout} />
      </div>
    </aside>
  );
}
