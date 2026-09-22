'use client';

import { ServiceProfessionalModule } from '@/components/ServiceProfessionalModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { SettingsTabs } from '@/components/shell/SettingsTabs';

export default function ServicosPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <>
      <SettingsTabs />
      <FeatureGate
        access={access.evaluate('services')}
        onUpgrade={goToPlans}
        onManageBilling={openBillingPortal}
        title="Gestão de serviços indisponível"
      >
        <ServiceProfessionalModule />
      </FeatureGate>
    </>
  );
}