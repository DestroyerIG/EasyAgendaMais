'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface SecaoRecolhivelProps {
  titulo: string;
  subtitulo?: ReactNode;
  icone: string;
  /** Classes da caixa do ícone (cor de fundo/texto). */
  iconeClassName?: string;
  /** Ação à direita do título (ex.: abas, link). */
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Card de seção da ficha da cliente. No celular (Stitch e3b0b0) o conteúdo recolhe pelo
 * botão do cabeçalho; a partir de lg fica sempre aberto. O conteúdo recolhido só some
 * por CSS, para não perder rascunho de campo nem recarregar dados ao reabrir.
 */
export function SecaoRecolhivel({ titulo, subtitulo, icone, iconeClassName, acao, children, className }: SecaoRecolhivelProps) {
  const [aberta, setAberta] = useState(true);
  const idConteudo = useId();

  return (
    <section className={cn('rounded-2xl bg-surface p-4 shadow-sm sm:p-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink', iconeClassName)}>
            <Icon name={icone} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-ink">{titulo}</h2>
            {subtitulo ? <div className="text-[12px] text-muted">{subtitulo}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => setAberta((a) => !a)}
            aria-expanded={aberta}
            aria-controls={idConteudo}
            aria-label={aberta ? `Recolher ${titulo}` : `Mostrar ${titulo}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <Icon name={aberta ? 'expand_less' : 'expand_more'} size={22} />
          </button>
        </div>
        {acao ? <div className={cn(!aberta && 'hidden lg:block')}>{acao}</div> : null}
      </div>
      <div id={idConteudo} className={cn('mt-4', !aberta && 'hidden lg:block')}>
        {children}
      </div>
    </section>
  );
}
