'use client';

/**
 * Cartão de agendamento da Agenda no celular (agenda-mobile.html).
 *
 * Dado real: horário, cliente, valor, serviço, profissional e status vêm de
 * GET /appointments; as duas ações do gesto chamam o mesmo handler de mudança de
 * status que a tela já usava.
 * Dado de exemplo: a duração embaixo do horário (conteudoDemo.agenda.duracaoPadraoMinutos),
 * porque o DTO de /appointments não devolve a duração do serviço.
 * Fora da tela: o "encaixe rápido" e a ação de cobrar sinal por Pix do arquivo de
 * referência, que dependem de funções que não existem.
 *
 * O arquivo de referência escreve "Marcar Falta" na ação vermelha. O sistema só tem
 * os status confirmado, concluído e cancelado — não existe falta — então a ação leva
 * o nome da transição que ela realmente faz, "Cancelar", para o cartão não prometer
 * um estado que o registro nunca vai ter.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import { Icon, StatusChip, STATUS_STRIPE_CLASS } from '@/components/ui';
import { formatarDuracao, paraMinutos, paraHoraTexto } from './LinhaDoTempo';
import type { Appointment } from '@/types';

/** Arrasto máximo e ponto de virada do gesto, em pixels (agenda-mobile.html). */
export const LIMITE_ARRASTE = 120;
export const VIRADA_ARRASTE = 60;
export const ABERTURA_ARRASTE = 80;

/** Onde o cartão para quando o dedo sai: aberto num dos lados ou de volta ao lugar. */
export function encaixarArraste(deslocamento: number): number {
  if (deslocamento > VIRADA_ARRASTE) return ABERTURA_ARRASTE;
  if (deslocamento < -VIRADA_ARRASTE) return -ABERTURA_ARRASTE;
  return 0;
}

interface CorpoCartaoProps {
  appointment: Appointment;
  duracaoMinutos: number;
}

/** Miolo do cartão, compartilhado com a agenda de um profissional só. */
export function CorpoCartaoAgendamento({ appointment, duracaoMinutos }: CorpoCartaoProps) {
  const inicioMinutos = paraMinutos(appointment.time);
  const cancelado = appointment.status === 'cancelado';

  return (
    <>
      <div className="flex min-w-[56px] flex-col items-center justify-center text-center">
        <span className="text-[24px] font-bold leading-none tracking-tight tabular-nums text-ink">
          {paraHoraTexto(inicioMinutos)}
        </span>
        <span className="mt-1 text-[11px] font-semibold text-muted">{formatarDuracao(duracaoMinutos)}</span>
      </div>
      <div className={cn('w-1 shrink-0 self-stretch rounded-full', STATUS_STRIPE_CLASS[appointment.status])} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn('truncate text-[17px] font-semibold text-ink', cancelado && 'line-through')}>
            {appointment.client_name}
          </h3>
          <span className="shrink-0 text-[17px] font-bold tabular-nums text-ink">
            {formatCurrency(Number(appointment.service_price || 0), { cents: false })}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="truncate text-[14px] text-ink">{appointment.service_name}</span>
          {appointment.professional_name && (
            <>
              <span className="text-muted">·</span>
              <span className="truncate text-[13px] font-semibold text-muted">{appointment.professional_name}</span>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <StatusChip status={appointment.status} className="text-[11px]" />
        </div>
      </div>
    </>
  );
}

interface AppointmentCardProps {
  appointment: Appointment;
  actionLoading: string | null;
  duracaoMinutos: number;
  onStatusChange: (id: string, status: 'concluido' | 'cancelado') => void;
}

export function AppointmentCard({
  appointment,
  actionLoading,
  duracaoMinutos,
  onStatusChange,
}: AppointmentCardProps) {
  const isLoading = actionLoading === appointment.id;
  // Só o agendamento confirmado tem transição de status; nos outros não há o que revelar.
  const podeAgir = appointment.status === 'confirmado';
  const cliente = appointment.client_name || 'Cliente';

  const [deslocamento, setDeslocamento] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const origemRef = useRef<number | null>(null);

  const iniciarArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    if (!podeAgir) return;
    origemRef.current = evento.clientX - deslocamento;
    setArrastando(true);
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
  };

  const moverArraste = (evento: ReactPointerEvent<HTMLDivElement>) => {
    if (origemRef.current === null) return;
    const x = evento.clientX - origemRef.current;
    setDeslocamento(Math.max(-LIMITE_ARRASTE, Math.min(LIMITE_ARRASTE, x)));
  };

  const soltarArraste = () => {
    if (origemRef.current === null) return;
    origemRef.current = null;
    setArrastando(false);
    setDeslocamento((atual) => encaixarArraste(atual));
  };

  const agir = (status: 'concluido' | 'cancelado') => {
    setDeslocamento(0);
    onStatusChange(appointment.id, status);
  };

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-surface">
      {podeAgir && (
        // Camada de ações do gesto. Os dois botões são de verdade e recebem foco pelo
        // teclado; ao receber foco, o cartão desliza para o lado de quem está em foco,
        // que é a alternativa acessível ao arrasto.
        <div className="absolute inset-0 flex items-stretch justify-between">
          <button
            type="button"
            disabled={isLoading}
            onFocus={() => setDeslocamento(ABERTURA_ARRASTE)}
            onBlur={() => setDeslocamento(0)}
            onClick={() => agir('concluido')}
            aria-label={`Concluir atendimento de ${cliente}`}
            className="flex items-center gap-2 bg-success px-5 text-[13px] font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            <Icon name="check_circle" size={22} />
            Concluir
          </button>
          <button
            type="button"
            disabled={isLoading}
            onFocus={() => setDeslocamento(-ABERTURA_ARRASTE)}
            onBlur={() => setDeslocamento(0)}
            onClick={() => agir('cancelado')}
            aria-label={`Cancelar agendamento de ${cliente}`}
            className="flex items-center gap-2 bg-danger px-5 text-[13px] font-semibold text-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          >
            Cancelar
            <Icon name="cancel" size={22} />
          </button>
        </div>
      )}

      <div
        onPointerDown={iniciarArraste}
        onPointerMove={moverArraste}
        onPointerUp={soltarArraste}
        onPointerCancel={soltarArraste}
        className={cn(
          'relative flex touch-pan-y items-stretch gap-3 bg-surface p-3.5',
          !arrastando && 'transition-transform duration-200',
        )}
        style={{ transform: `translateX(${deslocamento}px)` }}
      >
        <CorpoCartaoAgendamento appointment={appointment} duracaoMinutos={duracaoMinutos} />
      </div>
    </div>
  );
}
