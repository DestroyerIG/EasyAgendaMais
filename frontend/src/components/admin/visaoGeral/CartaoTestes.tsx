import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { TRIAL_DAYS } from '@/lib/constants';
import { formatNumber } from '@/lib/formatters';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA } from './formato';

export function CartaoTestes({ testes }: { testes: AdminVisaoGeral['testes'] }) {
  return (
    <section aria-labelledby="vg-testes" className={cn(CAIXA, 'flex flex-col justify-between gap-4 p-5 sm:p-6')}>
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="vg-testes" className="text-[13px] font-semibold text-muted">
            Testes grátis ativos
          </h2>
          <span className="inline-flex shrink-0 items-center rounded-full bg-brand/12 px-2 py-0.5 text-[12px] font-bold text-brand-text">
            +{formatNumber(testes.novosNaSemana)} nesta semana
          </span>
        </div>
        <p className="mb-1 text-[36px] font-bold leading-none tracking-tight text-ink">{formatNumber(testes.ativos)}</p>
        <p className="text-[13px] text-muted">Contas em período experimental de {TRIAL_DAYS} dias</p>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-control bg-surface-2 p-2.5">
        <span className="flex items-center gap-1.5 text-[12px] text-ink">
          <Icon name="alarm" size={18} className="text-warning-text" />
          Vencendo em 48 h:
        </span>
        <span className="text-[14px] font-bold text-warning-text">{formatNumber(testes.vencendo48h)}</span>
      </div>
    </section>
  );
}
