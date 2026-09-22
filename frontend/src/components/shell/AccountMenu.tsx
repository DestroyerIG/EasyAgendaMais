'use client';

import { ChevronUp, LogOut } from 'lucide-react';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ThemeSelect,
} from '@/components/ui';

export function AccountMenu({ businessName, onLogout }: { businessName: string; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-h-11 items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Avatar name={businessName} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{businessName}</span>
        <ChevronUp className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="sr-only">Menu da conta</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[232px]">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <ThemeSelect className="w-full justify-between" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onLogout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
