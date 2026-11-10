'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui';
import { BOTTOM_NAV_IDS, NEW_APPOINTMENT_HREF, NEW_CLIENT_HREF, getNavItem, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';

export interface BottomNavProps {
  activeId: NavItemId | null;
  onOpenMore: () => void;
}

const itemClass =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand';

const baloonClass =
  'flex h-11 w-full items-center justify-center whitespace-nowrap rounded-full border border-line bg-surface px-2 text-[14px] font-semibold text-ink shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

// Curvas que ligam cada balão ao botão + (viewBox em coordenadas do desenho, esticado na largura).
const CURVAS = ['M76.5 0 C76.5 20 149 8 149 30', 'M221.5 0 C221.5 20 149 8 149 30'];

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Trocar de tela ou apertar Esc fecha os balões.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);
  // Fechados, os balões continuam no DOM só para a animação: ficam fora do foco e do leitor de tela.
  const hiddenProps = open ? {} : { 'aria-hidden': true as const, tabIndex: -1 };
  const celClass = (delay: string) =>
    cn(
      'origin-bottom transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(.2,.9,.3,1.25)] motion-reduce:transition-none',
      open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-20 scale-50 opacity-0',
      open && delay,
    );

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="fundo-baloes"
        onClick={close}
        className={cn(
          'fixed inset-0 z-30 bg-scrim/50 transition-opacity duration-200 motion-reduce:transition-none lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={cn(
          'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center lg:hidden',
          !open && 'pointer-events-none',
        )}
      >
        <div className="grid w-full max-w-sm grid-cols-2 gap-3 px-4">
          <div className={celClass('')}>
            <Link href={NEW_APPOINTMENT_HREF} onClick={close} className={baloonClass} {...hiddenProps}>
              Novo agendamento
            </Link>
          </div>
          <div className={celClass('delay-75')}>
            <Link href={NEW_CLIENT_HREF} onClick={close} className={baloonClass} {...hiddenProps}>
              Novo cliente
            </Link>
          </div>
        </div>
        <svg aria-hidden="true" viewBox="0 0 298 30" preserveAspectRatio="none" className="pointer-events-none block h-[30px] w-full max-w-sm overflow-visible px-4">
          {CURVAS.map((d) => (
            <path
              key={d}
              d={d}
              pathLength={1}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={1}
              strokeDashoffset={open ? 0 : 1}
              className="stroke-brand transition-[stroke-dashoffset] duration-[250ms] motion-reduce:transition-none"
              style={{ transitionDelay: open ? '180ms' : '0ms' }}
            />
          ))}
        </svg>
      </div>
      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <NavLink id={first} activeId={activeId} />
        <NavLink id={second} activeId={activeId} />
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Criar novo"
            aria-expanded={open}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className={cn('flex transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-45')}>
              <Icon name="add" size={24} />
            </span>
          </button>
        </div>
        <NavLink id={third} activeId={activeId} />
        <button type="button" onClick={onOpenMore} className={cn(itemClass, moreActive ? 'text-brand-text' : 'text-muted')}>
          <Icon name="menu" size={20} filled={moreActive} />
          Mais
        </button>
      </nav>
    </>
  );
}
