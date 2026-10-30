import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA, SEM_DADO, pctComSinal } from './formato';

export function CartaoMrr({ mrr }: { mrr: AdminVisaoGeral['mrr'] }) {
  const v = mrr.variacaoPct;
  return (
    <section
      aria-labelledby="vg-mrr"
      className={cn(CAIXA, 'relative flex flex-col justify-between gap-4 overflow-hidden p-5 sm:p-6')}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-brand/5" />
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="vg-mrr" className="text-[13px] font-semibold text-muted">
            Receita recorrente (MRR)
          </h2>
          <span
            title="Em relação ao mês anterior"
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-bold',
              v === null && 'bg-surface-2 text-muted',
              v !== null && v >= 0 && 'bg-success/12 text-success-text',
              v !== null && v < 0 && 'bg-danger/12 text-danger',
            )}
          >
            {v === null ? SEM_DADO : pctComSinal(v)}
          </span>
        </div>
        <p className="text-[28px] font-bold leading-tight tracking-tight text-ink">{formatCurrency(mrr.mrr)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-2.5 text-center">
        <div>
          <dt className="text-[12px] text-muted">Novos</dt>
          <dd className="text-[14px] font-semibold text-success-text">{formatCurrency(mrr.novos)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">Churn</dt>
          <dd className="text-[14px] font-semibold text-danger">{formatCurrency(mrr.churn)}</dd>
        </div>
      </dl>
    </section>
  );
}
