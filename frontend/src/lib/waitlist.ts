import api from '@/lib/api';

export type PeriodoEspera = 'manha' | 'tarde' | 'noite' | 'qualquer';
export type StatusEspera = 'aguardando' | 'oferecida' | 'agendada' | 'cancelada';

export interface WaitlistItem {
  id: string;
  cliente: { id: string; name: string; phone: string };
  servico: { id: string; name: string };
  profissional: { id: string; name: string } | null;
  desiredDate: string | null;
  period: PeriodoEspera;
  notes: string | null;
  status: StatusEspera;
  offeredAt: string | null;
  createdAt: string;
}
export interface EsperaQuery { status?: 'aguardando' | 'oferecida' | 'todas'; period?: PeriodoEspera; date?: string }
export interface InscreverEsperaInput {
  clientId: string; serviceId: string; professionalId?: string; desiredDate?: string; period?: PeriodoEspera; notes?: string;
}
export interface AtualizarEsperaInput {
  status?: 'cancelada'; professionalId?: string | null; desiredDate?: string | null; period?: PeriodoEspera; notes?: string | null;
}
export interface OfertaVagaInput { date: string; time: string; professionalId?: string }

export const listarEspera = async (q: EsperaQuery = {}) => (await api.get<WaitlistItem[]>('/waitlist', { params: q })).data;
export const inscreverEspera = async (d: InscreverEsperaInput) => (await api.post<WaitlistItem>('/waitlist', d)).data;
export const atualizarEspera = async (id: string, d: AtualizarEsperaInput) => (await api.put<WaitlistItem>(`/waitlist/${id}`, d)).data;
export const ofertarVaga = async (id: string, d: OfertaVagaInput) =>
  (await api.post<{ item: WaitlistItem; whatsappUrl: string | null }>(`/waitlist/${id}/offer`, d)).data;
export const marcarAgendada = async (id: string, appointmentId: string) =>
  (await api.post<WaitlistItem>(`/waitlist/${id}/booked`, { appointmentId })).data;
