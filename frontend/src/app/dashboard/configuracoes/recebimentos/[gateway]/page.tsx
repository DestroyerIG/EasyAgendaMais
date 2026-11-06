'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GatewayPassos } from '@/components/recebimentos/GatewayPassos';
import { Banner, PageHeader } from '@/components/ui';

export default function RecebimentoGatewayPage() {
  const { user } = useAuth();
  const params = useParams<{ gateway: string }>();

  return (
    <>
      <PageHeader title="Recebimentos" />
      {user?.role !== 'tenant_admin' ? (
        <Banner tone="warning" variant="inline">Só quem administra o negócio pode mexer nos recebimentos.</Banner>
      ) : (
        <GatewayPassos gatewayId={params.gateway} />
      )}
    </>
  );
}
