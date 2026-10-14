import { describe, it, expect } from 'vitest';
import { VALID_STATUS_TRANSITIONS } from '../modules/appointments/appointments.types.js';
import { APPOINTMENT_STATUSES, OCCUPYING_STATUSES } from '../config/appointmentStatus.js';

describe('status de agendamento', () => {
  it('tem os seis status', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(
      ['aguardando_pagamento', 'cancelado', 'concluido', 'confirmado', 'em_atendimento', 'faltou'].sort()
    );
  });

  it('em atendimento continua ocupando o horário', () => {
    expect(OCCUPYING_STATUSES).toEqual(['confirmado', 'em_atendimento']);
  });

  it('transições permitidas', () => {
    expect(VALID_STATUS_TRANSITIONS).toEqual({
      aguardando_pagamento: ['confirmado', 'cancelado'],
      confirmado: ['em_atendimento', 'concluido', 'faltou', 'cancelado'],
      em_atendimento: ['concluido', 'confirmado', 'cancelado'],
      concluido: [],
      faltou: [],
      cancelado: [],
    });
  });
});
