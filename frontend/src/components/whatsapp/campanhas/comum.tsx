import type { ReactNode } from 'react';

export const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

interface CabecalhoPassoProps {
  numero: number;
  id: string;
  titulo: string;
  children?: ReactNode;
}

/** Cabeçalho das seções da Nova campanha: número, título e um selo opcional à direita. */
export function CabecalhoPasso({ numero, id, titulo, children }: CabecalhoPassoProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[13px] font-bold text-brand-text" aria-hidden="true">
          {numero}
        </span>
        <h2 id={id} className="text-[17px] font-bold text-ink">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}
