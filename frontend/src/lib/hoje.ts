import api from '@/lib/api';

/** Espelho de AppointmentDto (backend/src/modules/appointments/appointment.serializer.ts). */
export interface AgendamentoHoje {
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
  comanda_id: string | null;
  comanda_status: 'rascunho' | 'fechada' | null;
  comanda_number: number | null;
  comanda_total_charged: number | null;
  comanda_deposit_applied: number | null;
}

export type Pendencia =
  | { tipo: 'vagas_tarde'; quantidade: number; vagas: Array<{ profissional: string; professionalId: string; inicio: string; fim: string }> }
  | { tipo: 'retorno_vencido'; quantidade: number; clientes: Array<{ id: string; name: string; phone: string; servico: string; venceuHa: number }> }
  | { tipo: 'sinais_pix'; quantidade: number; total: number; expiraEmMinutos: number }
  | { tipo: 'avaliacao'; quantidade: number; avaliacoes: Array<{ clientId: string; cliente: string; phone: string; nota: number; comentario: string | null; data: string }> };

export interface HojeDto {
  saudacao: { ownerName: string; date: string };
  faturamento: { valor: number; meta: number | null; percentual: number | null };
  agendamentos: { total: number; livresTarde: number };
  ocupacao: { percentual: number; variacao: number | null; diaDaSemana: string } | null;
  confirmadosLembrete: { quantidade: number; valor: number };
  pendencias: Pendencia[];
  proximas: AgendamentoHoje[];
  semana: Array<{ data: string; valor: number }>;
}

export const buscarHoje = async () => (await api.get<HojeDto>('/dashboard/today')).data;
