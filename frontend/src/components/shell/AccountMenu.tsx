'use client';

import Link from 'next/link';
import { Avatar, Icon, ThemeSelect } from '@/components/ui';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui';

// Conteúdo do menu da conta (tema, avaliar e sair): vive só na barra superior
// (pílula da pessoa no desktop e ícone no celular).
export function AccountMenuContent({ onLogout, onAvaliar }: { onLogout: () => void; onAvaliar?: () => void }) {
  return (
    <>
      <DropdownMenuLabel>Tema</DropdownMenuLabel>
      <div className="px-2 pb-2">
        <ThemeSelect compacto className="w-full" />
      </div>
      <DropdownMenuSeparator />
      {onAvaliar && (
        <DropdownMenuItem onSelect={() => onAvaliar()}>
          <Icon name="star" size={16} />
          Avaliar o EasyAgenda+
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => onLogout()}>
        <Icon name="logout" size={16} />
        Sair
      </DropdownMenuItem>
    </>
  );
}

/** Cartão do negócio na barra lateral: logo, nome e plano. Leva para Plano e cobrança. */
export function BusinessCard({
  businessName,
  planLabel,
  logoUrl,
}: {
  businessName: string;
  planLabel: string;
  logoUrl?: string | null;
}) {
  return (
    <Link
      href="/planos"
      className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-line/60 bg-surface-2 p-2.5 text-left transition-colors hover:bg-line/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar
          name={businessName}
          src={logoUrl}
          size={36}
          className="rounded-xl border border-brand/20 bg-brand/10 text-brand"
          fallback={<Icon name="spa" size={20} />}
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-bold leading-tight text-ink">{businessName}</span>
          <span className="text-[11px] font-semibold leading-tight text-muted">Plano {planLabel}</span>
        </span>
      </span>
      <Icon name="chevron_right" size={18} className="text-muted" />
      <span className="sr-only">Plano e cobrança</span>
    </Link>
  );
}
