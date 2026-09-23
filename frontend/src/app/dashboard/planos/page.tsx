'use client';

import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
          <h2 className="text-3xl font-bold text-white">Planos e Assinatura</h2>
          <p className="mt-2 text-gray-400">
            Plano atual: <span className="font-semibold text-white">{currentPlanLabel}</span>
            {subscriptionStatus && (
              <>
                {' '}· Status:{' '}
                <span className="font-semibold text-emerald-400">{subscriptionStatus}</span>
              </>
            )}
          </p>
        </div>

        <button
          onClick={openBillingPortal}
          disabled={portalLoading}
          className="btn-secondary flex items-center gap-2 px-4 py-2"
        >
          <ShieldCheck size={16} />
          {portalLoading
            ? 'Abrindo...'
            : billingProvider === 'asaas' || billingProvider === 'coupon'
            ? 'Gerar nova cobrança Pix'
            : 'Gerenciar assinatura'}
        </button>
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