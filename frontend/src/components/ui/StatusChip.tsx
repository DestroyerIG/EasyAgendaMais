import { cn } from '@/lib/cn';

export type AppointmentStatus =
  | 'confirmado'
  | 'aguardando'
  | 'aguardando_pagamento'
  | 'em_atendimento'
  | 'concluido'
  | 'faltou'
  | 'cancelado';

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  aguardando_pagamento: 'Aguardando Pix',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
};

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed/12 text-status-confirmed',
  aguardando: 'bg-warning/12 text-warning-text',
  // Reserva pública segurando o horário até o sinal Pix ser confirmado. Usa o
  // tertiary (azul-ciano) porque warning (âmbar) já é "aguardando" e brand
  // (laranja) é "em atendimento" — precisa ser distinguível dos dois.
  aguardando_pagamento: 'bg-tertiary/12 text-tertiary',
  em_atendimento: 'bg-brand/12 text-brand-text',
  concluido: 'bg-success/12 text-success-text',
  faltou: 'bg-danger/12 text-danger',
  cancelado: 'bg-muted/12 text-muted line-through',
};

// Faixa vertical da linha de agenda, na cor do status.
export const STATUS_STRIPE_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed',
  aguardando: 'bg-warning',
  aguardando_pagamento: 'bg-tertiary',
  em_atendimento: 'bg-brand',
  concluido: 'bg-success',
  faltou: 'bg-danger',
  cancelado: 'bg-muted',
};

export interface StatusChipProps {
  status: AppointmentStatus;
  className?: string;
  // Bolinha na cor do status antes do rótulo. Usada pela Agenda no celular
  // (agenda-mobile.html, sem pulso) e pelo cabeçalho do painel de detalhes do
  // agendamento (agendamento-detalhes.html, com pulso via `pontoAnimado`).
  comPonto?: boolean;
  // `animate-ping` no ponto — só agendamento-detalhes.html:411 pede isso; a bolinha da
  // Agenda no celular fica parada.
  pontoAnimado?: boolean;
}

export function StatusChip({ status, className, comPonto = false, pontoAnimado = false }: StatusChipProps) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold', STATUS_CLASS[status], className)}
    >
      {comPonto && (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_STRIPE_CLASS[status], pontoAnimado && 'animate-ping')} />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
