'use client';

import Link from 'next/link';
import { MORE_MENU_IDS, getNavItem, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import { Button, Icon, SidePanel, ThemeSelect } from '@/components/ui';

export interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: NavItemId | null;
  onLogout: () => void;
}

export function MoreSheet({ open, onOpenChange, activeId, onLogout }: MoreSheetProps) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Mais" side="bottom">
      <ul className="flex flex-col gap-1">
        {MORE_MENU_IDS.map((id) => {
          const { label, href, icon } = getNavItem(id);
          const active = id === activeId;
          return (
            <li key={id}>
              <Link
                href={href}
                onClick={() => onOpenChange(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-control px-3 text-[15px] font-semibold',
                  active ? 'bg-brand/12 text-brand-text' : 'text-ink hover:bg-surface-2',
                )}
              >
                <Icon name={icon} size={20} filled={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-[13px] font-semibold text-muted">Tema</p>
        <ThemeSelect className="w-full justify-between" />
      </div>
      <Button variant="ghost" fullWidth className="mt-4 justify-start" onClick={() => { onOpenChange(false); onLogout(); }}>
        <Icon name="logout" size={20} />
        Sair
      </Button>
    </SidePanel>
  );
}
