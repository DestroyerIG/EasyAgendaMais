'use client';

import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { isPlanId, PLAN_MAP } from '@/lib/plans';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { SettingsTabs } from '@/components/shell/SettingsTabs';
import { ForcedDark } from '@/components/theme/ForcedDark';

export default function PlanosPage() {
  const { user } = useAuth();
  const {
    subscriptionStatus,
    openBillingPortal,
    portalLoading,
    billingProvider,
  } = useDashboardBilling();

  const currentPlanLabel = user?.plan && isPlanId(user.plan)
    ? PLAN_MAP[user.plan].name
    : (user?.plan || 'Básico');

  return (
    <div>
      <SettingsTabs />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-ink">Planos e Assinatura</h2>
          <p className="mt-2 text-muted">
            Plano atual: <span className="font-semibold text-ink">{currentPlanLabel}</span>
            {subscriptionStatus && (
              <>
                {' '}· Status:{' '}
                <span className="font-semibold text-success-text">{subscriptionStatus}</span>
              </>
            )}
          </p>
        </div>

        <Button variant="secondary" onClick={openBillingPortal} loading={portalLoading}>
          <ShieldCheck size={16} />
          {portalLoading
            ? 'Abrindo...'
            : billingProvider === 'asaas' || billingProvider === 'coupon'
            ? 'Gerar nova cobrança Pix'
            : 'Gerenciar assinatura'}
        </Button>
      </div>

      <ForcedDark className="rounded-card p-4 sm:p-6">
        <PricingPlansSection
          showHeader={false}
          currentPlan={user?.plan || 'basico'}
          subscriptionStatus={subscriptionStatus}
        />
      </ForcedDark>
    </div>
  );
}