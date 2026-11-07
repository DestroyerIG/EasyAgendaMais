'use client';

import type { FormaSinal } from '@/lib/publicBooking';
import { cn } from '@/lib/cn';

const OPCOES: Record<FormaSinal, { titulo: string; detalhe: string }> = {
  pix: { titulo: 'Pix', detalhe: 'Código copia e cola na hora' },
  cartao: { titulo: 'Cartão', detalhe: 'Crédito ou débito, à vista, no Mercado Pago' },
};

/** Só aparece quando o negócio liberou mais de uma forma. O Pix vem primeiro. */
export function EscolhaFormaPagamento({
  formas,
  valor,
  onChange,
}: {
  formas: FormaSinal[];
  valor: FormaSinal;
  onChange: (forma: FormaSinal) => void;
}) {
  if (formas.length < 2) return null;
  const ordenadas = (['pix', 'cartao'] as const).filter((f) => formas.includes(f));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold text-muted">Como você quer pagar o sinal</legend>
      {ordenadas.map((forma) => (
        <label
          key={forma}
          className={cn(
            'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border bg-bg px-3.5 py-2.5',
            valor === forma ? 'border-brand' : 'border-line',
          )}
        >
          <input
            type="radio"
            name="forma-pagamento"
            checked={valor === forma}
            onChange={() => onChange(forma)}
            className="h-5 w-5 shrink-0 accent-brand"
          />
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-ink">{OPCOES[forma].titulo}</span>
            <span className="text-xs text-muted">{OPCOES[forma].detalhe}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
