'use client';

import { FeatureGate } from '@/components/billing/FeatureGate';
import { ClubeTabs } from '@/components/clube/ClubeTabs';
import { PlanosModule } from '@/components/clube/PlanosModule';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function ClubePage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('clube')}
      onUpgrade={() => goToPlans('clube')}
      onManageBilling={openBillingPortal}
      title="Clube e pacotes no plano Salão"
    >
      <ClubeTabs />
      <PlanosModule />
    </FeatureGate>
  );
}
