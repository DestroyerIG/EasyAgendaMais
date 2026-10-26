import api from '@/lib/api';
import type { Vocabulario } from '@/lib/vocabulario';

// Acesso das profissionais ao app (fase 5). Espelha backend/src/modules/equipe.

export type EstadoAcesso = 'sem_acesso' | 'convite_enviado' | 'convite_vencido' | 'ativo' | 'removido';

export interface Acesso {
  professionalId: string;
  estado: EstadoAcesso;
  email: string | null;
  desde: string | null;
}

export interface ConviteCriado extends Acesso { link: string; emailEnviado: boolean }

export interface ConvitePublico { negocio: string; profissional: string; email: string; vocabulario?: Vocabulario }

export const equipeApi = {
  acessos: async () => (await api.get<Acesso[]>('/equipe/acessos')).data,
  convidar: async (professionalId: string, email: string) =>
    (await api.post<ConviteCriado>(`/equipe/profissionais/${professionalId}/convite`, { email })).data,
  revogar: async (professionalId: string) => (await api.delete<Acesso>(`/equipe/profissionais/${professionalId}/convite`)).data,
  remover: async (professionalId: string) => (await api.post<Acesso>(`/equipe/profissionais/${professionalId}/acesso/remover`)).data,
  reativar: async (professionalId: string) => (await api.post<Acesso>(`/equipe/profissionais/${professionalId}/acesso/reativar`)).data,
  configuracao: async () => (await api.get<{ profissionalCobra: boolean }>('/equipe/configuracao')).data,
  salvarConfiguracao: async (profissionalCobra: boolean) =>
    (await api.put<{ profissionalCobra: boolean }>('/equipe/configuracao', { profissionalCobra })).data,
};

export const conviteApi = {
  ver: async (token: string) => (await api.get<ConvitePublico>(`/convites/${encodeURIComponent(token)}`)).data,
  aceitar: async (token: string, senha: string) => {
    await api.post(`/convites/${encodeURIComponent(token)}/aceitar`, { senha });
  },
};

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Texto do estado para o cadastro da profissional. */
export function rotuloAcesso(a: Acesso | null): string {
  if (!a || a.estado === 'sem_acesso') return 'Sem acesso ao app';
  const desde = a.desde ? dataCurta(a.desde) : '';
  switch (a.estado) {
    case 'convite_enviado': return `Convite enviado em ${desde}`;
    case 'convite_vencido': return `Convite vencido (enviado em ${desde})`;
    case 'ativo': return `Ativo desde ${desde}`;
    case 'removido': return 'Acesso removido';
  }
}
