'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type MouseEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlClass, invalidClass } from './Input';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  toggleLabel?: string;
  invalid?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleLabel = 'senha', id, invalid, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [isVisible, setIsVisible] = useState(false);

    const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    };

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={inputId}
          type={isVisible ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={cn(controlClass, 'h-11 pr-12', invalid && invalidClass, className)}
        />
        <button
          type="button"
          aria-label={isVisible ? `Ocultar ${toggleLabel}` : `Mostrar ${toggleLabel}`}
          aria-pressed={isVisible}
          aria-controls={inputId}
          onMouseDown={handleMouseDown}
          onClick={() => setIsVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center rounded-r-control px-3 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50"
        >
          {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
