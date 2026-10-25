import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';

/** A profissional fechou o atendimento pelo app e mandou a comanda para a recepção cobrar (fase 5). */
export function SeloProntaParaCobrar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand-text',
        className,
      )}
    >
      <Icon name="point_of_sale" size={14} className="shrink-0" />
      <span className="truncate">Pronta para cobrar</span>
    </span>
  );
}
