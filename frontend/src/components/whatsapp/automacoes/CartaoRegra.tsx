'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { RegraDto } from '@/lib/whatsappAutomacoes';

interface CartaoRegraProps {
  regra: RegraDto;
  /** Resultado do mês ("38 faltas evitadas este mês"); "—" enquanto carrega. */
  numero: string;
  descricao: string;
  titulo: string;
  /** Ícone da linha de rodapé (quando a regra dispara). */
  icone: string;
  /** Quando a regra dispara, montado da config ("24h antes · 09:00"). */
  quando: string;
  onAlternar(ativa: boolean): void;
  onConfigurar(): void;
  className?: string;
}

export function CartaoRegra({ regra, numero, descricao, titulo, icone, quando, onAlternar, onConfigurar, className }: CartaoRegraProps) {
  const ativa = regra.ativa;
  return (
    <article
      className={cn(
        'relative flex flex-col justify-between rounded-xl border border-line bg-surface p-6 shadow-sm transition-colors hover:border-ink/20',
        className,
      )}
    >
      <div>
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className={cn('h-2 w-2 rounded-full', ativa ? 'bg-whatsapp' : 'bg-muted')} aria-hidden="true" />
            <span className={cn('text-[11px] font-bold uppercase leading-4 tracking-wider', ativa ? 'text-whatsapp' : 'text-muted')}>
              {ativa ? 'Ativo' : 'Pausado'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ativa}
            aria-label={`Alternar automação ${titulo}`}
            onClick={() => onAlternar(!ativa)}
            className={cn(
              'relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
              ativa ? 'bg-whatsapp' : 'bg-line',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('block h-5 w-5 rounded-full bg-surface shadow-md transition-transform', ativa ? 'translate-x-5' : 'translate-x-0')}
            />
          </button>
        </div>
        <h3 className="mb-1 text-[17px] font-semibold leading-6 text-ink">{titulo}</h3>
        <div className="mb-4 inline-flex items-center gap-1 rounded-md bg-whatsapp/12 px-2 py-1 text-[11px] leading-4 text-whatsapp">
          <Icon name="check_circle" size={16} />
          <span className="font-bold">{numero}</span>
        </div>
        <p className="mb-4 text-[14px] leading-5 text-muted">{descricao}</p>
        <div className="mb-4 rounded-lg bg-surface-2 p-2">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Prévia da mensagem</div>
          <p className="whitespace-pre-line break-words font-mono text-xs leading-relaxed text-ink">{`"${regra.texto}"`}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <div className="flex items-center gap-1 text-[11px] font-semibold leading-4 text-muted">
          <Icon name={icone} size={16} />
          <span>{quando}</span>
        </div>
        <button
          type="button"
          onClick={onConfigurar}
          className="inline-flex items-center gap-1 rounded text-[13px] font-bold leading-[18px] text-ink transition-colors hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span>Configurar regra</span>
          <Icon name="chevron_right" size={16} />
        </button>
      </div>
    </article>
  );
}
