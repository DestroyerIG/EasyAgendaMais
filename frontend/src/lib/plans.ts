export type PlanId = 'basico' | 'profissional' | 'premium';

export interface SaaSPlan {
  id: PlanId;
  name: string;
  /** null no Salão, que é sob consulta (o valor é combinado com cada negócio). */
  price: number | null;
  trialDays: number;
  recommended?: boolean;
  ctaLabel: string;
}

export const SAAS_PLANS: SaaSPlan[] = [
  {
    id: 'basico',
    name: 'Solo',
    price: 49.9,
    trialDays: 14,
    ctaLabel: 'Começar no Solo',
  },
  {
    id: 'profissional',
    name: 'Equipe',
    price: 99.9,
    trialDays: 14,
    recommended: true,
    ctaLabel: 'Assinar Equipe',
  },
  {
    id: 'premium',
    name: 'Salão',
    price: null,
    trialDays: 14,
    ctaLabel: 'Escalar com Salão',
  },
];

export const PLAN_MAP: Record<PlanId, SaaSPlan> = SAAS_PLANS.reduce((acc, plan) => {
  acc[plan.id] = plan;
  return acc;
}, {} as Record<PlanId, SaaSPlan>);

export const isPlanId = (value: string): value is PlanId => {
  return value === 'basico' || value === 'profissional' || value === 'premium';
};

// Nome do plano na casca do painel (rodapé da barra lateral). É o mesmo nome que o
// cliente vê nas páginas de preço: Solo, Equipe ou Salão — nunca "Pro".
export const PLAN_SHELL_LABEL: Record<PlanId, string> = {
  basico: 'Solo',
  profissional: 'Equipe',
  premium: 'Salão',
};

export const getPlanShellLabel = (plan: string): string => {
  return isPlanId(plan) ? PLAN_SHELL_LABEL[plan] : PLAN_SHELL_LABEL.basico;
};
