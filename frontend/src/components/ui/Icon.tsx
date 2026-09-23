import { cn } from '@/lib/cn';

export interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}

// Ícone Material Symbols. O nome do símbolo é o conteúdo do elemento (ligadura da fonte).
export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: `${size}px` }}
      className={cn('material-symbols-outlined leading-none', filled && 'fill', className)}
    >
      {name}
    </span>
  );
}
