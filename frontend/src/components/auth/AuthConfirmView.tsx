'use client';

import type { EmailOtpType } from '@supabase/supabase-js';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  getSupabaseClient,
  isSupabaseClientConfigured,
  resolveAuthConfirmRedirectUrl,
} from '@/lib/supabase/client';
import { Banner, Button, Card, Field, Input } from '@/components/ui';

type ConfirmationStatus = 'loading' | 'success' | 'error';

interface CallbackParams {
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  legacyToken: string | null;
  error: string | null;
  errorCode: string | null;
}

const SUCCESS_REDIRECT_URL = '/login?confirmed=1';
const PAYMENT_REDIRECT_FALLBACK_URL = '/pagamento';

const SUPABASE_EMAIL_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'email',
];

const normalizeValue = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const firstValue = (...candidates: Array<string | null>) => {
  for (const candidate of candidates) {
    const normalized = normalizeValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const toEmailOtpType = (value: string | null): EmailOtpType | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (SUPABASE_EMAIL_OTP_TYPES.includes(normalized as EmailOtpType)) {
    return normalized as EmailOtpType;
  }

  return null;
};

const resolveOtpTypeCandidates = (type: EmailOtpType | null): EmailOtpType[] => {
  const candidates: EmailOtpType[] = [];

  if (type) {
    candidates.push(type);
  }

  for (const fallbackType of ['signup', 'email'] as const) {
    if (!candidates.includes(fallbackType)) {
      candidates.push(fallbackType);
    }
  }

  return candidates;
};

const getBackendMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { message?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return fallback;
};

const logConfirmSignup = (context: Record<string, unknown>) => {
  console.info('Auth confirm', {
    operation: 'confirmSignup',
    ...context,
  });
};

const getSyncSummary = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const confirmation = (payload as { confirmation?: unknown }).confirmation;
  return confirmation && typeof confirmation === 'object'
    ? confirmation as Record<string, unknown>
    : null;
};

const getPaymentRedirectUrl = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return PAYMENT_REDIRECT_FALLBACK_URL;
  }

  const data = payload as {
    desiredPlan?: unknown;
    paymentRequired?: unknown;
    confirmation?: {
      desiredPlan?: unknown;
      paymentRequired?: unknown;
    };
  };
  const desiredPlan = typeof data.desiredPlan === 'string'
    ? data.desiredPlan
    : typeof data.confirmation?.desiredPlan === 'string'
    ? data.confirmation.desiredPlan
    : null;
  const paymentRequired = data.paymentRequired === true || data.confirmation?.paymentRequired === true;
  const params = new URLSearchParams({ from: 'confirm' });

  if (desiredPlan) {
    params.set('plan', desiredPlan);
  }

  return paymentRequired
    ? `/pagamento?${params.toString()}`
    : '/dashboard';
};

/** Para onde vai quem acabou de ter a conta confirmada (também usado no login com Google). */
export const destinoAposConfirmar = getPaymentRedirectUrl;

