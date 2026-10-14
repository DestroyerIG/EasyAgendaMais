import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureGate } from '../FeatureGate';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';

const baseAccess: FeatureAccessDecision = {
  feature: 'reports',
  plan: 'basico',
  subscriptionStatus: 'active',
  allowed: false,
  reason: 'plan_upgrade_required',
  requiredPlan: 'profissional',
  message: 'Disponível a partir do plano Equipe.',
  upgradeRequired: true,
  billingActionRequired: false,
};

describe('FeatureGate', () => {
  it('bloqueia o conteúdo e mostra o botão de upgrade quando o acesso é negado', () => {
    render(
      <FeatureGate access={baseAccess} onUpgrade={vi.fn()}>
        <p>Conteúdo protegido</p>
      </FeatureGate>,
    );

    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(screen.getByText('Disponível a partir do plano Equipe.')).toBeInTheDocument();
    expect(screen.getByText('Plano necessário: Equipe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver planos' })).toBeInTheDocument();
  });

  it('renderiza os filhos normalmente quando o acesso é permitido', () => {
    render(
      <FeatureGate access={{ ...baseAccess, allowed: true }}>
        <p>Conteúdo liberado</p>
      </FeatureGate>,
    );

    expect(screen.getByText('Conteúdo liberado')).toBeInTheDocument();
  });
});
