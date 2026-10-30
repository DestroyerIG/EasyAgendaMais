import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/formatters';
import { rotuloSegmento, rotuloStatus } from '@/lib/adminRotulos';
import type { DetalheNegocio } from '@/types/admin';
import { TOM_STATUS } from '../negocios/TabelaNegocios';

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

function Dado({ icone, children }: { icone: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon name={icone} size={16} className="shrink-0" />
      <span className="break-all">{children}</span>
    </span>
  );
}

/** Trilha "SuperAdmin › Negócios › {nome}". */
export function TrilhaNegocio({ nome }: { nome: string }) {
  return (
    <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
      <span>SuperAdmin</span>
      <Icon name="chevron_right" size={16} />
      <Link href="/admin/negocios" className="font-semibold text-brand-text hover:underline">
        Negócios
      </Link>
      <Icon name="chevron_right" size={16} />
      <span className="font-semibold text-ink">{nome}</span>
    </nav>
  );
}

export function CabecalhoNegocio({ negocio: n }: { negocio: DetalheNegocio['negocio'] }) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand/12 text-[18px] font-bold text-brand-text"
      >
        {iniciais(n.nome)}
      </span>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{n.nome}</h1>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-muted">
            #{n.id.slice(0, 8)}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold',
              TOM_STATUS[n.status] ?? 'bg-muted/12 text-muted',
            )}
          >
            {rotuloStatus(n.status)}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink">{rotuloSegmento(n.segmento)}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          {n.dono && <Dado icone="person">{n.dono}</Dado>}
          {n.email && <Dado icone="mail">{n.email}</Dado>}
          {n.whatsapp && <Dado icone="phone_iphone">{formatPhone(n.whatsapp)}</Dado>}
          {n.endereco && <Dado icone="location_on">{n.endereco}</Dado>}
        </div>
        {n.status === 'bloqueado_admin' && n.suspensoMotivo && (
          <p className="text-[13px] text-danger">Motivo do bloqueio: {n.suspensoMotivo}</p>
        )}
      </div>
    </div>
  );
}
