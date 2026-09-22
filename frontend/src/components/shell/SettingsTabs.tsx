'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS, normalizePath } from '@/lib/navigation';
import { cn } from '@/lib/cn';

export function SettingsTabs() {
  const current = normalizePath(usePathname());

  return (
    <nav aria-label="Seções de Ajustes" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {SETTINGS_TABS.map((tab) => {
        const active = current === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-semibold transition-colors',
              active ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
