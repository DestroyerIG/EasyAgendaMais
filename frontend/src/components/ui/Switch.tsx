'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descriptionId = description ? `${switchId}-description` : undefined;

  return (
    <div className="flex items-start justify-between gap-4 rounded-control border border-line bg-surface p-4">
      <div>
        <label htmlFor={switchId} className="text-[15px] font-semibold text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-1 text-[13px] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            checked ? 'bg-brand' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
              checked ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </span>
      </button>
    </div>
  );
}
