'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { normalizePath } from '@/lib/navigation';
import { cn } from '@/lib/cn';

const ABAS = [
  { label: 'Planos e pacotes', href: '/clube' },
  { label: 'Assinantes e pacotes ativos', href: '/clube/assinantes' },
] as const;

export function ClubeTabs() {
  const atual = normalizePath(usePathname());
  return (
    <nav aria-label="Seções de Clube e pacotes" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {ABAS.map((aba) => {
        const ativa = atual === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-semibold transition-colors',
              ativa ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
