'use client';

import { FeatureGate } from '@/components/billing/FeatureGate';
import { ComissoesModule } from '@/components/relatorios/ComissoesModule';
import { RelatoriosTabs } from '@/components/relatorios/RelatoriosTabs';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function ComissoesPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('reports')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Comissões indisponíveis"
    >
      <RelatoriosTabs />
      <ComissoesModule onUpgrade={goToPlans} />
    </FeatureGate>
  );
}
