'use client';

import { useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';

// Maquininha sem integração (qualquer marca): o sistema só mostra o valor a digitar. Quem fecha a
// comanda confirma o recebimento, como sempre.

export function GuiaMaquininha({ total }: { total: number }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(total.toFixed(2).replace('.', ','));
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <section aria-label="Cobrar na maquininha" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <Icon name="credit_card" size={20} className="text-brand-text" />
        Digite na maquininha
      </span>
      <span className="text-[28px] font-extrabold tabular-nums text-brand-text">{formatCurrency(total)}</span>
      <p className="text-[13px] text-muted">Depois que o cliente pagar, feche a comanda.</p>
      <Button type="button" variant="secondary" fullWidth onClick={copiar}>
        <Icon name="content_copy" size={18} />
        Copiar valor
      </Button>
      {copiado && <p role="status" className="text-[13px] font-semibold text-success-text">Valor copiado.</p>}
    </section>
  );
}
