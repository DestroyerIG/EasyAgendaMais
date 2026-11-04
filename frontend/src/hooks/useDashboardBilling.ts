'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { billingApi, type BillingProvider } from '@/lib/billing';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { getApiErrorMessage } from '@/utils/handleApiError';

/**
 * Hook compartilhado para todas as sub-páginas do dashboard.
 * Fornece: access, goToPlans, openBillingPortal (no cartão abre a fatura do Asaas), portalLoading
 */
export function useDashboardBilling() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [billingProvider, setBillingProvider] = useState<BillingProvider | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const access = useSubscriptionAccess(subscriptionStatus || user?.subscriptionStatus || null);

  const loadSubscriptionStatus = useCallback(async () => {
    try {
      const response = await billingApi.getStatus();
      setSubscriptionStatus(response.subscriptionStatus);
      setBillingProvider(response.provider);
    } catch {
      // billing pode não estar configurado em ambiente local
    }
  }, []);

  useEffect(() => {
    loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  // Com o recurso bloqueado, a comparação mostra a faixa "Recurso exclusivo" (2D).
  const goToPlans = (recurso?: string) =>
    router.push(typeof recurso === 'string' && recurso ? `/planos/comparar?recurso=${encodeURIComponent(recurso)}` : '/planos/comparar');

  // Cartão: abre a fatura em aberto (ou a última) na página do Asaas, onde ela paga com outro cartão.
  // Pix ou sem cartão: a cobrança é gerada em Plano e cobrança.
  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const forma = billingProvider === 'asaas' ? await billingApi.getPaymentMethod() : null;
      if (forma?.tipo === 'card' && forma.urlFatura) {
        window.open(forma.urlFatura, '_blank', 'noopener,noreferrer');
        return;
      }
      router.push('/planos');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível abrir a fatura agora.'), 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  return {
    access,
    goToPlans,
    openBillingPortal,
    portalLoading,
    subscriptionStatus,
    billingProvider,
    refreshBillingStatus: loadSubscriptionStatus,
  };
}