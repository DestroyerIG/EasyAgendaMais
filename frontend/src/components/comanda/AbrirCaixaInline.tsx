'use client';

import { useState } from 'react';
import { Button, Field, Input, Icon } from '@/components/ui';

export interface AbrirCaixaInlineProps {
  carregando: boolean;
  rotuloBotao: string;
  onAbrir: (saldoInicial: number) => void;
}

export function AbrirCaixaInline({ carregando, rotuloBotao, onAbrir }: AbrirCaixaInlineProps) {
  const [saldo, setSaldo] = useState('');
  const valor = Number(saldo.replace(',', '.'));
  return (
    <div className="flex w-full flex-col gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <p className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          <Icon name="lock" size={18} className="text-warning-text" />
          <span>O caixa de hoje ainda não foi aberto</span>
        </p>
        <Field id="saldo-inicial-caixa" label="Saldo inicial em dinheiro">
          <Input id="saldo-inicial-caixa" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" />
        </Field>
      </div>
      <Button disabled={carregando || Number.isNaN(valor) || valor < 0} loading={carregando} onClick={() => onAbrir(Number.isNaN(valor) ? 0 : valor)}>
        {carregando ? null : <Icon name="lock_open" size={18} />}
        {rotuloBotao}
      </Button>
    </div>
  );
}
