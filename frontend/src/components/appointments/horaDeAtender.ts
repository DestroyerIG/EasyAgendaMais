/**
 * "Hora de atender": agendamentos confirmados de hoje cujo horário já chegou e que ainda não
 * começaram. Alimenta a faixa no topo da Agenda, com o botão Iniciar sempre à vista.
 */
import type { Appointment } from '@/types';

/** Até quantos minutos depois do horário ainda é "na hora"; depois disso, "atrasado". */
export const LIMITE_NA_HORA_MIN = 10;

export interface HoraDeAtender {
  agendamento: Appointment;
  /** Minutos desde o horário marcado (0 = exatamente na hora). */
  minutosDesde: number;
  atrasado: boolean;
}

const emMinutos = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

export function agendamentosNaHora(lista: Appointment[], hoje: string, agoraMinutos: number): HoraDeAtender[] {
  return lista
    .filter((a) => a.status === 'confirmado' && a.date.slice(0, 10) === hoje && emMinutos(a.time) <= agoraMinutos)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((agendamento) => {
      const minutosDesde = agoraMinutos - emMinutos(agendamento.time);
      return { agendamento, minutosDesde, atrasado: minutosDesde > LIMITE_NA_HORA_MIN };
    });
}

/** "Na hora", "Atrasado há 25 min", "Atrasado há 1h05". */
export function rotuloDaHora(item: Pick<HoraDeAtender, 'minutosDesde' | 'atrasado'>): string {
  if (!item.atrasado) return 'Na hora';
  const { minutosDesde: m } = item;
  if (m < 60) return `Atrasado há ${m} min`;
  const resto = m % 60;
  return `Atrasado há ${Math.floor(m / 60)}h${resto ? String(resto).padStart(2, '0') : ''}`;
}
