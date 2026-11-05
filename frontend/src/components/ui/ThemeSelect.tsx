'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

const OPTIONS = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
] as const;

// `compacto` põe o ícone sobre o texto, em três colunas iguais, para caber nos menus estreitos.
export function ThemeSelect({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? 'system' : undefined;
  const selectedIndex = OPTIONS.findIndex((option) => option.value === current);

  // Um radiogroup anda pelas setas: Tab entra e sai, as setas escolhem.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    setTheme(OPTIONS[next].value);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Tema" className={cn(compacto ? 'grid grid-cols-3' : 'inline-flex', 'gap-1 rounded-control border border-line bg-surface-2 p-1', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }, index) => {
        const selected = current === value;
        return (
          <button
            key={value}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-[8px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              compacto ? 'min-w-0 flex-col justify-center gap-0.5 px-1 py-1 text-[12px]' : 'gap-2 px-3 text-[13px] lg:min-h-9',
              selected ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
