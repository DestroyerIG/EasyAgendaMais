'use client';

import { AlertTriangle, CreditCard, Lock, TrendingUp } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PLAN_MAP } from '@/lib/plans';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';

interface SubscriptionBlockCardProps {
  access: FeatureAccessDecision;
  title?: string;
  onUpgrade?: () => void;
  onManageBilling?: () => void;
  className?: string;
}

export const SubscriptionBlockCard = ({
  access,
  title,
  onUpgrade,
  onManageBilling,
  className,
}: SubscriptionBlockCardProps) => {
  const requiredPlanName = access.requiredPlan ? PLAN_MAP[access.requiredPlan].name : null;

  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-surface-2 p-2 text-muted">
          <Lock size={16} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-ink">{title || 'Funcionalidade bloqueada'}</h3>
          <p className="mt-2 text-[15px] text-muted">{access.message}</p>

          {requiredPlanName && access.upgradeRequired && (
            <p className="mt-3 text-[13px] font-semibold text-muted">
              Plano necessário: {requiredPlanName}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {access.billingActionRequired && onManageBilling && (
              <Button type="button" onClick={onManageBilling}>
                <CreditCard size={16} aria-hidden="true" />
                Regularizar assinatura
              </Button>
            )}

            {access.upgradeRequired && onUpgrade && (
              <Button type="button" variant="secondary" onClick={onUpgrade}>
                <TrendingUp size={16} aria-hidden="true" />
                Ver planos
              </Button>
            )}

            {!access.upgradeRequired && !access.billingActionRequired && (
              <span className="inline-flex items-center gap-2 rounded-control border border-line px-3 py-2 text-[13px] font-semibold text-muted">
                <AlertTriangle size={14} aria-hidden="true" />
                Acesso indisponível no momento
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
