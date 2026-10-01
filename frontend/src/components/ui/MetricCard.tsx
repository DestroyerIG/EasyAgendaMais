import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from './Card';

type Trend = 'up' | 'down' | 'flat';
type Tone = 'positive' | 'negative' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; trend: Trend; tone?: Tone };
  // Frase descritiva sob a métrica. Ocupa a mesma linha da variação, sem seta nem cor semântica.
  caption?: string;
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-muted',
};
const DEFAULT_TONE: Record<Trend, Tone> = { up: 'positive', down: 'negative', flat: 'neutral' };
const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

export function MetricCard({ label, value, delta, caption, className }: MetricCardProps) {
  const tone = delta ? delta.tone ?? DEFAULT_TONE[delta.trend] : null;
  const Icon = delta ? TREND_ICON[delta.trend] : null;

  return (
    <Card className={cn('flex flex-col gap-2', className)}>
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="text-[32px] font-bold leading-none tabular-nums text-ink">{value}</p>
      {delta && tone && Icon ? (
        <p data-tone={tone} className={cn('inline-flex items-center gap-1 text-[13px] font-semibold', TONE_CLASS[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {delta.value}
        </p>
      ) : caption ? (
        <p className="text-[13px] text-muted">{caption}</p>
      ) : null}
    </Card>
  );
}
