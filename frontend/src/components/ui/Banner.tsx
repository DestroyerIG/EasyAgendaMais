import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BannerTone = 'info' | 'warning' | 'danger' | 'success';
type BannerVariant = 'strip' | 'inline';

const TONE_CLASS: Record<BannerTone, string> = {
  info: 'border-status-confirmed/30 bg-status-confirmed/12',
  warning: 'border-warning/30 bg-warning/12',
  danger: 'border-danger/30 bg-danger/12',
  success: 'border-success/30 bg-success/12',
};

// strip: faixa do topo da página, da largura toda. inline: aviso dentro de um cartão.
const VARIANT_CLASS: Record<BannerVariant, string> = {
  strip: 'justify-center border-b px-4 py-2.5 text-center',
  inline: 'rounded-control border p-3 text-left',
};

export interface BannerProps {
  tone?: BannerTone;
  variant?: BannerVariant;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', variant = 'strip', children, action, className }: BannerProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink',
        VARIANT_CLASS[variant],
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
      {action}
    </div>
  );
}
