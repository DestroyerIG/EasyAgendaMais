// Conjunto final de status do agendamento (sub-projeto 2A).
export const APPOINTMENT_STATUSES = [
  'aguardando_pagamento',
  'confirmado',
  'em_atendimento',
  'concluido',
  'faltou',
  'cancelado',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// Status que seguram o horário da profissional. `aguardando_pagamento` também segura,
// mas só enquanto `expires_at` não passou — por isso fica fora desta lista e é tratado
// à parte em cada consulta.
export const OCCUPYING_STATUSES: AppointmentStatus[] = ['confirmado', 'em_atendimento'];
