'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { resolveAuthConfirmRedirectUrl } from '@/lib/supabase/client';
import { Banner, Button, Card, Field, Input } from '@/components/ui';

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error';

interface EmailVerificationViewProps {
  initialToken: string | null;
  initialEmail: string;
}

const normalizeToken = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function EmailVerificationView({ initialToken, initialEmail }: EmailVerificationViewProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const { showToast } = useToast();

  const token = useMemo(() => normalizeToken(initialToken), [initialToken]);

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Link de verificação inválido. Solicite um novo e-mail de verificação.');
        return;
      }

      setStatus('loading');
      setMessage('Validando seu link de verificação...');

      try {
        const response = await api.get('/auth/verify-email', {
          params: { token },
        });

        if (!mounted) return;

        const successMessage =
          typeof response.data?.message === 'string'
            ? response.data.message
            : 'E-mail verificado com sucesso. Você já pode fazer login.';

        setStatus('success');
        setMessage(successMessage);
        showToast(successMessage, 'success');
      } catch (error: unknown) {
        if (!mounted) return;

        const errorMessage = getApiErrorMessage(
          error,
          'Não foi possível verificar seu e-mail. Solicite um novo link.'
        );

        setStatus('error');
        setMessage(errorMessage);
      }
    };

    verify();

    return () => {
      mounted = false;
    };
  }, [showToast, token]);

  const handleResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      showToast('Informe o e-mail da conta para reenviar o link.', 'error');
      return;
    }

    setResending(true);

    try {
      const response = await api.post('/auth/resend-verification', {
        email: normalizedEmail,
        emailRedirectTo: resolveAuthConfirmRedirectUrl(),
      });

      const successMessage =
        typeof response.data?.message === 'string'
          ? response.data.message
          : 'Se existir uma conta pendente para este e-mail, processaremos um novo envio de verificação.';

      setMessage(successMessage);
      showToast(successMessage, 'info');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível reenviar o e-mail de verificação.'), 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="app-theme min-h-screen px-4 py-10">
      <Card className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">EasyAgenda+</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Verificação de e-mail</h1>

        <p className="mt-4 text-sm text-muted">{message}</p>

        {status === 'loading' && (
          <Banner tone="info" variant="inline" className="mt-6">
            Aguarde enquanto validamos seu link...
          </Banner>
        )}

        {status === 'success' && (
          <Banner tone="success" variant="inline" className="mt-6">
            Conta liberada. Você já pode entrar no painel.
          </Banner>
        )}

        {status === 'error' && (
          <form onSubmit={handleResend} method="post" className="mt-6 space-y-3">
            <Field id="resend-email" label="Reenviar e-mail de verificação">
              <Input
                id="resend-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Digite seu e-mail"
                required
              />
            </Field>
            <Button type="submit" fullWidth loading={resending}>
              {resending ? 'Reenviando...' : 'Reenviar link de verificação'}
            </Button>
          </form>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-control border border-line px-4 py-2 font-semibold text-brand-text"
          >
            Ir para login
          </Link>
          <Link href="/cadastro" className="text-muted hover:text-ink">
            Criar nova conta
          </Link>
        </div>
      </Card>
    </div>
  );
}
