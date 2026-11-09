'use client';

import Link from 'next/link';
import { NAV_ITEMS, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import { BrandLogo, Icon } from '@/components/ui';
import { BusinessCard } from './AccountMenu';

export interface SidebarProps {
  activeId: NavItemId | null;
  businessName: string;
  planLabel: string;
  logoUrl?: string | null;
}

export function Sidebar({ activeId, businessName, planLabel, logoUrl }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[248px] flex-col justify-between border-r border-line bg-surface lg:flex">
      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={32} decorativa />
            <div className="flex flex-col leading-tight">
              <span className="text-[17px] font-bold tracking-tight text-ink">
                EasyAgenda<span className="text-brand">+</span>
              </span>
              <span className="text-[11px] font-medium text-muted">Gestão de Beleza</span>
            </div>
          </div>
        </div>
        <nav aria-label="Navegação principal" className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map(({ id, label, href, icon }) => {
            const active = id === activeId;
            return (
              <Link
                key={id}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                  active
                    ? 'bg-surface-2 font-bold text-ink'
                    : 'font-semibold text-muted hover:bg-surface-2/60 hover:text-ink',
                )}
              >
                <Icon name={icon} size={20} filled={active} className={active ? 'text-brand' : undefined} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-line p-3">
        <BusinessCard businessName={businessName} planLabel={planLabel} logoUrl={logoUrl} />
      </div>
    </aside>
  );
}
