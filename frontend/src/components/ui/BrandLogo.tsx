import Image from 'next/image';
import { cn } from '@/lib/cn';
import easyAgendaLogo from '@/icons/easyagenda-logo.png';

/**
 * Marca do EasyAgenda+ (calendário com check). Fonte única da logo nas telas:
 * trocar a logo é trocar `src/icons/easyagenda-logo.png`.
 */
export function BrandLogo({
  size = 32,
  className,
  priority,
  decorativa = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  /** Ao lado do nome escrito, a logo é decorativa e não precisa de texto alternativo. */
  decorativa?: boolean;
}) {
  return (
    <Image
      src={easyAgendaLogo}
      alt={decorativa ? '' : 'Logo EasyAgenda+'}
      width={size}
      height={size}
      priority={priority}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
