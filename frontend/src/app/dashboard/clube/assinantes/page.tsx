'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { ClubeTabs } from '@/components/clube/ClubeTabs';
import { AssinantesModule } from '@/components/clube/AssinantesModule';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { STATUS_CONTRATO, type StatusContrato } from '@/lib/clube';

function Conteudo() {
  const status = useSearchParams()?.get('status');
  const inicial = status && status in STATUS_CONTRATO ? (status as StatusContrato) : undefined;
  return <AssinantesModule statusInicial={inicial} />;
}

export default function AssinantesPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('clube')}
      onUpgrade={() => goToPlans('clube')}
      onManageBilling={openBillingPortal}
      title="Clube e pacotes no plano Salão"
    >
      <ClubeTabs />
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </FeatureGate>
  );
}
