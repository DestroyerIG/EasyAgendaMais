import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { rotuloSegmento } from '@/lib/adminRotulos';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA, SEM_DADO, pct } from '../formato';

/** Meta de conversão de teste para pago, em %. Linha de referência das barras e do cartão geral. */
export const META_CONVERSAO_PCT = 25;

const ICONE_SEGMENTO: Record<string, string> = {
  barbearia: 'content_cut',
  unhas: 'brush',
  cilios_sobrancelhas: 'visibility',
  cabelo: 'spa',
  estetica: 'health_and_beauty',
  outro: 'storefront',
};

type Segmento = AdminVisaoGeral['conversao']['segmentos'][number];

/** Barra da taxa com a marca da meta. Abaixo da meta, a barra fica em alerta. */
export function BarraConversao({ taxaPct, className }: { taxaPct: number | null; className?: string }) {
  const largura = Math.min(Math.max(taxaPct ?? 0, 0), 100);
  const abaixo = taxaPct !== null && taxaPct < META_CONVERSAO_PCT;
  return (
    <div aria-hidden="true" className={cn('relative h-2 w-full rounded-full bg-line', className)}>
      <div
        className={cn('h-full rounded-full', abaixo ? 'bg-warning' : 'bg-brand')}
        style={{ width: `${largura}%` }}
      />
      <div
        className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink/60"
        style={{ left: `${META_CONVERSAO_PCT}%` }}
      />
    </div>
  );
}

function ColunaSegmento({ s }: { s: Segmento }) {
  return (
    <li className="flex flex-col rounded-card bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-ink">{rotuloSegmento(s.segmento)}</h3>
        <Icon name={ICONE_SEGMENTO[s.segmento] ?? 'storefront'} size={20} className="text-muted" />
      </div>
      <p className="mb-2 text-[24px] font-extrabold leading-tight text-ink">{pct(s.taxaPct)}</p>
      <BarraConversao taxaPct={s.taxaPct} className="mb-3" />
      <dl className="space-y-1.5 text-[13px] text-muted">
        <div className="flex justify-between gap-2">
          <dt>Testes no período:</dt>
          <dd className="font-bold text-ink">{formatNumber(s.criados)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Pagantes:</dt>
          <dd className="font-bold text-ink">{formatNumber(s.pagantes)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Ticket médio:</dt>
          <dd className="font-bold text-ink">
            {s.ticketMedio === null ? SEM_DADO : `${formatCurrency(s.ticketMedio)}/mês`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function ConversaoPorSegmento({ segmentos }: { segmentos: Segmento[] }) {
  return (
    <section aria-labelledby="vg-segmentos" className={cn(CAIXA, 'p-5 sm:p-8')}>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Icon name="donut_small" size={20} className="text-brand-text" />
            <h2 id="vg-segmentos" className="text-lg font-bold text-ink">
              Conversão de teste para pago por segmento
            </h2>
          </div>
          <p className="text-[13px] text-muted">Negócios criados nos últimos 30 dias e quantos deles já pagaram.</p>
        </div>
        <div className="flex items-center gap-3 self-start rounded-control bg-surface-2 px-3 py-1.5 text-[12px] text-ink lg:self-auto">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            Conversão real
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-0.5 rounded-full bg-ink/60" />
            Meta de {META_CONVERSAO_PCT}%
          </span>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {segmentos.map((s) => (
          <ColunaSegmento key={s.segmento} s={s} />
        ))}
      </ul>
    </section>
  );
}
