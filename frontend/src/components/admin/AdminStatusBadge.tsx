'use client';

import { cn } from '@/lib/cn';

interface AdminStatusBadgeProps {
  value: string | boolean | null | undefined;
  variant?: 'subscription' | 'account' | 'audit';
}

type Tom = 'sucesso' | 'aviso' | 'perigo' | 'neutro';

const TOM_CLASS: Record<Tom, string> = {
  sucesso: 'bg-success/12 text-success-text',
  aviso: 'bg-warning/12 text-warning-text',
  perigo: 'bg-danger/12 text-danger',
  neutro: 'bg-muted/12 text-muted',
};

const tomDe = (valor: string): Tom => {
  const normalizado = valor.toLowerCase();
  if (['active', 'trialing', 'success', 'ok'].includes(normalizado)) return 'sucesso';
  if (['past_due', 'incomplete', 'warning'].includes(normalizado)) return 'aviso';
  if (['canceled', 'failed', 'suspended', 'blocked'].includes(normalizado)) return 'perigo';
  return 'neutro';
};

const normalizar = (value: AdminStatusBadgeProps['value'], variant?: string): string => {
  if (typeof value === 'boolean') {
    if (variant === 'account') return value ? 'active' : 'suspended';
    return value ? 'success' : 'failed';
  }
  return value || 'unknown';
};

export function AdminStatusBadge({ value, variant }: AdminStatusBadgeProps) {
  const normalizado = normalizar(value, variant);

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold', TOM_CLASS[tomDe(normalizado)])}>
      {normalizado.replace('_', ' ')}
    </span>
  );
}
