'use client';

import { cn } from '@/lib/cn';

interface SwitchDisponibilidadeProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Lido por leitor de tela, ex.: "Ana Souza disponível". */
  label: string;
  disabled?: boolean;
}

/** Botão de ligar/desligar sem cartão em volta: cabe em cabeçalho, card e lista. */
export function SwitchDisponibilidade({ checked, onCheckedChange, label, disabled }: SwitchDisponibilidadeProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn('relative inline-flex h-7 w-12 items-center rounded-full transition-colors', checked ? 'bg-success' : 'bg-line')}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  );
}
