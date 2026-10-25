/**
 * appointment.serializer.ts — molda Appointment (Prisma camelCase aninhado)
 * para o DTO plano em snake_case que o frontend consome.
 *
 * Corrige 3 problemas de exibição:
 *  - relações aninhadas (professional.name/service.price) → professional_name/service_price
 *  - `time` (DateTime 1970-01-01T..) → "HH:MM:SS"
 *  - `date` (UTC midnight) → "YYYY-MM-DDT00:00:00" local p/ evitar off-by-one no fuso BR
 */

interface RawAppointment {
  id: string;
  businessId?: string;
  clientId?: string;
  professionalId?: string;
  serviceId?: string;
  date: Date | string;
  time: Date | string;
  status: string;
  reminderSent?: boolean;
  createdAt?: Date | string;
  source?: string;
  depositAmount?: unknown;
  startedAt?: Date | string | null;
  clientConfirmedAt?: Date | string | null;
  comanda?: { id: string; status: string; number: number; totalCharged?: unknown; depositApplied?: unknown; enviadaRecepcaoEm?: Date | null } | null;
  client?: { name?: string; phone?: string } | null;
  professional?: { name?: string } | null;
  service?: { name?: string; price?: unknown; durationMinutes?: number } | null;
}

export interface AppointmentDto {
  id: string;
  business_id?: string;
  client_id?: string;
  professional_id?: string;
  service_id?: string;
  date: string;
  time: string;
  status: string;
  reminder_sent?: boolean;
  created_at?: string;
  client_name: string | null;
  client_phone: string | null;
  professional_name: string | null;
  service_name: string | null;
  service_price: number;
  service_duration_minutes: number;
  source: string;
  deposit_amount: number | null;
  started_at: string | null;
  /** Quando a cliente respondeu "1" à confirmação automática do WhatsApp. */
  client_confirmed_at: string | null;
  comanda_id: string | null;
  comanda_status: 'rascunho' | 'fechada' | null;
  comanda_number: number | null;
  /** Gravados no fechamento (null enquanto a comanda é rascunho ou não existe). */
  comanda_total_charged: number | null;
  comanda_deposit_applied: number | null;
  /** A profissional mandou pelo app para a recepção cobrar (selo "Pronta para cobrar"). */
  comanda_enviada_recepcao_em: string | null;
}

const dateToLocalIso = (d: Date | string): string => {
  if (typeof d === 'string') return d;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00`;
};

const timeToHms = (t: Date | string): string => {
  if (typeof t === 'string') return t.length >= 8 ? t.substring(0, 8) : t;
  if (!(t instanceof Date) || Number.isNaN(t.getTime())) return '';
  const h = String(t.getUTCHours()).padStart(2, '0');
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  const s = String(t.getUTCSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const priceToNumber = (p: unknown): number => {
  if (p === null || p === undefined) return 0;
  const n = Number(typeof p === 'object' ? String(p) : (p as string | number));
  return Number.isFinite(n) ? n : 0;
};

const nullablePrice = (p: unknown): number | null => (p === null || p === undefined ? null : priceToNumber(p));

export const toAppointmentDto = (a: RawAppointment): AppointmentDto => ({
  id: a.id,
  business_id: a.businessId,
  client_id: a.clientId,
  professional_id: a.professionalId,
  service_id: a.serviceId,
  date: dateToLocalIso(a.date),
  time: timeToHms(a.time),
  status: a.status,
  reminder_sent: a.reminderSent,
  created_at: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
  client_name: a.client?.name ?? null,
  client_phone: a.client?.phone ?? null,
  professional_name: a.professional?.name ?? null,
  service_name: a.service?.name ?? null,
  service_price: priceToNumber(a.service?.price),
  service_duration_minutes: a.service?.durationMinutes ?? 0,
  source: a.source ?? 'painel',
  deposit_amount: a.depositAmount === null || a.depositAmount === undefined ? null : priceToNumber(a.depositAmount),
  started_at: a.startedAt ? new Date(a.startedAt).toISOString() : null,
  client_confirmed_at: a.clientConfirmedAt ? new Date(a.clientConfirmedAt).toISOString() : null,
  comanda_id: a.comanda?.id ?? null,
  comanda_status: (a.comanda?.status as 'rascunho' | 'fechada' | undefined) ?? null,
  comanda_number: a.comanda?.number ?? null,
  comanda_total_charged: a.comanda?.status === 'fechada' ? nullablePrice(a.comanda.totalCharged) : null,
  comanda_deposit_applied: a.comanda?.status === 'fechada' ? nullablePrice(a.comanda.depositApplied) : null,
  comanda_enviada_recepcao_em: a.comanda?.enviadaRecepcaoEm ? new Date(a.comanda.enviadaRecepcaoEm).toISOString() : null,
});
