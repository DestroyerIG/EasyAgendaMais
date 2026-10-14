'use client';

import { useState } from 'react';
import { Button, Field, Input, Icon } from '@/components/ui';
import { parseValorBR } from '@/lib/formatters';

export interface AbrirCaixaInlineProps {
  carregando: boolean;
  rotuloBotao: string;
  onAbrir: (saldoInicial: number) => void;
}

export function AbrirCaixaInline({ carregando, rotuloBotao, onAbrir }: AbrirCaixaInlineProps) {
  const [saldo, setSaldo] = useState('');
  // Campo vazio abre com saldo zero; texto que não é valor bloqueia o botão.
  const valor = saldo.trim() === '' ? 0 : parseValorBR(saldo);
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
      <Button disabled={carregando || valor === null} loading={carregando} onClick={() => { if (valor !== null) onAbrir(valor); }}>
        {carregando ? null : <Icon name="lock_open" size={18} />}
        {rotuloBotao}
      </Button>
    </div>
  );
}

export interface ReabrirCaixaInlineProps {
  carregando: boolean;
  onReabrir: () => void;
}

/** Caixa de hoje já fechado: oferece reabrir para lançar a comanda que ficou para trás. */
export function ReabrirCaixaInline({ carregando, onReabrir }: ReabrirCaixaInlineProps) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
        <Icon name="lock" size={18} className="text-warning-text" />
        <span>O caixa de hoje já foi fechado</span>
      </p>
      <Button disabled={carregando} loading={carregando} onClick={onReabrir}>
        {carregando ? null : <Icon name="lock_open" size={18} />}
        Reabrir caixa e fechar comanda
      </Button>
    </div>
  );
}
