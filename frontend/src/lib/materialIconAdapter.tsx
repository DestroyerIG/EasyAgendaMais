import type { LucideIcon } from 'lucide-react';
import { Icon } from '@/components/ui';

/**
 * Componentes compartilhados (`IconButton`, `EmptyState`, `ModalFooter`) tipam `icon` como
 * `LucideIcon` e só leem `className` do componente que recebem. Os usos aqui precisam do
 * Material Symbol correspondente, não de um ícone lucide — este adaptador embrulha um nome de
 * Material Symbol como um componente compatível com `LucideIcon`, preservando o tamanho visual
 * que cada chamador pedia via classes utilitárias `h-*` (mesma escala usada localmente antes:
 * h-4 = 16px, h-5 = 20px, h-10 = 40px), sem duplicar a marcação dos componentes compartilhados.
 */
const SIZE_CLASS_TO_PX: Record<string, number> = {
  'h-4': 16,
  'h-5': 20,
  'h-10': 40,
};

function sizeFromClassName(className?: string): number | undefined {
  if (!className) return undefined;
  for (const token of className.split(/\s+/)) {
    if (token in SIZE_CLASS_TO_PX) return SIZE_CLASS_TO_PX[token];
  }
  return undefined;
}

export function materialIcon(name: string, filled = false): LucideIcon {
  function Adapted({ className }: { className?: string }) {
    return <Icon name={name} filled={filled} size={sizeFromClassName(className)} className={className} />;
  }
  Adapted.displayName = `MaterialIcon(${name})`;
  return Adapted as unknown as LucideIcon;
}
