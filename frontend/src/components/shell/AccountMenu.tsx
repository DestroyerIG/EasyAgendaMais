'use client';

import { Icon, ThemeSelect } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';

// Conteúdo do menu da conta (tema + sair), compartilhado entre o cartão do
// negócio na barra lateral (desktop) e a pílula de usuário na barra superior.
export function AccountMenuContent({ onLogout }: { onLogout: () => void }) {
  return (
    <>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <div className="px-2 pb-2">
        <ThemeSelect className="w-full justify-between" />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onLogout()}>
        <Icon name="logout" size={16} />
        Sair
      </DropdownMenuItem>
    </>
  );
}

export function AccountMenu({
  businessName,
  planLabel,
  onLogout,
}: {
  businessName: string;
  planLabel: string;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-2xl border border-line/60 bg-surface-2 p-2.5 text-left transition-colors hover:bg-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-brand">
            <Icon name="spa" size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-bold leading-tight text-ink">{businessName}</span>
            <span className="text-[11px] font-semibold leading-tight text-muted">Plano {planLabel}</span>
          </span>
        </span>
        <Icon name="unfold_more" size={18} className="text-muted" />
        <span className="sr-only">Menu da conta</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[232px]">
        <AccountMenuContent onLogout={onLogout} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
