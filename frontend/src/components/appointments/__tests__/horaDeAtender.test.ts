import { describe, expect, it } from 'vitest';
import { agendamentosNaHora, rotuloDaHora } from '../horaDeAtender';
import type { Appointment } from '@/types';

const ag = (over: Partial<Appointment>): Appointment => ({
  id: 'a', business_id: 'b', client_id: 'c', professional_id: 'p', service_id: 's',
  date: '2026-11-11', time: '14:00', status: 'confirmado', reminder_sent: false, created_at: '', ...over,
});

const HOJE = '2026-11-11';
const as14h05 = 14 * 60 + 5;

describe('agendamentosNaHora', () => {
  it('traz só confirmados de hoje cujo horário já chegou', () => {
    const lista = [
      ag({ id: 'ok', time: '14:00' }),
      ag({ id: 'futuro', time: '15:00' }),
      ag({ id: 'amanha', date: '2026-11-12', time: '09:00' }),
      ag({ id: 'iniciado', status: 'em_atendimento', time: '13:00' }),
      ag({ id: 'cancelado', status: 'cancelado', time: '13:00' }),
      ag({ id: 'sinal', status: 'aguardando_pagamento', time: '13:00' }),
    ];
    expect(agendamentosNaHora(lista, HOJE, as14h05).map((i) => i.agendamento.id)).toEqual(['ok']);
  });

  it('aceita a data com hora (ISO) e ordena pelo horário', () => {
    const lista = [ag({ id: 'b', date: '2026-11-11T00:00:00.000Z', time: '14:00' }), ag({ id: 'a', date: '2026-11-11T00:00:00.000Z', time: '13:30' })];
    expect(agendamentosNaHora(lista, HOJE, as14h05).map((i) => i.agendamento.id)).toEqual(['a', 'b']);
  });

  it('exatamente na hora conta; até 10 minutos é "na hora", depois é atrasado', () => {
    const lista = [ag({ time: '14:00' })];
    expect(agendamentosNaHora(lista, HOJE, 14 * 60)[0]).toMatchObject({ minutosDesde: 0, atrasado: false });
    expect(agendamentosNaHora(lista, HOJE, 14 * 60 + 10)[0].atrasado).toBe(false);
    expect(agendamentosNaHora(lista, HOJE, 14 * 60 + 11)[0].atrasado).toBe(true);
  });
});

describe('rotuloDaHora', () => {
  it('escreve o rótulo', () => {
    expect(rotuloDaHora({ minutosDesde: 3, atrasado: false })).toBe('Na hora');
    expect(rotuloDaHora({ minutosDesde: 25, atrasado: true })).toBe('Atrasado há 25 min');
    expect(rotuloDaHora({ minutosDesde: 65, atrasado: true })).toBe('Atrasado há 1h05');
    expect(rotuloDaHora({ minutosDesde: 120, atrasado: true })).toBe('Atrasado há 2h');
  });
});
