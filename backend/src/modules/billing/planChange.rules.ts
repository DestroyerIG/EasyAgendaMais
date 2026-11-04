import { PLAN_CATALOG, PLAN_PRICES, professionalLimit } from '../../config/planCatalog.js';
import { PLAN_LEVELS } from '../../config/planPermissions.js';
import type { PlanId } from '../../types/domain.js';

// Funções puras da troca de plano (spec 2D, "Upgrade" e "Downgrade").

export type DirecaoTroca = 'upgrade' | 'downgrade' | 'igual';

// Abaixo disso a diferença do upgrade não é cobrada (o Asaas não aceita Pix menor que R$ 5).
export const VALOR_MINIMO_DIFERENCA = 5;

const DIA_MS = 24 * 60 * 60 * 1000;
const CICLO_PADRAO_DIAS = 30;

export const direcaoTroca = (atual: PlanId, novo: PlanId): DirecaoTroca => {
  if (PLAN_LEVELS[novo] > PLAN_LEVELS[atual]) return 'upgrade';
  if (PLAN_LEVELS[novo] < PLAN_LEVELS[atual]) return 'downgrade';
  return 'igual';
};

export interface Proporcional {
  valor: number;
  dias: number;
  diasCiclo: number;
}

// (preço novo − preço atual) × dias restantes ÷ dias do ciclo, arredondado para baixo em
// centavos. Diferença abaixo de R$ 5 vira zero (o upgrade sai sem cobrança).
export const calcularProporcional = ({
  atual,
  novo,
  inicio,
  fim,
  agora,
  valorAtual = PLAN_PRICES[atual],
  valorNovo = PLAN_PRICES[novo],
}: {
  atual: PlanId;
  novo: PlanId;
  inicio: Date | null;
  fim: Date | null;
  agora: Date;
  /** Valores mensais do negócio (o Salão é sob consulta: vale o combinado). */
  valorAtual?: number;
  valorNovo?: number;
}): Proporcional => {
  const diferenca = valorNovo - valorAtual;
  if (diferenca <= 0 || !fim) return { valor: 0, dias: 0, diasCiclo: CICLO_PADRAO_DIAS };

  const diasCiclo = inicio
    ? Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS))
    : CICLO_PADRAO_DIAS;
  const dias = Math.min(diasCiclo, Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / DIA_MS)));
  const bruto = Math.floor(((diferenca * dias) / diasCiclo) * 100 + 1e-6) / 100;
  const valor = bruto < VALOR_MINIMO_DIFERENCA ? 0 : bruto;

  return { valor, dias, diasCiclo };
};

// Downgrade com mais profissionais ativas do que o plano novo permite é recusado.
export const bloqueioDowngrade = (novo: PlanId, profissionaisAtivas: number): string | null => {
  const limite = professionalLimit(novo);
  if (profissionaisAtivas <= limite) return null;
  const excesso = profissionaisAtivas - limite;
  const permite = limite === 1 ? '1 profissional' : `${limite} profissionais`;
  return `O plano ${PLAN_CATALOG[novo].nome} permite ${permite}. Desative ${excesso} ${
    excesso === 1 ? 'profissional' : 'profissionais'
  } antes de mudar.`;
};

// Com um downgrade agendado, o limite para cadastrar profissional já é o do plano agendado.
export const limiteProfissionaisEfetivo = (plano: PlanId, planoAgendado: PlanId | null): number =>
  planoAgendado ? Math.min(professionalLimit(plano), professionalLimit(planoAgendado)) : professionalLimit(plano);

export const referenciaUpgrade = (businessId: string, plano: PlanId): string =>
  `business:${businessId}:plan:${plano}:upgrade`;

export const ehReferenciaUpgrade = (externalReference: unknown): boolean =>
  typeof externalReference === 'string' && /:upgrade$/.test(externalReference);
