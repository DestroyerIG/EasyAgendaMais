import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDataNegocio } from '@/lib/formatters';
import type { DetalheNegocio, StatusFatura } from '@/types/admin';
import { CAIXA } from '../formato';

const STATUS_FATURA: Record<StatusFatura, { rotulo: string; tom: string; ponto: string }> = {
  pago: { rotulo: 'Pago', tom: 'bg-success/12 text-success-text', ponto: 'bg-success' },
  em_aberto: { rotulo: 'Em aberto', tom: 'bg-warning/12 text-warning-text', ponto: 'bg-warning' },
  vencido: { rotulo: 'Vencido', tom: 'bg-danger/12 text-danger', ponto: 'bg-danger' },
  cancelado: { rotulo: 'Cancelado', tom: 'bg-muted/12 text-muted', ponto: 'bg-muted' },
  estornado: { rotulo: 'Estornado', tom: 'bg-muted/12 text-muted', ponto: 'bg-muted' },
};

const ROTULO_TIPO = { mensalidade: 'Mensalidade', upgrade: 'Mudança de plano' } as const;

interface Props {
  proximaCobranca: DetalheNegocio['proximaCobranca'];
  faturas: DetalheNegocio['faturas'];
}

export function LinhaDoTempoCobranca({ proximaCobranca, faturas }: Props) {
  // Mais recente primeiro.
  const ordenadas = faturas ? [...faturas].sort((a, b) => b.data.localeCompare(a.data)) : null;

  return (
    <section aria-labelledby="dn-cobranca" className={cn(CAIXA, 'p-5 sm:p-6')}>
      <p className="text-[12px] font-semibold text-muted">Faturamento</p>
      <h2 id="dn-cobranca" className="mb-4 text-[17px] font-bold text-ink">
        Linha do tempo de cobrança
      </h2>

      {proximaCobranca && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-control border border-brand/30 bg-brand/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <Icon name="event_upcoming" size={20} className="text-brand-text" />
            <p className="text-[14px] font-semibold text-ink">
              Próxima cobrança · {formatDataNegocio(proximaCobranca.data)}
            </p>
          </div>
          <span className="text-[15px] font-bold text-ink">{formatCurrency(proximaCobranca.valor)}</span>
        </div>
      )}

      {ordenadas === null ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Icon name="error_outline" size={18} className="text-warning-text" />
          Não foi possível carregar as faturas agora.
        </p>
      ) : ordenadas.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhuma fatura ainda.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {ordenadas.map((f) => {
            const s = STATUS_FATURA[f.status] ?? STATUS_FATURA.cancelado;
            return (
              <li key={f.id} className="relative">
                <span aria-hidden="true" className={cn('absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full', s.ponto)} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{formatDataNegocio(f.data)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', s.tom)}>{s.rotulo}</span>
                    <span className="text-[14px] font-semibold text-ink">{formatCurrency(f.valor)}</span>
                  </div>
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-text hover:underline"
                    >
                      2ª via
                      <Icon name="open_in_new" size={14} />
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {ROTULO_TIPO[f.tipo] ?? f.tipo} · {f.referencia} · {f.formaDetalhe || (f.forma === 'pix' ? 'Pix' : 'Cartão')}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
