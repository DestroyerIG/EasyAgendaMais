import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
  // Anuncia o carregamento em leitores de tela. Use em um único esqueleto por bloco.
  label?: string;
}

export function Skeleton({ className, label }: SkeletonProps) {
  const bar = <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-surface-2', className)} />;

  if (!label) return bar;

  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {bar}
    </div>
  );
}
