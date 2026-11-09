'use client';

import { notFound, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsModule } from '@/components/SettingsModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { SettingsTabs } from '@/components/shell/SettingsTabs';
import { PageHeader } from '@/components/ui';
import { ehSecaoConfiguracao, tituloDaSecao } from '@/lib/configuracoes';

export default function ConfiguracaoSecaoPage() {
  const params = useParams<{ secao: string }>();
  const { user } = useAuth();
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  const secao = params?.secao ?? '';
  if (!ehSecaoConfiguracao(secao)) notFound();

  return (
    <>
      <SettingsTabs />
      <PageHeader title={tituloDaSecao(secao)} />
      <FeatureGate
        access={access.evaluate('advanced_admin')}
        onUpgrade={goToPlans}
        onManageBilling={openBillingPortal}
        title="Administração avançada indisponível"
      >
        <SettingsModule initialBusinessName={user?.businessName || ''} secao={secao} />
      </FeatureGate>
    </>
  );
}
