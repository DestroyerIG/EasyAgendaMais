import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA, pct } from './formato';

export function CartaoCancelamentos({ cancelamentos }: { cancelamentos: AdminVisaoGeral['cancelamentos'] }) {
  const { cancelamentosMes, receitaCancelada, retencaoPct } = cancelamentos;
  return (
    <section aria-labelledby="vg-cancelamentos" className={cn(CAIXA, 'flex flex-col justify-between gap-4 p-5 sm:p-6')}>
      <div>
        <h2 id="vg-cancelamentos" className="mb-3 text-[13px] font-semibold text-muted">
          Cancelamentos do mês
        </h2>
        <p className="mb-1 flex items-baseline gap-1.5">
          <span className="text-[36px] font-bold leading-none tracking-tight text-ink">{formatNumber(cancelamentosMes)}</span>
          <span className="text-[15px] font-semibold text-muted">{cancelamentosMes === 1 ? 'conta' : 'contas'}</span>
        </p>
        <p className="text-[13px] text-muted">
          Receita cancelada no período:{' '}
          <span className="font-semibold text-danger">{formatCurrency(receitaCancelada)}</span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-control bg-surface-2 p-2.5">
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          <Icon name="verified" size={18} />
          Pagantes do mês anterior que seguem
        </span>
        <span className="text-[14px] font-bold text-ink">Retenção {pct(retencaoPct)}</span>
      </div>
    </section>
  );
}
