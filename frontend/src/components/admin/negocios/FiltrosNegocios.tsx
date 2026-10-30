import { Icon, controlClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import { PLANOS_ADMIN, ROTULO_PLANO, ROTULO_SEGMENTO, ROTULO_STATUS, SEGMENTOS_ADMIN, STATUS_ADMIN } from '@/lib/adminRotulos';
import type { FiltrosNegocios as Filtros, ListaNegocios, StatusAdmin } from '@/types/admin';

export const PLACEHOLDER_BUSCA = 'Buscar por nome, e-mail, WhatsApp ou CPF/CNPJ';

interface Props {
  filtros: Filtros;
  segmentos: ListaNegocios['segmentos'];
  texto: string;
  onTexto: (texto: string) => void;
  onFiltro: (mudanca: Partial<Filtros>) => void;
}

function Pilula({ ativa, rotulo, total, onClick }: { ativa: boolean; rotulo: string; total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
        ativa ? 'bg-ink font-bold text-bg' : 'bg-surface-2 text-muted hover:text-ink',
      )}
    >
      {rotulo}
      <span className={cn('text-[12px]', ativa ? 'opacity-80' : 'opacity-70')}>({formatNumber(total)})</span>
    </button>
  );
}

function Seletor({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
}) {
  return (
    <label className="relative flex min-w-[200px] items-center">
      <span className="sr-only">{rotulo}</span>
      <select
        aria-label={rotulo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlClass, 'h-11 appearance-none pr-9 text-[14px]')}
      >
        <option value="">{rotulo}: Todos</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Icon name="expand_more" size={18} className="pointer-events-none absolute right-3 text-muted" />
    </label>
  );
}

export function FiltrosNegocios({ filtros, segmentos, texto, onTexto, onFiltro }: Props) {
  const contagem = new Map(segmentos.map((s) => [s.segmento, s.total]));
  const todos = segmentos.reduce((soma, s) => soma + s.total, 0);

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Segmento">
        <Pilula ativa={!filtros.segmento} rotulo="Todos" total={todos} onClick={() => onFiltro({ segmento: undefined })} />
        {SEGMENTOS_ADMIN.map((s) => (
          <Pilula
            key={s}
            ativa={filtros.segmento === s}
            rotulo={ROTULO_SEGMENTO[s]}
            total={contagem.get(s) ?? 0}
            onClick={() => onFiltro({ segmento: s })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Icon name="search" size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            placeholder={PLACEHOLDER_BUSCA}
            aria-label="Buscar negócio"
            className={cn(controlClass, 'h-11 pl-10 pr-10 text-[14px]')}
          />
          {texto && (
            <button
              type="button"
              onClick={() => onTexto('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:text-ink"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Seletor
            rotulo="Status"
            valor={filtros.status ?? ''}
            onChange={(v) => onFiltro({ status: (v || undefined) as StatusAdmin | undefined })}
            opcoes={STATUS_ADMIN.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] }))}
          />
          <Seletor
            rotulo="Plano"
            valor={filtros.plano ?? ''}
            onChange={(v) => onFiltro({ plano: v || undefined })}
            opcoes={PLANOS_ADMIN.map((p) => ({ valor: p, rotulo: ROTULO_PLANO[p] }))}
          />
        </div>
      </div>
    </div>
  );
}