export function AuthConfirmView() {
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [message, setMessage] = useState('Confirmando seu e-mail...');
  const [email, setEmail] = useState('');
  const [successRedirectUrl, setSuccessRedirectUrl] = useState(PAYMENT_REDIRECT_FALLBACK_URL);
  const [resending, setResending] = useState(false);

  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;

    const confirmEmail = async () => {
      setStatus('loading');
      setMessage('Confirmando seu e-mail...');

      try {
        if (!isSupabaseClientConfigured()) {
          throw new Error(
            'Configuração Supabase ausente no frontend. Solicite suporte para configurar as variáveis públicas.'
          );
        }

        const readCallbackParams = (): CallbackParams => {
          const searchParams = new URLSearchParams(window.location.search);
          const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;
          const hashParams = new URLSearchParams(hash);

          return {
            code: firstValue(hashParams.get('code'), searchParams.get('code')),
            tokenHash: firstValue(
              hashParams.get('token_hash'),
              hashParams.get('tokenHash'),
              searchParams.get('token_hash'),
              searchParams.get('tokenHash')
            ),
            type: toEmailOtpType(firstValue(hashParams.get('type'), searchParams.get('type'))),
            accessToken: firstValue(
              hashParams.get('access_token'),
              hashParams.get('accessToken'),
              searchParams.get('access_token'),
              searchParams.get('accessToken')
            ),
            refreshToken: firstValue(
              hashParams.get('refresh_token'),
              hashParams.get('refreshToken'),
              searchParams.get('refresh_token'),
              searchParams.get('refreshToken')
            ),
            email: firstValue(hashParams.get('email'), searchParams.get('email')),
            legacyToken: firstValue(searchParams.get('token')),
            error: firstValue(hashParams.get('error'), searchParams.get('error')),
            errorCode: firstValue(hashParams.get('error_code'), searchParams.get('error_code')),
          };
        };

        const scrubSensitiveUrlParams = (currentEmail: string | null) => {
          const cleanUrl = new URL(window.location.origin + window.location.pathname);

          if (currentEmail) {
            cleanUrl.searchParams.set('email', currentEmail);
          }

          window.history.replaceState({}, document.title, cleanUrl.toString());
        };

        const callbackParams = readCallbackParams();
        scrubSensitiveUrlParams(callbackParams.email);

        logConfirmSignup({
          codePresent: Boolean(callbackParams.code),
          tokenHashPresent: Boolean(callbackParams.tokenHash),
          type: callbackParams.type,
          email: callbackParams.email,
          reason: callbackParams.errorCode || callbackParams.error || 'callback_received',
        });

        if (callbackParams.email && active) {
          setEmail(callbackParams.email);
        }

        if (callbackParams.error || callbackParams.errorCode) {
          throw new Error(
            callbackParams.errorCode === 'otp_expired'
              ? 'Link expirado ou inválido'
              : 'Link de confirmação inválido ou incompleto. Solicite um novo e-mail.'
          );
        }

        const supabase = getSupabaseClient();
        let accessToken = callbackParams.accessToken;
        let supabaseConfirmed = false;
        let supabaseUserId: string | null = null;

        if (callbackParams.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(callbackParams.code);

          if (error) {
            throw error;
          }

          supabaseConfirmed = true;
          accessToken = data.session?.access_token || accessToken;
          supabaseUserId = data.user?.id || null;

          if (active && data.user?.email) {
            setEmail(data.user.email);
          }
        } else if (callbackParams.tokenHash) {
          const otpTypes = resolveOtpTypeCandidates(callbackParams.type);
          let otpError: unknown = null;

          for (const otpType of otpTypes) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: callbackParams.tokenHash,
              type: otpType,
            });

            if (error) {
              otpError = error;
              continue;
            }

            supabaseConfirmed = true;
            accessToken = data.session?.access_token || accessToken;
            supabaseUserId = data.user?.id || null;

            if (active && data.user?.email) {
              setEmail(data.user.email);
            }

            otpError = null;
            break;
          }

          if (otpError) {
            throw otpError;
          }
        } else if (callbackParams.accessToken && callbackParams.refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: callbackParams.accessToken,
            refresh_token: callbackParams.refreshToken,
          });

          if (error) {
            throw error;
          }

          supabaseConfirmed = true;
          accessToken = data.session?.access_token || callbackParams.accessToken;
          supabaseUserId = data.user?.id || null;

          if (active && data.user?.email) {
            setEmail(data.user.email);
          }
        } else if (callbackParams.legacyToken) {
          const legacyResponse = await api.get('/auth/verify-email', {
            params: { token: callbackParams.legacyToken },
          });

          if (!active) return;

          const successMessage = getBackendMessage(
            legacyResponse.data,
            'E-mail confirmado com sucesso. Agora você já pode entrar.'
          );

          setStatus('success');
          setMessage(successMessage);
          showToast(successMessage, 'success');
          return;
        } else {
          throw new Error('Link de confirmação inválido ou incompleto. Solicite um novo e-mail.');
        }

        if (supabaseConfirmed && !accessToken) {
          const { data } = await supabase.auth.getSession();
          accessToken = data.session?.access_token || null;
        }

        try {
          let syncResponse = null;

          if (accessToken) {
            syncResponse = await api.post('/auth/confirm', {
              accessToken,
            });
          } else {
            throw new Error('Falha ao finalizar cadastro');
          }

          if (!active) return;

          const successMessage = getBackendMessage(
            syncResponse?.data,
            'E-mail confirmado com sucesso'
          );
          const syncSummary = getSyncSummary(syncResponse?.data);

          logConfirmSignup({
            supabaseUserId: syncSummary?.supabaseUserId || supabaseUserId,
            email: syncSummary?.email || callbackParams.email || null,
            localSyncApplied: syncSummary?.syncApplied === true,
            pendingRegistrationCompleted: syncSummary?.pendingRegistrationCompleted === true,
            localUserCreatedOrUpdated:
              syncSummary?.localUserCreated === true || syncSummary?.localUserUpdated === true,
            reason: syncSummary?.reason || 'confirmation_completed',
          });

          setStatus('success');
          setSuccessRedirectUrl(getPaymentRedirectUrl(syncResponse?.data));
          setMessage(
            syncResponse?.data?.paymentRequired === true
              ? 'E-mail confirmado com sucesso. Agora finalize o pagamento para ativar sua conta.'
              : successMessage
          );
          showToast(successMessage, 'success');
        } catch (syncError) {
          if (!active) return;

          const fallbackMessage = supabaseConfirmed
            ? 'Falha ao finalizar cadastro'
            : 'Não foi possível finalizar a confirmação do seu e-mail.';

          setStatus('error');
          setMessage(getApiErrorMessage(syncError, fallbackMessage));
          showToast(getApiErrorMessage(syncError, fallbackMessage), 'error');
        }
      } catch (error: unknown) {
        if (!active) return;

        const errorMessage = getApiErrorMessage(
          error,
          'Link expirado ou inválido'
        );

        setStatus('error');
        setMessage(errorMessage);
        showToast(errorMessage, 'error');
      }
    };

    void confirmEmail();

    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (status !== 'success') {
      return;
    }

    const redirectId = window.setTimeout(() => {
      router.replace(successRedirectUrl);
    }, 2400);

    return () => {
      window.clearTimeout(redirectId);
    };
  }, [router, status, successRedirectUrl]);

  const handleResendVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      showToast('Informe o e-mail da conta para reenviar a verificação.', 'error');
      return;
    }

    setResending(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email: normalizedEmail,
        emailRedirectTo: resolveAuthConfirmRedirectUrl(),
      });

      const resendMessage = getBackendMessage(
        response.data,
        'Se existir uma conta pendente, processaremos um novo envio de verificação.'
      );

      setMessage(resendMessage);
      showToast(resendMessage, 'info');
    } catch (error: unknown) {
      showToast(
        getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'),
        'error'
      );
    } finally {
      setResending(false);
    }
  };

  const successActionLabel = successRedirectUrl.startsWith('/pagamento')
    ? 'Ir para pagamento'
    : successRedirectUrl.startsWith('/dashboard')
    ? 'Ir para dashboard'
    : 'Continuar';

  return (
    <div className="app-theme min-h-screen px-4 py-10">
      <Card className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">EasyAgenda+</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Confirmação de e-mail</h1>

        <p className="mt-4 text-sm text-muted">{message}</p>

        {status === 'loading' && (
          <Banner tone="info" variant="inline" className="mt-6">
            Confirmando seu e-mail...
          </Banner>
        )}

        {status === 'success' && (
          <Banner tone="success" variant="inline" className="mt-6 flex-col items-start">
            <p className="font-semibold">E-mail confirmado com sucesso.</p>
            <p className="mt-1">Agora você já pode fazer login.</p>
          </Banner>
        )}

        {status === 'error' && (
          <form onSubmit={handleResendVerification} method="post" className="mt-6 space-y-3">
            <Banner tone="warning" variant="inline">
              Se o link expirou, informe seu e-mail para reenviar a verificação.
            </Banner>

            <Field id="confirm-resend-email" label="E-mail da conta">
              <Input
                id="confirm-resend-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu e-mail"
                required
              />
            </Field>

            <Button type="submit" fullWidth loading={resending}>
              {resending ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
            </Button>
          </form>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={status === 'success' ? successRedirectUrl : SUCCESS_REDIRECT_URL}
            className="rounded-control border border-line px-4 py-2 font-semibold text-brand-text"
          >
            {status === 'success' ? successActionLabel : 'Ir para login'}
          </Link>
          {status === 'success' && (
            <Link
              href={SUCCESS_REDIRECT_URL}
              className="rounded-control border border-line px-4 py-2 font-semibold text-muted hover:text-ink"
            >
              Ir para login
            </Link>
          )}
          <Link href="/cadastro" className="text-muted hover:text-ink">
            Criar nova conta
          </Link>
        </div>
      </Card>
    </div>
  );
}
