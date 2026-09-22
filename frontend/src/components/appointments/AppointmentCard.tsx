'use client';

import { CheckCircle, XCircle } from 'lucide-react';
import { formatDateShort } from '@/lib/dateUtils';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { Card, IconButton, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import type { Appointment } from '@/types';

interface AppointmentCardProps {
  appointment: Appointment;
  actionLoading: string | null;
  onStatusChange: (id: string, status: 'concluido' | 'cancelado') => void;
}

export function AppointmentCard({ appointment, actionLoading, onStatusChange }: AppointmentCardProps) {
  const isLoading = actionLoading === appointment.id;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-stretch gap-3">
        <div className="flex min-w-[56px] flex-col items-center justify-center text-center">
          <p className="text-lg font-bold tabular-nums text-ink">{appointment.time?.substring(0, 5)}</p>
          <p className="text-[13px] text-muted">{formatDateShort(appointment.date.split('T')[0])}</p>
        </div>
        <div className={cn('w-1 shrink-0 self-stretch rounded-full', STATUS_STRIPE_CLASS[appointment.status])} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-ink">{appointment.client_name}</p>
            <span className="shrink-0 font-semibold text-muted">
              {formatCurrency(Number(appointment.service_price || 0))}
            </span>
          </div>
          <p className="truncate text-[15px] text-muted">
            {appointment.service_name}
            {appointment.client_phone ? ` · ${appointment.client_phone}` : ''}
          </p>
          <p className="truncate text-[13px] text-muted">{appointment.professional_name}</p>
          <StatusChip status={appointment.status} className="mt-1 self-start" />
        </div>
      </div>

      {appointment.status === 'confirmado' && (
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <IconButton
            icon={CheckCircle}
            label="Concluir atendimento"
            variant="secondary"
            onClick={() => onStatusChange(appointment.id, 'concluido')}
            disabled={isLoading}
            className={isLoading ? '[&_svg]:animate-spin' : undefined}
          />
          <IconButton
            icon={XCircle}
            label="Cancelar agendamento"
            variant="secondary"
            onClick={() => onStatusChange(appointment.id, 'cancelado')}
            disabled={isLoading}
            className={isLoading ? '[&_svg]:animate-spin' : undefined}
          />
        </div>
      )}
    </Card>
  );
}
