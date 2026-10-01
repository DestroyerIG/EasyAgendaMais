'use client';

import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSupabaseClient,
  getMissingSupabasePublicEnvVars,
  isSupabaseClientConfigured,
} from '@/lib/supabase/client';
import { Banner, Button, Card, Field, PasswordInput } from '@/components/ui';

type Status = 'loading' | 'ready' | 'success' | 'error';
const MIN_PASSWORD_LENGTH = 6;

const readAuthParam = (searchParams: URLSearchParams, hashParams: URLSearchParams, key: string) => {
  return searchParams.get(key) || hashParams.get(key);
};

export function ResetPasswordView() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Validando link de redefinição...');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const prepareSession = async () => {
      try {
        if (!isSupabaseClientConfigured()) {
          throw new Error(
            `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
          );
        }

        const supabase = getSupabaseClient();
        const currentUrl = new URL(window.location.href);
        const searchParams = currentUrl.searchParams;

        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);

        const accessToken = readAuthParam(searchParams, hashParams, 'access_token');
        const refreshToken = readAuthParam(searchParams, hashParams, 'refresh_token');
        const type = readAuthParam(searchParams, hashParams, 'type');
        const authCode = readAuthParam(searchParams, hashParams, 'code');
        const tokenHash = readAuthParam(searchParams, hashParams, 'token_hash');

        if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }
        } else if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);

          if (error) {
            throw error;
          }
        } else if (type === 'recovery' && tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          if (error) {
            throw error;
          }
        } else {
          throw new Error('Link inválido ou expirado.');
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('Sessão de recuperação não foi criada.');
        }

        const cleanUrl = new URL(window.location.origin + window.location.pathname);
        window.history.replaceState({}, document.title, cleanUrl.toString());

        if (!active) return;

        setStatus('ready');
        setMessage('Defina sua nova senha para concluir o processo.');
      } catch (error) {
        console.error('Erro ao preparar redefinição de senha:', error);

        if (!active) return;

        setStatus('error');
        setMessage('O link de redefinição é inválido ou expirou. Solicite um novo.');
      }
    };

    void prepareSession();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus('error');
      setMessage(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (password !== confirmPassword) {
      setStatus('error');
      setMessage('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    setMessage('Atualizando sua senha...');

    try {
      if (!isSupabaseClientConfigured()) {
        throw new Error(
          `Configuração do Supabase ausente no frontend. Verifique ${getMissingSupabasePublicEnvVars().join(', ')}.`
        );
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setStatus('success');
      setMessage('Senha redefinida com sucesso. Redirecionando para o login...');
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace('/login?reset=1');
      }, 1800);
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      setStatus('error');
      if (error instanceof Error && error.message.includes('Configuração do Supabase')) {
        setMessage(error.message);
      } else {
        setMessage('Não foi possível redefinir sua senha. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-theme min-h-screen px-4 py-10">
      <Card className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">EasyAgenda+</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Redefinir senha</h1>

        <p className="mt-4 text-sm text-muted">{message}</p>

        {status === 'ready' && (
          // method="post": sem isso, um clique antes do React hidratar cai no submit
          // nativo do HTML (GET para a própria URL), vazando a senha nova na URL.
          <form onSubmit={handleSubmit} method="post" className="mt-6 space-y-4">
            <Field id="new-password" label="Nova senha">
              <PasswordInput
                id="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite a nova senha"
                minLength={MIN_PASSWORD_LENGTH}
                required
                toggleLabel="senha"
              />
            </Field>

            <Field id="confirm-password" label="Confirmar nova senha">
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
                minLength={MIN_PASSWORD_LENGTH}
                required
                toggleLabel="senha"
              />
            </Field>

            <Button type="submit" fullWidth loading={submitting}>
              {submitting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        )}

        {status === 'success' && (
          <Banner tone="success" variant="inline" className="mt-6">
            Senha atualizada com sucesso.
          </Banner>
        )}

        {status === 'error' && (
          <div className="mt-6 space-y-4">
            <Banner tone="warning" variant="inline">
              Não foi possível concluir a redefinição com este link.
            </Banner>

            <Link
              href="/esqueci-senha"
              className="inline-flex rounded-control border border-line px-4 py-2 font-semibold text-brand-text"
            >
              Solicitar novo link
            </Link>
          </div>
        )}

        <div className="mt-7 text-sm">
          <Link href="/login" className="text-muted hover:text-ink">
            Voltar para o login
          </Link>
        </div>
      </Card>
    </div>
  );
}
