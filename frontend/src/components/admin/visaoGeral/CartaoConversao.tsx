import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import type { ConversaoLinha } from '@/types/admin';
import { BarraConversao, META_CONVERSAO_PCT } from './ConversaoPorSegmento';
import { CAIXA, SEM_DADO, pct, pontos } from './formato';

export function CartaoConversao({ geral }: { geral: ConversaoLinha }) {
  const diferenca = geral.taxaPct === null ? null : geral.taxaPct - META_CONVERSAO_PCT;
  return (
    <section aria-labelledby="vg-conversao" className={cn(CAIXA, 'flex flex-col justify-between gap-4 p-5 sm:p-6')}>
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="vg-conversao" className="text-[13px] font-semibold text-muted">
            Conversão geral de teste para pago
          </h2>
          <span
            title={`Meta de ${META_CONVERSAO_PCT}%`}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-bold',
              diferenca === null && 'bg-surface-2 text-muted',
              diferenca !== null && diferenca >= 0 && 'bg-success/12 text-success-text',
              diferenca !== null && diferenca < 0 && 'bg-warning/12 text-warning-text',
            )}
          >
            {diferenca === null ? SEM_DADO : `${pontos(diferenca)} vs. meta`}
          </span>
        </div>
        <p className="text-[36px] font-bold leading-none tracking-tight text-ink">{pct(geral.taxaPct)}</p>
      </div>
      <div>
        <p className="mb-1.5 text-right text-[12px] font-semibold text-ink">
          {formatNumber(geral.pagantes)} de {formatNumber(geral.criados)} convertidos
        </p>
        <BarraConversao taxaPct={geral.taxaPct} />
      </div>
    </section>
  );
}
