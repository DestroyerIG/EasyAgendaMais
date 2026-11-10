'use client';

import { ConviteCartao } from '@/components/assinatura/ConviteCartao';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardCards } from '@/components/DashboardCards';
import { WeeklyChart } from '@/components/WeeklyChart';
import { SaudacaoDia } from '@/components/dashboard/SaudacaoDia';
import { PainelPendencias } from '@/components/dashboard/PainelPendencias';
import { ProximasDuasHoras } from '@/components/dashboard/ProximasDuasHoras';
import { BotaoCobrarPix } from '@/components/dashboard/BotaoCobrarPix';
import { PrimeirosPassos } from '@/components/dashboard/PrimeirosPassos';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';
import { billingApi, type CheckoutPaymentMethod } from '@/lib/billing';
import { isPlanId } from '@/lib/plans';
import { getApiErrorCode } from '@/utils/handleApiError';
import { PedidoDepoimento } from '@/components/depoimentos/PedidoDepoimento';
import { buscarHoje, type HojeDto } from '@/lib/hoje';

const PIX_STORAGE_KEY = 'easyagenda:pixCheckout';

const resolveCheckoutPaymentMethod = (value: string | null): CheckoutPaymentMethod => {
  if (value === 'pix') {
    return 'pix';
  }

  return 'card';
};

export default function DashboardPage() {
  // Tudo o que a tela mostra vem de GET /dashboard/today, numa chamada só.
  const [hoje, setHoje] = useState<HojeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const checkoutTriggeredRef = useRef(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // "YYYY-MM-DD" vira hora local (T00:00:00): o gráfico lê com new Date(), e a data
  // pura seria meia-noite UTC — o dia anterior no Brasil.
  const semana = useMemo(
    () => (hoje ? hoje.semana.map((dia) => ({ date: `${dia.data}T00:00:00`, total: dia.valor })) : []),
    [hoje],
  );

  const loadDashboard = useCallback(async () => {
    try {
      setHoje(await buscarHoje());
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'SUBSCRIPTION_REQUIRED') {
        // Subscription inactive — redirect to login so AuthContext.login()
        // re-evaluates billing/status and routes correctly (/pagamento or /dashboard).
        // Never redirect directly to /pagamento here to avoid redirect loops.
        console.log('[dashboard] billing_guard_decision', {
          decision: 'SUBSCRIPTION_REQUIRED',
          action: 'redirect_to_login',
          reason: 'auth_context_is_single_routing_authority',
        });
        showToast('Sua assinatura requer atenção. Faça login novamente.', 'info');
        router.replace('/login');
        return;
      }

      showToast('Erro ao carregar dashboard. Redirecionando...', 'error');
      setTimeout(() => router.push('/login'), 2000);
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  const startCheckout = useCallback(async (
    plan: 'basico' | 'profissional' | 'premium',
    paymentMethod: CheckoutPaymentMethod = 'card'
  ) => {
    try {
      const session = await billingApi.createCheckoutSession(plan, paymentMethod);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Plano ativado com sucesso! Aproveite o sistema.', 'success');
        router.replace('/dashboard');
        return;
      }

      if ('checkoutUrl' in session) {
        window.location.assign(session.checkoutUrl);
        return;
      }

      if ('paymentId' in session) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(PIX_STORAGE_KEY, JSON.stringify(session));
        }

        showToast('Cobrança Pix criada. Finalize o pagamento na aba de planos.', 'info');
        router.push('/planos');
      }
    } catch {
      showToast('Não foi possível iniciar o checkout agora.', 'error');
    }
  }, [router, showToast]);

  useEffect(() => {
    if (authLoading) return;

    if (user?.role === 'platform_admin') {
      setLoading(false);
      router.replace('/admin');
      return;
    }

    loadDashboard();
  }, [authLoading, loadDashboard, router, user?.role]);

  useEffect(() => {
    if (authLoading || checkoutTriggeredRef.current || user?.role === 'platform_admin') return;

    const query = new URLSearchParams(window.location.search);

    if (query.get('billing') === 'success') {
      showToast('Pagamento confirmado. Sua assinatura será atualizada em instantes.', 'success');
    }
    if (query.get('billing') === 'canceled') {
      showToast('Checkout cancelado. Você pode tentar novamente quando quiser.', 'info');
    }

    const checkoutPlan = query.get('checkoutPlan');
    if (!checkoutPlan || !isPlanId(checkoutPlan)) return;

    const checkoutMethod = resolveCheckoutPaymentMethod(
      query.get('checkoutMethod') || query.get('paymentMethod')
    );

    checkoutTriggeredRef.current = true;
    startCheckout(checkoutPlan, checkoutMethod);
  }, [authLoading, showToast, startCheckout, user?.role]);

  if (loading || user?.role === 'platform_admin') {
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" label="Carregando…" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-20" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
            <Card className="order-1 flex flex-col gap-3">
              <Skeleton className="h-6 w-40" />
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </Card>
            <Card className="order-3">
              <Skeleton className="h-7 w-52 mb-6" />
              <Skeleton className="h-[220px] w-full" />
            </Card>
          </div>
          <Card className="order-2 flex flex-col gap-3 lg:col-span-5">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>
      {user?.role === 'tenant_admin' && <PedidoDepoimento />}
      {hoje ? (
        <div className="flex flex-col gap-6 sm:gap-8">
          <SaudacaoDia
            ownerName={hoje.saudacao.ownerName}
            data={hoje.saudacao.date}
            businessName={user?.businessName}
          />
          <PrimeirosPassos ativo={user?.role === 'tenant_admin'} />
          {user?.role === 'tenant_admin' && <ConviteCartao dispensavel />}
          <DashboardCards hoje={hoje} />
          {/* Ordem mobile (hoje-mobile.html, 1 coluna): Pendências, Próximas 2 horas,
              Gráfico — pelos order-1/2/3 abaixo, que no mobile valem para os 3 itens
              diretamente (o wrapper da esquerda vira "contents", ou seja, invisível
              para o layout, e Pendências/Gráfico entram soltos na mesma coluna 1).
              No desktop (hoje-desktop.html, 2 colunas 7fr/5fr): o wrapper vira uma
              coluna flex de verdade (Pendências em cima, Gráfico embaixo, na ordem em
              que aparecem no JSX) e Próximas 2 horas é a segunda coluna da grade —
              como é grid (não span), ela estica sozinha para a altura da coluna da
              esquerda, sem sobrar buraco nem precisar de row-span. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
              <PainelPendencias
                pendencias={hoje.pendencias}
                businessName={user?.businessName || 'nosso espaço'}
                data={hoje.saudacao.date}
                className="order-1"
              />
              <WeeklyChart data={semana} className="order-3" />
            </div>
            <ProximasDuasHoras agendamentos={hoje.proximas} className="order-2 lg:col-span-5" />
          </div>
          <BotaoCobrarPix />
        </div>
      ) : (
        <Card className="text-center">
          <p className="text-muted">Não foi possível carregar os dados do dashboard.</p>
          <Button onClick={loadDashboard} className="mt-4">
            Tentar novamente
          </Button>
        </Card>
      )}
    </>
  );
}
