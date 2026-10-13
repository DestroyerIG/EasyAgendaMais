// Padrão único de expediente para negócio sem linha em business_settings.
// Precisa bater com os DEFAULTs da tabela (prisma/schema.prisma, model BusinessSettings)
// e com o formulário de Ajustes no frontend.
export const BUSINESS_SCHEDULE_DEFAULTS = Object.freeze({
  openingTime: '09:00',
  closingTime: '20:00',
  slotIntervalMinutes: 30,
  allowWalkins: true,
  autoConfirmAppointments: false,
});
