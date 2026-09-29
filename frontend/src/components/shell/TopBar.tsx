'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Avatar, Icon } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui';
import type { NavItemId } from '@/lib/navigation';
import { AccountMenuContent } from './AccountMenu';
import { useTopBarSearchConfig } from './TopBarSearchContext';

export interface TopBarProps {
  activeId: NavItemId | null;
  pageTitle: string;
  businessName: string;
  roleLabel: string;
  onLogout: () => void;
}

// Placeholder da busca por tela — vem do arquivo de referência de cada tela
// (seção 0.3 do INVENTARIO.md: "placeholder variando por tela"); nas telas sem
// export próprio usamos o genérico que ajustes-plano.html e hoje-desktop.html usam.
const SEARCH_PLACEHOLDER: Partial<Record<NavItemId, string>> = {
  agenda: 'Buscar agendamento ou cliente...',
  clientes: 'Buscar cliente, agendamento ou telefone...',
  whatsapp: 'Buscar conversa, cliente ou disparo...',
};
const DEFAULT_SEARCH_PLACEHOLDER = 'Buscar no sistema...';

function TopBarSearch({ activeId, pageTitle }: { activeId: NavItemId | null; pageTitle: string }) {
  const search = useTopBarSearchConfig();
  const placeholder = (activeId && SEARCH_PLACEHOLDER[activeId]) || DEFAULT_SEARCH_PLACEHOLDER;

  return (
    <div className="relative hidden items-center sm:flex">
      <Icon name="search" size={19} className="pointer-events-none absolute left-3 text-muted" />
      {/* Um único <input>, sempre controlado (value nunca é undefined) — alternar entre
          um <input> sem value (não controlado) e outro com value fazia o React avisar
          "changing an uncontrolled input to be controlled" ao registrar a busca. */}
      <input
        type="text"
        value={search?.value ?? ''}
        onChange={search ? (event) => search.onChange(event.target.value) : undefined}
        disabled={!search}
        placeholder={placeholder}
        title={search ? undefined : `A busca de ${pageTitle} chega junto com essa área.`}
        className={cn(
          'w-64 rounded-xl border border-line bg-surface-2 py-1.5 pl-9 pr-3.5 text-[13px] placeholder-muted transition-all',
          search
            ? 'text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'
            : 'cursor-not-allowed text-muted',
        )}
      />
    </div>
  );
}

export function TopBar({ activeId, pageTitle, businessName, roleLabel, onLogout }: TopBarProps) {
  const [desktopAccountOpen, setDesktopAccountOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);

  return (
    <>
      {/* Barra superior do computador — hoje-desktop.html / INVENTARIO 0.3 */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-line bg-surface/90 px-6 backdrop-blur-md lg:flex">
        <div className="flex items-center gap-2 text-[14px] font-medium text-muted">
          <Icon name="storefront" size={18} className="text-muted" />
          <span>{businessName}</span>
          <span className="font-light text-line">/</span>
          <span className="font-semibold text-ink">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-4">
          <TopBarSearch activeId={activeId} pageTitle={pageTitle} />
          <button
            type="button"
            title="Notificações"
            onClick={() => setDesktopAccountOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="notifications" size={20} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
          </button>
          <div className="h-6 w-px bg-line" />
          <DropdownMenu open={desktopAccountOpen} onOpenChange={setDesktopAccountOpen}>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2.5 pl-1">
              <Avatar name={businessName} size={32} className="rounded-xl border border-line bg-surface-2 font-bold text-ink" />
              <span className="hidden flex-col text-left leading-none md:flex">
                <span className="text-[13px] font-bold text-ink">{businessName}</span>
                <span className="mt-0.5 text-[11px] font-medium text-muted">{roleLabel}</span>
              </span>
              <span className="sr-only">Menu da conta</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-[200px]">
              <AccountMenuContent onLogout={onLogout} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Barra superior do celular — hoje-mobile.html / INVENTARIO 0.4 */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={businessName} size={36} className="rounded-lg bg-surface-2 font-bold text-ink" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold leading-none text-muted">Espaço Ativo</span>
            <span className="flex items-center gap-1 truncate text-[17px] font-bold leading-tight text-ink">
              {businessName}
              <Icon name="unfold_more" size={18} className="shrink-0 text-muted" />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Notificações"
            onClick={() => setMobileAccountOpen(true)}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
          >
            <Icon name="notifications" size={22} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />
          </button>
          <DropdownMenu open={mobileAccountOpen} onOpenChange={setMobileAccountOpen}>
            <DropdownMenuTrigger aria-label="Menu da conta" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-on-brand">
              <Icon name="person" size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="w-[200px]">
              <AccountMenuContent onLogout={onLogout} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
