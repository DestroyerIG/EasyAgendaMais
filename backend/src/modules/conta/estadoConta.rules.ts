import { CARENCIA_DIAS, STATUS_CONTINGENCIA } from '../../config/contingencia.js';

const MS_DIA = 86_400_000;

export type MotivoBloqueio = 'cobranca' | 'teste' | 'cancelada';

export type EstadoConta =
  | { tipo: 'ativa' }
  | { tipo: 'carencia'; desde: Date; ate: Date; diasRestantes: number }
  | { tipo: 'bloqueada'; motivo: MotivoBloqueio };

export interface EntradaEstado {
  status: string;
  inadimplenteDesde: Date | null;
  jaPagou: boolean;
  fimDoPeriodo: Date | null;
  agora: Date;
}

export function calcularEstadoConta(e: EntradaEstado): EstadoConta {
  if (e.status === 'active' || e.status === 'trialing') return { tipo: 'ativa' };
  if (e.status === 'canceled') return { tipo: 'bloqueada', motivo: 'cancelada' };

  const emContingencia = (STATUS_CONTINGENCIA as readonly string[]).includes(e.status);
  if (!emContingencia || !e.jaPagou) return { tipo: 'bloqueada', motivo: 'teste' };

  // Cobrança Pix do mês seguinte gerada antes do vencimento: o período pago ainda vale.
  if (e.status === 'pending' && e.fimDoPeriodo && e.fimDoPeriodo.getTime() > e.agora.getTime()) {
    return { tipo: 'ativa' };
  }

  // Defesa contra linha sem backfill: conta a carência a partir de agora.
  const desde = e.inadimplenteDesde ?? e.agora;
  const ate = new Date(desde.getTime() + CARENCIA_DIAS * MS_DIA);
  if (e.agora.getTime() >= ate.getTime()) return { tipo: 'bloqueada', motivo: 'cobranca' };

  const diasRestantes = Math.ceil((ate.getTime() - e.agora.getTime()) / MS_DIA);
  return { tipo: 'carencia', desde, ate, diasRestantes };
}

export function textoAgendaPausada(nomeNegocio: string): string {
  return `A agenda online está pausada no momento. Fale direto com ${nomeNegocio} pelo WhatsApp.`;
}
