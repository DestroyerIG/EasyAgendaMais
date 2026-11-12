import api from '@/lib/api';

// Liga/desliga a agenda da profissional. Espelha backend/src/services/professionalService.ts.

export interface ResultadoDisponibilidade {
  id: string;
  available: boolean;
  /** Agendamentos que ainda vão acontecer e continuam marcados. */
  agendamentosFuturos: number;
}

export interface DisponibilidadeBancada {
  disponivel: boolean;
  agendamentosFuturos: number;
}

export interface ProfissionalDoNegocio {
  id: string;
  name: string;
  photo: string | null;
  available: boolean;
  agendamentosFuturos: number;
}

/** "3 agendamentos futuros continuam marcados"; vazio quando não há nenhum. */
export function avisoAgendamentosMantidos(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '1 agendamento futuro continua marcado' : `${n} agendamentos futuros continuam marcados`;
}

export const disponibilidadeApi = {
  /** Painel da dona. */
  definir: async (professionalId: string, available: boolean) =>
    (await api.put<ResultadoDisponibilidade>(`/business/professionals/${professionalId}/disponibilidade`, { available })).data,

  /** App da profissional: sempre a dela. */
  daBancada: async () => (await api.get<DisponibilidadeBancada>('/bancada/disponibilidade')).data,
  definirNaBancada: async (disponivel: boolean) =>
    (await api.put<DisponibilidadeBancada>('/bancada/disponibilidade', { disponivel })).data,

  /** Painel da administradora da plataforma. */
  doNegocio: async (tenantId: string) =>
    (await api.get<ProfissionalDoNegocio[]>(`/admin/tenants/${tenantId}/profissionais`)).data,
  definirDoNegocio: async (tenantId: string, professionalId: string, available: boolean) =>
    (await api.patch<ResultadoDisponibilidade>(`/admin/tenants/${tenantId}/profissionais/${professionalId}/disponibilidade`, { available })).data,
};
