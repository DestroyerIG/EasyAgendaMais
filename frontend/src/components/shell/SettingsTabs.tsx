'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';

/** Link de volta ao hub de Configurações, mostrado no topo de cada subpágina. */
export function SettingsTabs() {
  return (
    <nav aria-label="Voltar para Configurações" className="mb-4">
      <Link
        href="/configuracoes"
        className="inline-flex items-center gap-1 text-[15px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrow_back" size={18} /> Configurações
      </Link>
    </nav>
  );
}
