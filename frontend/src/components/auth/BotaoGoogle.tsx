'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

// Login com Google (fase 7). Some quando o provedor não está configurado (NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO).
export const loginGoogleAtivo = () => process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO === '1';

function LogoGoogle() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function BotaoGoogle({ plano }: { plano?: string | null }) {
  const { showToast } = useToast();
  const [indo, setIndo] = useState(false);
  if (!loginGoogleAtivo()) return null;

  const entrar = async () => {
    setIndo(true);
    try {
      const volta = `${window.location.origin}/auth/callback${plano ? `?plan=${encodeURIComponent(plano)}` : ''}`;
      const { error } = await getSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: volta } });
      if (error) throw error;
    } catch {
      setIndo(false);
      showToast('Não foi possível abrir o Google. Tente de novo.', 'error');
    }
  };

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={entrar}
        disabled={indo}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-control border border-line bg-surface text-[15px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        <LogoGoogle />
        Continuar com Google
      </button>
      <div className="mt-5 flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
