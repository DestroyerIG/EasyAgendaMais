'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { destinoAposConfirmar } from './AuthConfirmView';

export const CHAVE_OAUTH_COMPLETAR = 'easyagenda:oauth-completar';

/**
 * Sessão do Supabase depois do Google. O cliente não lê a URL sozinho (detectSessionInUrl: false),
 * então aqui tratamos o fluxo implícito (#access_token) e o PKCE (?code=) e guardamos a sessão,
 * que a tela de completar cadastro lê de novo.
 */
export async function sessaoDoGoogle(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (typeof window !== 'undefined') {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      return accessToken;
    }
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      const { data } = await supabase.auth.exchangeCodeForSession(code);
      if (data.session?.access_token) return data.session.access_token;
    }
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * A sessão do Supabase só serve para trocar pela sessão do app. Depois disso sai do navegador, para
 * ninguém reabrir a conta pelo /auth/callback num computador compartilhado.
 */
export async function encerrarSessaoDoGoogle(): Promise<void> {
  try {
    await getSupabaseClient().auth.signOut({ scope: 'local' });
  } catch { /* não impede a entrada */ }
}

export function OAuthCallbackView() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const iniciou = useRef(false);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    (async () => {
      try {
        const accessToken = await sessaoDoGoogle();
        if (!accessToken) {
          router.replace('/login');
          return;
        }
        const { data } = await api.post('/auth/oauth/sessao', { accessToken });
        const resposta = data as { completarCadastro?: boolean; email?: string; nome?: string };
        if (resposta.completarCadastro) {
          sessionStorage.setItem(CHAVE_OAUTH_COMPLETAR, JSON.stringify({ email: resposta.email, nome: resposta.nome }));
          const plano = new URLSearchParams(window.location.search).get('plan');
          router.replace(`/cadastro/completar${plano ? `?plan=${encodeURIComponent(plano)}` : ''}`);
          return;
        }
        await encerrarSessaoDoGoogle();
        await refreshMe();
        router.replace(destinoAposConfirmar(resposta));
      } catch (e) {
        setErro(getApiErrorMessage(e, 'Não foi possível entrar com o Google. Tente de novo.'));
      }
    })();
  }, [refreshMe, router]);

  return (
    <main className="app-theme flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        {erro ? (
          <>
            <p className="text-[15px] text-ink">{erro}</p>
            <Link href="/login" className="mt-4 inline-block text-[14px] font-semibold text-brand-text hover:underline">
              Voltar para o login
            </Link>
          </>
        ) : (
          <p className="text-[15px] text-muted">Entrando com o Google...</p>
        )}
      </Card>
    </main>
  );
}
