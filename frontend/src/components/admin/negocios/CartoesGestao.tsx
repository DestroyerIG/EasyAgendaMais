import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { CartoesGestao as DadosCartoes } from '@/types/admin';
import { CAIXA, SEM_DADO, pct } from '../formato';

function Cartao({
  id,
  titulo,
  icone,
  tomIcone,
  valor,
  children,
}: {
  id: string;
  titulo: string;
  icone: string;
  tomIcone: string;
  valor: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn(CAIXA, 'flex flex-col justify-between gap-3 p-5')}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-[13px] font-semibold text-muted">
          {titulo}
        </h2>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-control', tomIcone)}>
          <Icon name={icone} size={18} />
        </span>
      </div>
      <p className="text-[28px] font-bold leading-none tracking-tight text-ink">{formatNumber(valor)}</p>
      <div className="space-y-0.5 text-[13px] text-muted">{children}</div>
    </section>
  );
}

const plural = (n: number, um: string, varios: string) => `${formatNumber(n)} ${n === 1 ? um : varios}`;

export function CartoesGestao({ cartoes: c }: { cartoes: DadosCartoes }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao id="gn-base" titulo="Base total" icone="storefront" tomIcone="bg-surface-2 text-ink" valor={c.base}>
        <p>{plural(c.pagantes, 'conta pagante', 'contas pagantes')}</p>
      </Cartao>
      <Cartao
        id="gn-ativas"
        titulo="Assinaturas ativas"
        icone="verified"
        tomIcone="bg-success/12 text-success-text"
        valor={c.pagantes}
      >
        <p>
          MRR <span className="font-semibold text-ink">{formatCurrency(c.mrr)}</span>
        </p>
        <p>
          Ticket médio{' '}
          <span className="font-semibold text-ink">
            {c.ticketMedio === null ? SEM_DADO : `${formatCurrency(c.ticketMedio)}/mês`}
          </span>
        </p>
      </Cartao>
      <Cartao
        id="gn-testes"
        titulo="Testes em andamento"
        icone="hourglass_top"
        tomIcone="bg-brand/12 text-brand-text"
        valor={c.testes}
      >
        <p className="font-semibold text-warning-text">{plural(c.testesVencemHoje, 'vence hoje', 'vencem hoje')}</p>
        <p>Conversão média de {pct(c.conversaoPct)}</p>
      </Cartao>
      <Cartao
        id="gn-inadimplencia"
        titulo="Alerta de inadimplência"
        icone="error_outline"
        tomIcone="bg-danger/12 text-danger"
        valor={c.inadimplentes}
      >
        <p className="font-semibold text-danger">{formatCurrency(c.valorPendente)} pendente</p>
        <p>{formatNumber(c.bloqueioTotal)} em bloqueio total</p>
      </Cartao>
    </div>
  );
}
