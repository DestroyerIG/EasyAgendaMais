import { cn } from '@/lib/cn';

export type AppointmentStatus = 'confirmado' | 'aguardando' | 'em_atendimento' | 'concluido' | 'faltou' | 'cancelado';

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
};

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed/12 text-status-confirmed',
  aguardando: 'bg-warning/12 text-warning-text',
  em_atendimento: 'bg-brand/12 text-brand-text',
  concluido: 'bg-success/12 text-success-text',
  faltou: 'bg-danger/12 text-danger',
  cancelado: 'bg-muted/12 text-muted line-through',
};

// Faixa vertical da linha de agenda, na cor do status.
export const STATUS_STRIPE_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed',
  aguardando: 'bg-warning',
  em_atendimento: 'bg-brand',
  concluido: 'bg-success',
  faltou: 'bg-danger',
  cancelado: 'bg-muted',
};

export interface StatusChipProps {
  status: AppointmentStatus;
  className?: string;
  // Bolinha na cor do status antes do rótulo. Opcional porque só a Agenda no celular
  // (agenda-mobile.html) desenha essa bolinha; as outras telas mostram o chip liso.
  comPonto?: boolean;
}

export function StatusChip({ status, className, comPonto = false }: StatusChipProps) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold', STATUS_CLASS[status], className)}
    >
      {comPonto && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_STRIPE_CLASS[status])} />}
      {STATUS_LABEL[status]}
    </span>
  );
}
