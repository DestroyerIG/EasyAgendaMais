'use client';

import { FeatureGate } from '@/components/billing/FeatureGate';
import { RelatoriosModule } from '@/components/relatorios/RelatoriosModule';
import { RelatoriosTabs } from '@/components/relatorios/RelatoriosTabs';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function RelatoriosPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('reports')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Relatórios indisponíveis"
    >
      <RelatoriosTabs />
      <RelatoriosModule />
    </FeatureGate>
  );
}
