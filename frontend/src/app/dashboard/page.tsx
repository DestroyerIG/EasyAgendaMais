'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardCards } from '@/components/DashboardCards';
import { WeeklyChart } from '@/components/WeeklyChart';
import { SaudacaoDia } from '@/components/dashboard/SaudacaoDia';
import { PainelPendencias } from '@/components/dashboard/PainelPendencias';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';
import { billingApi, type CheckoutPaymentMethod } from '@/lib/billing';
import { isPlanId } from '@/lib/plans';
import { getApiErrorCode } from '@/utils/handleApiError';
import { conteudoDemo } from '@/lib/conteudoDemo';
import type { DashboardData } from '@/types';

const PIX_STORAGE_KEY = 'easyagenda:pixCheckout';

const resolveCheckoutPaymentMethod = (value: string | null): CheckoutPaymentMethod => {
  if (value === 'pix') {
    return 'pix';
  }

  return 'card';
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const checkoutTriggeredRef = useRef(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const loadDashboard = useCallback(async () => {
    try {
      const response = await api.get('/dashboard');
      setData(response.data);
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

      if ('provider' in session && session.provider === 'stripe') {
        window.location.assign(session.checkoutUrl);
        return;
      }

      if ('provider' in session && session.provider === 'asaas') {
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
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </Card>
        <Card>
          <Skeleton className="h-7 w-52 mb-6" />
          <Skeleton className="h-[220px] w-full" />
        </Card>
      </div>
    );
  }

  return (
    <>
      {data ? (
        <div className="flex flex-col gap-6 sm:gap-8">
          <SaudacaoDia businessName={user?.businessName || 'Seu negócio'} />
          <DashboardCards data={data} />
          <PainelPendencias pendencias={conteudoDemo.hoje.pendencias} />
          <WeeklyChart data={data.weeklyEarnings} />
        </div>
      ) : (
        <Card className="text-center">
          <p className="text-muted">Não foi possível carregar os dados do dashboard.</p>
          <Button onClick={loadDashboard} className="mt-4">
            Tentar Novamente
          </Button>
        </Card>
      )}
    </>
  );
}
