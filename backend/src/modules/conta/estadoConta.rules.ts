import { CARENCIA_DIAS, ORIGENS_NA_CARENCIA, STATUS_CONTINGENCIA } from '../../config/contingencia.js';

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
  /** Cartão cadastrado no Asaas (assinatura ativa): a 1ª cobrança recusada no fim do teste dá carência. */
  cartaoCadastrado?: boolean;
}

export function calcularEstadoConta(e: EntradaEstado): EstadoConta {
  if (e.status === 'active' || e.status === 'trialing') return { tipo: 'ativa' };
  if (e.status === 'canceled') return { tipo: 'bloqueada', motivo: 'cancelada' };

  const emContingencia = (STATUS_CONTINGENCIA as readonly string[]).includes(e.status);
  if (!e.jaPagou && !(e.cartaoCadastrado && emContingencia)) return { tipo: 'bloqueada', motivo: 'teste' };
  // Quem já pagou e caiu num status fora da lista (ex.: incomplete) não está em teste.
  if (!emContingencia) return { tipo: 'bloqueada', motivo: 'cobranca' };

  // Cobrança Pix do mês seguinte gerada antes do vencimento: o período pago ainda vale.
  if (e.status === 'pending' && e.fimDoPeriodo && e.fimDoPeriodo.getTime() > e.agora.getTime()) {
    return { tipo: 'ativa' };
  }

  // Defesa contra linha sem backfill: conta a carência a partir de agora.
  let desde = e.inadimplenteDesde ?? e.agora;
  // Cobrança gerada antes do vencimento (Pix, ou a próxima do cartão no Asaas) marca inadimplenteDesde na
  // geração; a carência só começa quando o período pago acaba. O Asaas não avança o período numa cobrança
  // não paga, então a regra vale para as duas formas.
  if (e.inadimplenteDesde && e.fimDoPeriodo && e.fimDoPeriodo.getTime() <= e.agora.getTime()
    && e.fimDoPeriodo.getTime() > desde.getTime()) {
    desde = e.fimDoPeriodo;
  }
  const ate = new Date(desde.getTime() + CARENCIA_DIAS * MS_DIA);
  // Quem nunca pagou (1ª cobrança do cartão recusada no fim do teste) termina como teste encerrado.
  if (e.agora.getTime() >= ate.getTime()) return { tipo: 'bloqueada', motivo: e.jaPagou ? 'cobranca' : 'teste' };

  const diasRestantes = Math.ceil((ate.getTime() - e.agora.getTime()) / MS_DIA);
  return { tipo: 'carencia', desde, ate, diasRestantes };
}

export function textoAgendaPausada(nomeNegocio: string): string {
  return `A agenda online está pausada no momento. Fale direto com ${nomeNegocio} pelo WhatsApp.`;
}

/**
 * Regra única dos envios automáticos de WhatsApp: ativa envia tudo; bloqueada nada; na carência só as
 * origens de ORIGENS_NA_CARENCIA (cobram compromissos que já existiam).
 */
export function podeEnviarOrigem(estado: EstadoConta, origem: string): boolean {
  if (estado.tipo === 'ativa') return true;
  if (estado.tipo === 'bloqueada') return false;
  return (ORIGENS_NA_CARENCIA as readonly string[]).includes(origem);
}
