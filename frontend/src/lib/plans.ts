export type PlanId = 'basico' | 'profissional' | 'premium';

export interface SaaSPlan {
  id: PlanId;
  name: string;
  price: number;
  trialDays: number;
  description: string;
  recommended?: boolean;
  ctaLabel: string;
  features: string[];
}

export const SAAS_PLANS: SaaSPlan[] = [
  {
    id: 'basico',
    name: 'Solo',
    price: 49.9,
    trialDays: 14,
    description: 'Para negócios enxutos que precisam organizar a operação sem complexidade.',
    ctaLabel: 'Começar no Solo',
    features: [
      '1 profissional ativo',
      'Agendamentos online ilimitados',
      'Gestão de clientes com histórico',
      'Lembretes automáticos via WhatsApp',
      'Controle financeiro essencial',
    ],
  },
  {
    id: 'profissional',
    name: 'Equipe',
    price: 99.9,
    trialDays: 14,
    description: 'Plano ideal para crescimento com mais equipe, previsibilidade e performance.',
    recommended: true,
    ctaLabel: 'Assinar Equipe',
    features: [
      'Até 5 profissionais ativos',
      'Agenda inteligente com encaixes',
      'Comissões e produtividade da equipe',
      'Relatórios gerenciais mensais',
      'Financeiro completo com caixa',
      'Exportação do financeiro em PDF',
    ],
  },
  {
    id: 'premium',
    name: 'Salão',
    price: 199.9,
    trialDays: 14,
    description: 'Para operações em expansão que exigem escala, controle e visão estratégica.',
    ctaLabel: 'Escalar com Salão',
    features: [
      'Profissionais ilimitados',
      'Relatórios avançados e metas',
      'Automação de lembretes e campanhas',
      'Suporte prioritário',
      'Base pronta para multiunidade',
      'Gestão centralizada da operação',
    ],
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
