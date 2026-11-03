'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { Button, Card, Field, Icon, Input } from '@/components/ui';
import {
  billingApi,
  type CheckoutPaymentMethod,
  type CouponValidationResponse,
  type PixCheckoutSessionResponse,
  type SubscriptionStatusResponse,
} from '@/lib/billing';
import { formatCurrency } from '@/lib/formatters';
import { isPlanId, PLAN_MAP, type PlanId } from '@/lib/plans';
import { planoDoCatalogo, rotuloEquipe } from '@/lib/planCatalog';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { contaApi, type EstadoConta } from '@/lib/conta';
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const normalizeQrCodeSource = (value: string | null) => {
  if (!value) return null;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `data:image/png;base64,${value}`;
};

const resolvePlan = (
  searchPlan: string | null,
  billingStatus: SubscriptionStatusResponse | null
): PlanId => {
  if (billingStatus?.desiredPlan && isPlanId(String(billingStatus.desiredPlan))) {
    return billingStatus.desiredPlan as PlanId;
  }

  if (searchPlan && isPlanId(searchPlan)) {
    return searchPlan;
  }

  if (billingStatus?.plan && isPlanId(String(billingStatus.plan))) {
    return billingStatus.plan as PlanId;
  }

  return 'basico';
};

function PagamentoContent() {
  const [billingStatus, setBillingStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingMethod, setProcessingMethod] = useState<CheckoutPaymentMethod | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponState, setCouponState] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [couponData, setCouponData] = useState<Pick<CouponValidationResponse, 'discount' | 'finalAmount'> | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { showToast } = useToast();

  const redirectedToDashboardRef = useRef(false);

  const selectedPlan = useMemo(
    () => resolvePlan(searchParams.get('plan'), billingStatus),
    [billingStatus, searchParams]
  );
  const plan = PLAN_MAP[selectedPlan];
  const pixQrCodeSource = normalizeQrCodeSource(pixCheckout?.qrCode || null);
  const couponCodeNormalized = couponCode.trim().toUpperCase();
  const appliedDiscount = couponData?.discount ?? pixCheckout?.discount ?? 0;
  const originalAmount = plan.price;
  const finalAmount = couponData?.finalAmount
    ?? (appliedDiscount > 0
      ? Math.max(0, Number((plan.price - appliedDiscount).toFixed(2)))
      : plan.price);
  const hasDiscount = appliedDiscount > 0;
  const appliedCouponCode = pixCheckout?.coupon?.code || (couponState === 'valid' ? couponCodeNormalized : null);
  const isFreeActivation = couponState === 'valid' && couponData?.finalAmount === 0;

  const refreshBillingStatus = async () => {
    const status = await billingApi.getStatus();
    setBillingStatus(status);

    if (ACTIVE_STATUSES.has(status.subscriptionStatus) && !status.paymentRequired) {
      if (!redirectedToDashboardRef.current) {
        redirectedToDashboardRef.current = true;
        console.log('[pagamento] payment_redirect_reason: payment_confirmed → /dashboard');
        router.replace('/dashboard');
      }
      return status;
    }

    return status;
  };

  useEffect(() => {
    if (authLoading) return;

    if (user?.role === 'platform_admin') {
      router.replace('/admin');
      return;
    }

    let mounted = true;

    const loadStatus = async () => {
      let indoParaAssinatura = false;
      try {
        // Lê o estado da conta junto: sem ele (falha), o checkout segue como antes.
        const [status, estadoConta] = await Promise.all([
          billingApi.getStatus(),
          contaApi.estado().catch((): EstadoConta | null => null),
        ]);
        if (!mounted) return;

        // Contingência: quem já pagou regulariza pela tela da assinatura. Aqui, no cartão,
        // o checkout criaria uma segunda assinatura ao lado da que está em atraso.
        if (estadoConta?.tipo === 'carencia' || (estadoConta?.tipo === 'bloqueada' && estadoConta.motivo === 'cobranca')) {
          redirectedToDashboardRef.current = true;
          indoParaAssinatura = true; // segue carregando: nenhum botão de checkout aparece
          router.replace('/dashboard/assinatura');
          return;
        }

        setBillingStatus(status);

        const isActive = ACTIVE_STATUSES.has(status.subscriptionStatus) && !status.paymentRequired;
        console.log('[pagamento] subscription_status_loaded', {
          subscription_status: status.subscriptionStatus,
          paymentRequired: status.paymentRequired,
          provider: status.provider,
          currentRoute: window.location.pathname,
          payment_redirect_reason: isActive ? 'already_active_redirect_to_dashboard' : 'payment_required_stay',
          redirecting: isActive,
        });

        if (isActive) {
          if (redirectedToDashboardRef.current) {
            console.log('[pagamento] redirect skipped — already redirected this render cycle');
            return;
          }
          redirectedToDashboardRef.current = true;
          console.log('[pagamento] auth_guard_decision: active → /dashboard');
          router.replace('/dashboard');
        }
      } catch (error: unknown) {
        if (!mounted) return;
        showToast(getApiErrorMessage(error, 'Não foi possível carregar seu status de pagamento.'), 'error');
      } finally {
        if (mounted && !indoParaAssinatura) setLoading(false);
      }
    };

    void loadStatus();

    return () => {
      mounted = false;
    };
  }, [authLoading, router, showToast, user?.role]);

  useEffect(() => {
    setCouponCode('');
    setCouponState('idle');
    setCouponData(null);
  }, [selectedPlan]);

  const handleApplyCoupon = async () => {
    if (!couponCodeNormalized) {
      return;
    }

    setCouponState('loading');

    try {
      const result = await billingApi.validateCoupon(selectedPlan, couponCodeNormalized);
      setCouponData({
        discount: result.discount,
        finalAmount: result.finalAmount,
      });
      setCouponState('valid');
    } catch {
      setCouponState('invalid');
      setCouponData(null);
    }
  };

  const handleClearCoupon = () => {
    setCouponCode('');
    setCouponState('idle');
    setCouponData(null);
  };

  const startCheckout = async (paymentMethod: CheckoutPaymentMethod) => {
    setProcessingMethod(paymentMethod);

    try {
      const couponToApply = paymentMethod === 'pix' ? (couponCodeNormalized || null) : null;
      const session = await billingApi.createCheckoutSession(selectedPlan, paymentMethod, couponToApply);

      if ('type' in session && session.type === 'FREE_ACTIVATION') {
        showToast('Plano ativado com sucesso! Aproveite o sistema.', 'success');
        router.replace('/dashboard');
        return;
      }

      if (!('provider' in session)) {
        return;
      }

      if ('checkoutUrl' in session) {
        window.location.assign(session.checkoutUrl);
        return;
      }

      const pixSession = session;
      setPixCheckout(pixSession);
      if (pixSession.coupon?.code) {
        setCouponCode(pixSession.coupon.code);
        setCouponState('valid');

        if (typeof pixSession.discount === 'number') {
          const resolvedDiscount = pixSession.discount;
          const resolvedFinalAmount = Math.max(
            0,
            Number((plan.price - resolvedDiscount).toFixed(2))
          );

          setCouponData({
            discount: resolvedDiscount,
            finalAmount: resolvedFinalAmount,
          });
        }
      }
      setBillingStatus((current) => current ? {
        ...current,
        subscriptionStatus: pixSession.status,
        provider: 'asaas',
        paymentMethod: 'pix',
        providerPaymentId: pixSession.paymentId,
        providerSubscriptionId: pixSession.subscriptionId,
        paymentRequired: pixSession.status !== 'active',
      } : current);
      showToast('Cobrança Pix criada. Finalize o pagamento para ativar sua conta.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível iniciar o pagamento agora.'), 'error');
    } finally {
      setProcessingMethod(null);
    }
  };

  const copyPixPayload = async () => {
    if (!pixCheckout?.pixCopyPaste) {
      showToast('Código Pix indisponível.', 'info');
      return;
    }

    try {
      await navigator.clipboard.writeText(pixCheckout.pixCopyPaste);
      showToast('Código Pix copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar o código Pix.', 'error');
    }
  };

  const checkPayment = async () => {
    setCheckingPayment(true);

    try {
      if (pixCheckout?.paymentId) {
        const updated = await billingApi.getPixPaymentStatus(pixCheckout.paymentId);
        setPixCheckout((current) => current ? {
          ...current,
          status: updated.status,
          qrCode: updated.qrCode || current.qrCode,
          pixCopyPaste: updated.pixCopyPaste || current.pixCopyPaste,
          expiresAt: updated.expiresAt || current.expiresAt,
        } : current);

        if (updated.status === 'active') {
          showToast('Pagamento confirmado. Acesso liberado.', 'success');
          router.replace('/dashboard');
          return;
        }

        showToast('Pagamento ainda aguardando confirmação.', 'info');
        return;
      }

      const status = await refreshBillingStatus();
      if (!ACTIVE_STATUSES.has(status.subscriptionStatus)) {
        showToast('Pagamento ainda aguardando confirmação.', 'info');
      }
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível verificar o pagamento.'), 'error');
    } finally {
      setCheckingPayment(false);
    }
  };

  if (loading || authLoading) {
    return (
      <main className="app-theme flex min-h-screen items-center justify-center px-4">
        <div className="flex items-center gap-3 text-muted">
          <Icon name="progress_activity" size={20} className="animate-spin text-brand-text" />
          Carregando pagamento...
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="app-theme min-h-screen px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-control border border-line bg-surface-2">
            <Image src={easyAgendaLogo} alt="Logo EasyAgenda+" width={40} height={40} className="h-full w-full object-contain" />
          </span>
          <span className="text-xl font-black text-brand-text">EasyAgenda+</span>
        </div>

        <Button type="button" variant="ghost" onClick={logout}>
          Sair
        </Button>
      </div>

      <section className="mx-auto mt-6 sm:mt-10 grid w-full max-w-5xl gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <p className="text-[13px] font-semibold text-success-text">E-mail confirmado</p>
          <h1 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
            Finalize o pagamento para ativar sua conta
          </h1>
          <p className="mt-4 text-muted">
            Seu cadastro foi confirmado. O dashboard será liberado automaticamente após Pix confirmado ou assinatura com cartão ativa.
          </p>

          <div className="mt-6 rounded-control border border-brand/30 bg-brand/10 p-4">
            <p className="text-[13px] text-muted">Plano selecionado</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">{plan.name}</h2>
                <p className="text-[13px] text-muted">{planoDoCatalogo(plan.id).descricao}</p>
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-[13px] text-muted line-through">{formatCurrency(originalAmount)}</p>
                )}
                <p className="text-xl font-bold text-brand-text">
                  {formatCurrency(finalAmount)}
                  <span className="text-[13px] font-normal text-muted">/mês</span>
                </p>
                {hasDiscount && (
                  <p className="text-[13px] font-semibold text-success">Desconto de {formatCurrency(appliedDiscount)}</p>
                )}
              </div>
            </div>
          </div>

          <ul className="mt-6 space-y-3">
            {[rotuloEquipe(planoDoCatalogo(plan.id).limiteProfissionais), ...planoDoCatalogo(plan.id).destaques].map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-[15px] text-muted">
                <Icon name="verified_user" size={16} className="mt-0.5 shrink-0 text-success" />
                {feature}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-ink">Escolha a forma de pagamento</h2>
          <p className="mt-2 text-[13px] text-muted">
            Status atual: <span className="font-semibold text-warning">{billingStatus?.subscriptionStatus || 'incomplete'}</span>
          </p>

          {/* O rótulo só existe enquanto o campo existe: com cupom válido não há controle para apontar. */}
          {couponState !== 'valid' ? (
            <Field
              id="coupon-code"
              label="Cupom de desconto"
              className="mt-6"
              error={couponState === 'invalid' ? 'Cupom inválido ou expirado.' : undefined}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="coupon-code"
                  type="text"
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value.toUpperCase());
                    setCouponState('idle');
                    setCouponData(null);
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && handleApplyCoupon()}
                  placeholder="EX: PROMO100"
                  invalid={couponState === 'invalid'}
                  aria-describedby={couponState === 'invalid' ? 'coupon-code-error' : undefined}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleApplyCoupon}
                  disabled={couponState === 'loading' || !couponCode.trim()}
                >
                  {couponState === 'loading' ? 'Verificando...' : 'Aplicar'}
                </Button>
              </div>
            </Field>
          ) : (
            <div className="mt-6 flex items-center justify-between rounded-control border border-success/30 bg-success/12 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Icon name="check" size={16} className="shrink-0 text-success-text" />
                <div>
                  <p className="text-[15px] font-medium text-success-text">{couponCode}</p>
                  <p className="text-[13px] text-muted">
                    {couponData?.finalAmount === 0
                      ? 'Ativação gratuita aplicada'
                      : `Desconto de R$ ${couponData?.discount.toFixed(2).replace('.', ',')}`
                    }
                  </p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearCoupon}>
                Remover
              </Button>
            </div>
          )}

          <div className="mt-6 grid gap-3">
            <Button
              type="button"
              onClick={() => startCheckout('pix')}
              disabled={Boolean(processingMethod)}
              loading={processingMethod === 'pix'}
              fullWidth
            >
              {processingMethod !== 'pix' && <Icon name="qr_code_2" size={18} />}
              {isFreeActivation ? 'Ativar gratuitamente' : 'Pagar com Pix'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => startCheckout('card')}
              disabled={Boolean(processingMethod)}
              loading={processingMethod === 'card'}
              fullWidth
            >
              {processingMethod !== 'card' && <Icon name="credit_card" size={18} />}
              Assinar com Cartão
            </Button>
          </div>

          {pixCheckout && (
            <div className="mt-6 rounded-control border border-line bg-surface-2 p-4">
              <p className="text-[15px] font-semibold text-brand-text">Aguardando confirmação do pagamento</p>

              {appliedCouponCode && hasDiscount && (
                <p className="mt-2 text-[13px] text-muted">
                  Cupom aplicado: <span className="font-semibold text-ink">{appliedCouponCode}</span> - desconto de {formatCurrency(appliedDiscount)}
                </p>
              )}

              {pixQrCodeSource && (
                <Card className="qr-surface mx-auto mt-4 w-fit border-line p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pixQrCodeSource}
                    alt="QR Code Pix"
                    className="h-48 w-48"
                  />
                </Card>
              )}

              {pixCheckout.pixCopyPaste && (
                <div className="mt-4 space-y-2">
                  <Input readOnly value={pixCheckout.pixCopyPaste} aria-label="Código Pix copia e cola" />
                  <Button type="button" variant="secondary" fullWidth onClick={copyPixPayload}>
                    <Icon name="content_copy" size={16} />
                    Copiar código Pix
                  </Button>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={checkPayment}
            loading={checkingPayment}
            fullWidth
            className="mt-4"
          >
            {!checkingPayment && <Icon name="refresh" size={16} />}
            Já paguei, verificar pagamento
          </Button>
        </Card>
      </section>
    </main>
  );
}

export default function PagamentoPage() {
  return (
    <Suspense fallback={<div className="app-theme min-h-screen px-4 py-8">Carregando pagamento...</div>}>
      <PagamentoContent />
    </Suspense>
  );
}
