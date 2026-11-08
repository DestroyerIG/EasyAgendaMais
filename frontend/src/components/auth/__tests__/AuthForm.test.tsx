import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthForm } from '../AuthForm';

/**
 * Regressão de segurança: antes do React hidratar a página, o <form> já existe no HTML
 * puro sem method/action. Sem method="post" explícito, um clique nesse intervalo cai no
 * submit nativo do navegador — que por padrão usa GET para a própria URL — e o e-mail e a
 * senha em texto puro vão parar na barra de endereço, no histórico e em logs de acesso
 * (achado do usuário, reproduzido ao vivo: .../login?email=...&password=...).
 */

const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAuthenticated: false,
    login: mockLogin,
    register: mockRegister,
    logout: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

const escolha = vi.hoisted(() => ({ guardarEscolhaTeste: vi.fn() }));
vi.mock('@/lib/escolhaTeste', () => escolha);

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

describe('AuthForm', () => {
  it('o formulário de login usa method="post" — nunca cai no GET nativo do HTML se o clique acontecer antes da hidratação', () => {
    render(<AuthForm mode="login" />);
    const form = screen.getByRole('form', { name: 'Formulário de login' });
    expect(form).toHaveAttribute('method', 'post');
  });

  it('o formulário de cadastro também usa method="post" (mesmo risco, mesma proteção)', () => {
    render(<AuthForm mode="register" />);
    const form = screen.getByRole('form', { name: 'Formulário de cadastro' });
    expect(form).toHaveAttribute('method', 'post');
  });
  it('cadastro oferece 7 dias sem cartão ou 14 com cartão, e guarda a escolha', () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByRole('radio', { name: /Testar 7 dias grátis/ })).toBeChecked();
    expect(screen.getByText('Sem cartão. Entra agora.')).toBeInTheDocument();
    expect(screen.getByText('Com cartão cadastrado. A primeira cobrança só acontece no fim do teste; cancele antes e nada é cobrado.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Testar 14 dias grátis/ }));
    expect(escolha.guardarEscolhaTeste).toHaveBeenLastCalledWith('com_cartao');
    expect(screen.queryByText(/14 dias grátis · acesso completo/)).not.toBeInTheDocument();
  });

  it('login não mostra a escolha do teste', () => {
    render(<AuthForm mode="login" />);
    expect(screen.queryByRole('radio', { name: /Testar 7 dias grátis/ })).not.toBeInTheDocument();
  });

  it('login bem-sucedido troca o formulário pela tela "Abrindo seu painel" até o painel abrir', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dona@teste.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulário de login' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Abrindo seu painel'));
    expect(screen.queryByRole('form', { name: 'Formulário de login' })).not.toBeInTheDocument();
  });

  it('login com erro mantém o formulário e não mostra a tela de carregamento', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Credenciais inválidas'));
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dona@teste.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulário de login' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
    expect(screen.queryByText('Abrindo seu painel…')).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Formulário de login' })).toBeInTheDocument();
  });
});
