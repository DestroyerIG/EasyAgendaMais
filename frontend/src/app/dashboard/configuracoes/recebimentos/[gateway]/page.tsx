'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GatewayPassos } from '@/components/recebimentos/GatewayPassos';
import { InfinitePayPassos } from '@/components/recebimentos/InfinitePayPassos';
import { Banner, PageHeader } from '@/components/ui';

export default function RecebimentoGatewayPage() {
  const { user } = useAuth();
  const params = useParams<{ gateway: string }>();

  return (
    <>
      <PageHeader title="Recebimentos" />
      {user?.role !== 'tenant_admin' ? (
        <Banner tone="warning" variant="inline">Só quem administra o negócio pode mexer nos recebimentos.</Banner>
      ) : params.gateway === 'infinitepay' ? (
        <InfinitePayPassos />
      ) : (
        <GatewayPassos gatewayId={params.gateway} />
      )}
    </>
  );
}
