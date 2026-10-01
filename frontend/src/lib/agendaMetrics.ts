/**
 * Ocupação e vagas livres do dia — cálculo real, compartilhado entre a Agenda
 * (AppointmentModule.tsx, que já fazia essa conta inline) e o Hoje (DashboardCards.tsx,
 * que antes desta correção usava números fixos de conteudoDemo — I3 da revisão final).
 * As duas telas passam a chamar as mesmas funções sobre o mesmo tipo de dado
 * (GET /appointments do dia), então "84% de ocupação" no Hoje não pode mais divergir do
 * que a Agenda calcula para o mesmo dia.
 */
import {
  agruparPorProfissional,
  calcularFaixaHoras,
  calcularVagasLivres,
  duracaoReal,
  type FaixaHoras,
  type HorarioFuncionamento,
} from '@/components/appointments/LinhaDoTempo';
import type { Appointment } from '@/types';

/** Vaga livre com o nome da profissional dela — a régua e as vagas são por coluna. */
export interface VagaLivreComProfissional {
  profissional: string;
  inicioMinutos: number;
  duracaoMinutos: number;
}

export interface MetricasAgendaDoDia {
  ocupacaoPercentual: number;
  vagasLivres: VagaLivreComProfissional[];
}

/**
 * % de ocupação do dia: minutos ocupados (soma da duração real de cada agendamento não
 * cancelado, com a duração padrão só de reserva) sobre os minutos disponíveis (colunas de
 * profissional × horas da faixa). Mesma fórmula que AppointmentModule.tsx já usava para o
 * KPI "X% de ocupação" do celular.
 */
export function calcularOcupacaoPercentual(
  agendamentosDoDia: Appointment[],
  faixa: FaixaHoras,
  duracaoMinutos: number,
  numColunas: number,
): number {
  const minutosDisponiveis = Math.max(numColunas, 1) * (faixa.fimMinutos - faixa.inicioMinutos);
  if (minutosDisponiveis <= 0) return 0;
  const minutosOcupados = agendamentosDoDia
    .filter((agendamento) => agendamento.status !== 'cancelado')
    .reduce((soma, agendamento) => soma + duracaoReal(agendamento, duracaoMinutos), 0);
  return Math.min(100, Math.round((minutosOcupados * 100) / minutosDisponiveis));
}

/**
 * Ocupação e vagas livres (com o nome da profissional de cada uma) do dia completo —
 * mesmo cálculo que a Agenda faz sobre `GET /appointments`, para o Hoje nunca divergir.
 * Sem horário de funcionamento, cai na janela padrão de desenho (08:00–20:00), a mesma
 * que a Agenda usa quando `/business/settings` não responde.
 */
export function calcularMetricasAgendaDoDia(
  agendamentosDoDia: Appointment[],
  duracaoMinutos: number,
  horarioFuncionamento?: HorarioFuncionamento | null,
): MetricasAgendaDoDia {
  const faixa = calcularFaixaHoras(agendamentosDoDia, duracaoMinutos, horarioFuncionamento);
  const colunas = agruparPorProfissional(agendamentosDoDia);
  const ocupacaoPercentual = calcularOcupacaoPercentual(agendamentosDoDia, faixa, duracaoMinutos, colunas.length);
  const vagasLivres: VagaLivreComProfissional[] = colunas.flatMap((coluna) =>
    calcularVagasLivres(coluna.agendamentos, faixa, duracaoMinutos, { apenasEntreAtendimentos: true }).map(
      (vaga) => ({
        profissional: coluna.nome,
        inicioMinutos: vaga.inicioMinutos,
        duracaoMinutos: vaga.duracaoMinutos,
      }),
    ),
  );
  return { ocupacaoPercentual, vagasLivres };
}
