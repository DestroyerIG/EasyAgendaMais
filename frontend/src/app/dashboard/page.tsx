'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardCards } from '@/components/DashboardCards';
import { WeeklyChart } from '@/components/WeeklyChart';
import { SaudacaoDia } from '@/components/dashboard/SaudacaoDia';
import { PainelPendencias } from '@/components/dashboard/PainelPendencias';
import { ProximasDuasHoras } from '@/components/dashboard/ProximasDuasHoras';
import { BotaoCobrarPix } from '@/components/dashboard/BotaoCobrarPix';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';
import { billingApi, type CheckoutPaymentMethod } from '@/lib/billing';
import { isPlanId } from '@/lib/plans';
import { getApiErrorCode } from '@/utils/handleApiError';
import { getToday } from '@/lib/dateUtils';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { calcularMetricasAgendaDoDia } from '@/lib/agendaMetrics';
import { paraHoraTexto } from '@/components/appointments/LinhaDoTempo';
import type { Appointment, DashboardData } from '@/types';

/** Vagas livres a partir do meio-dia — mesmo recorte que DashboardCards usa na legenda. */
const INICIO_TARDE_MINUTOS = 12 * 60;
// Reserva técnica: só vale para agendamento sem duração própria (service_duration_minutes).
const DURACAO_FALLBACK_MINUTOS = 30;

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
  // Agendamentos de hoje (GET /appointments), buscados uma vez aqui e compartilhados por
  // ProximasDuasHoras e DashboardCards — para "X% de ocupação" do Hoje nunca divergir do
  // que a Agenda calcularia para o mesmo dia (correção I3 da revisão final).
  const [agendamentosHoje, setAgendamentosHoje] = useState<Appointment[] | null>(null);
  const checkoutTriggeredRef = useRef(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelado = false;
    api
      .get('/appointments', { params: { date: getToday(), view: 'day' } })
      .then((response) => {
        if (!cancelado) setAgendamentosHoje(response.data);
      })
      .catch(() => {
        if (!cancelado) {
          setAgendamentosHoje([]);
          showToast('Erro ao carregar os agendamentos de hoje', 'error');
        }
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sem /business/settings aqui (o Hoje não tem motivo para repetir essa busca) — cai na
  // mesma janela padrão (08:00–20:00) que a Agenda usa quando o horário não está
  // configurado, então os dois só divergem se a Agenda tiver o horário real e o Hoje não.
  const metricasAgenda = useMemo(
    () =>
      agendamentosHoje === null
        ? null
        : calcularMetricasAgendaDoDia(agendamentosHoje, DURACAO_FALLBACK_MINUTOS),
    [agendamentosHoje],
  );

  // Pendência "N horários vagos à tarde" (item 6 da revisão final): usa os mesmos
  // horários que o cálculo real de vagas livres produz, ou sai da lista quando não há
  // vaga real à tarde — nunca "14:30 e 16:45" fixos.
  const pendenciaVagasTarde = useMemo(() => {
    if (!metricasAgenda) return null;
    const vagasTarde = metricasAgenda.vagasLivres.filter((vaga) => vaga.inicioMinutos >= INICIO_TARDE_MINUTOS);
    if (vagasTarde.length === 0) return null;
    const profissionais = Array.from(new Set(vagasTarde.map((vaga) => vaga.profissional)));
    const horarios = vagasTarde.map((vaga) => paraHoraTexto(vaga.inicioMinutos)).join(' e ');
    return {
      // Ícone de hoje-desktop.html (`calendar_today`) — hoje-mobile.html usa
      // `event_busy` para o mesmo item; título/botão já seguiam o desktop.
      icone: 'calendar_today',
      titulo: `${vagasTarde.length} horário${vagasTarde.length === 1 ? '' : 's'} vago${vagasTarde.length === 1 ? '' : 's'} à tarde`,
      descricao: `${profissionais.join(', ')} · ${horarios}`,
      rotuloBotao: 'Oferecer à lista de espera',
      tom: 'brand' as const,
    };
  }, [metricasAgenda]);

  // As outras pendências (lembretes de manutenção, sinal Pix, avaliação) continuam de
  // exemplo — a fixa de "vagas à tarde" saiu de conteudoDemo.ts (item 10): só existe
  // quando o cálculo real produz vaga de verdade, nunca como registro morto no módulo.
  const pendencias = pendenciaVagasTarde
    ? [pendenciaVagasTarde, ...conteudoDemo.hoje.pendencias]
    : conteudoDemo.hoje.pendencias;

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
      {data ? (
        <div className="flex flex-col gap-6 sm:gap-8">
          <SaudacaoDia businessName={user?.businessName || 'Seu negócio'} />
          <DashboardCards data={data} metricasAgenda={metricasAgenda} />
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
              <PainelPendencias pendencias={pendencias} className="order-1" />
              <WeeklyChart data={data.weeklyEarnings} className="order-3" />
            </div>
            <ProximasDuasHoras agendamentos={agendamentosHoje} className="order-2 lg:col-span-5" />
          </div>
          <BotaoCobrarPix />
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
