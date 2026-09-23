import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const TONE_CLASS: Record<BannerTone, string> = {
  info: 'border-status-confirmed/30 bg-status-confirmed/12',
  warning: 'border-warning/30 bg-warning/12',
  danger: 'border-danger/30 bg-danger/12',
  success: 'border-success/30 bg-success/12',
};

export interface BannerProps {
  tone?: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', children, action, className }: BannerProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2.5 text-center text-[13px] text-ink',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
      {action}
    </div>
  );
}
