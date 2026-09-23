'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import {
  getSupabaseClient,
  getSupabaseClientDiagnostics,
  getMissingSupabasePublicEnvVars,
  isSupabaseClientConfigured,
} from '@/lib/supabase/client';
import { resolveResetPasswordRedirectUrl } from '@/lib/appUrl';
import { Banner, Button, Card, Field, Input } from '@/components/ui';

type ForgotPasswordViewProps = {
  appUrl?: string;
};

const AUTH_CONNECTION_ERROR_MESSAGE =
  'Não foi possível conectar ao serviço de autenticação. Verifique a configuração do Supabase.';

const maskEmail = (email: string) => {
  const [localPart, domainPart = ''] = email.split('@');

  if (!localPart || !domainPart) {
    return 'email-invalido';
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || '*'}***@${domainPart}`;
  }

  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domainPart}`;
};

export function ForgotPasswordView({ appUrl }: ForgotPasswordViewProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus('error');
      setMessage('Informe seu e-mail.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const redirectTo = resolveResetPasswordRedirectUrl(appUrl);
      const maskedEmail = maskEmail(normalizedEmail);
      const diagnostics = getSupabaseClientDiagnostics();

      console.info('[forgot-password] debug seguro de configuração', {
        operation: 'resetPasswordForEmail',
        email: maskedEmail,
        redirectTo,
        supabaseUrl: diagnostics.supabaseUrlMasked,
        hasSupabaseUrl: diagnostics.hasSupabaseUrl,
        hasSupabaseAnonKey: diagnostics.hasSupabaseAnonKey,
        supabaseUrlProjectRef: diagnostics.supabaseUrlProjectRef,
        anonKeyProjectRef: diagnostics.anonKeyProjectRef,
        canCompareProjectRef: diagnostics.canCompareProjectRef,
        isProjectRefMismatch: diagnostics.isProjectRefMismatch,
      });

      if (!isSupabaseClientConfigured()) {
        throw new Error(
          `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
        );
      }

      const supabase = getSupabaseClient();

      const response = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
      });

      console.info('[forgot-password] operação concluída', {
        operation: 'resetPasswordForEmail',
        email: maskedEmail,
        redirectTo,
        supabaseUrl: diagnostics.supabaseUrlMasked,
        message: response.error?.message || null,
        name: response.error?.name || null,
      });

      if (response.error) {
        throw response.error;
      }

      setStatus('success');
      setMessage('Link de redefinição enviado. Confira seu e-mail para continuar.');
    } catch (error) {
      const diagnostics = getSupabaseClientDiagnostics();
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      const name = error instanceof Error ? error.name : 'UnknownError';

      console.error('[forgot-password] operação falhou', {
        operation: 'resetPasswordForEmail',
        email: maskEmail(normalizedEmail),
        redirectTo: resolveResetPasswordRedirectUrl(appUrl),
        supabaseUrl: diagnostics.supabaseUrlMasked,
        message,
        name,
      });

      setStatus('error');
      if (message.includes('Failed to fetch')) {
        setMessage(AUTH_CONNECTION_ERROR_MESSAGE);
      } else if (message.includes('Configuração do Supabase')) {
        setMessage(message);
      } else {
        setMessage('Não foi possível enviar o link de redefinição agora. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-theme min-h-screen px-4 py-10">
      <Card className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">EasyAgenda+</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Esqueceu a senha?</h1>
        <p className="mt-4 text-sm text-muted">
          Informe o e-mail da sua conta para receber o link de redefinição.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field id="forgot-password-email" label="E-mail">
            <Input
              id="forgot-password-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Digite seu e-mail"
              required
            />
          </Field>

          {message ? (
            <Banner tone={status === 'success' ? 'success' : 'danger'} variant="inline">
              {message}
            </Banner>
          ) : null}

          <Button type="submit" fullWidth loading={loading}>
            {loading ? 'Enviando...' : 'Enviar link de redefinição'}
          </Button>
        </form>

        <div className="mt-6 text-sm">
          <Link href="/login" className="text-muted hover:text-ink">
            Voltar para o login
          </Link>
        </div>
      </Card>
    </div>
  );
}
