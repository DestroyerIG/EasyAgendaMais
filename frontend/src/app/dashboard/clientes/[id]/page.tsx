'use client';

import { useParams } from 'next/navigation';
import { FichaCliente } from '@/components/clientes/FichaCliente';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

// /clientes/<id> chega aqui pelo rewrite do middleware (/clientes/:path* → /dashboard/clientes/...).
export default function FichaClientePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();
  const id = typeof params?.id === 'string' ? params.id : '';

  return (
    <FeatureGate
      access={access.evaluate('clients')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Clientes indisponível"
    >
      <FichaCliente clienteId={id} nomeNegocio={user?.businessName} />
    </FeatureGate>
  );
}
