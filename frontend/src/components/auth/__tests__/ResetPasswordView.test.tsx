import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResetPasswordView } from '../ResetPasswordView';

/**
 * Mesma regressão de segurança do AuthForm: sem method="post", um clique antes da
 * hidratação do React cai no submit nativo do HTML (GET para a própria URL), vazando a
 * senha nova (e a confirmação) em texto puro na barra de endereço.
 */

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseClientConfigured: () => true,
  getMissingSupabasePublicEnvVars: () => [],
  getSupabaseClient: () => ({
    auth: {
      setSession: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } }),
      exchangeCodeForSession: vi.fn(),
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

describe('ResetPasswordView', () => {
  it('o formulário de nova senha usa method="post"', async () => {
    window.history.pushState(
      {},
      '',
      '/redefinir-senha#access_token=a&refresh_token=b&type=recovery',
    );

    render(<ResetPasswordView />);

    const form = await screen.findByRole('button', { name: /Salvar nova senha/ }).then((btn) => btn.closest('form'));
    expect(form).toHaveAttribute('method', 'post');
  });
});
