import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function fieldDescribedBy(id: string, { hint, error }: { hint?: string; error?: string }): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

interface ControlAria {
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  // Liga dica e erro ao controle aqui, para nenhuma tela precisar repetir o aria-describedby.
  // Só há um controle a anotar quando o campo tem exatamente um filho elemento.
  const control =
    Children.count(children) === 1 && isValidElement<ControlAria>(children)
      ? cloneElement(children, {
          'aria-describedby': children.props['aria-describedby'] ?? fieldDescribedBy(id, { hint, error }),
          'aria-required': children.props['aria-required'] ?? (required || undefined),
        })
      : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
