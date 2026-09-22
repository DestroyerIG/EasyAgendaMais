'use client';

import { Suspense } from 'react';
import { AppointmentModule } from '@/components/AppointmentModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function AgendamentosPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('appointments')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Agendamentos indisponíveis"
    >
      <Suspense fallback={null}>
        <AppointmentModule />
      </Suspense>
    </FeatureGate>
  );
}