import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockSignIn = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockPost = vi.fn();
const mockReplace = vi.fn();
const mockRefreshMe = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({ auth: { signInWithOAuth: mockSignIn, getSession: mockGetSession, signOut: mockSignOut } }),
  resolveAuthConfirmRedirectUrl: () => 'http://localhost/auth/confirm',
}));

vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: vi.fn() } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null, loading: false, isAuthenticated: false,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshMe: mockRefreshMe,
  }),
}));

vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const { AuthForm } = await import('../AuthForm');
const { OAuthCallbackView } = await import('../OAuthCallbackView');
const { CompletarCadastroView } = await import('../CompletarCadastroView');

const irPara = (url: string) => window.history.replaceState({}, '', url);

describe('Login com Google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO = '1';
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'token-do-supabase-com-mais-de-20' } } });
    mockSignIn.mockResolvedValue({ data: {}, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    sessionStorage.clear();
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO;
    irPara('/');
  });

  it('mostra Continuar com Google quando ativo', () => {
    irPara('/login');
    const { unmount } = render(<AuthForm mode="login" />);
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument();
    unmount();
    irPara('/cadastro');
    render(<AuthForm mode="register" />);
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument();
  });

  it('sem a variável o botão não aparece', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO;
    render(<AuthForm mode="login" />);
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).not.toBeInTheDocument();
  });

  it('botão leva o plano para o callback', async () => {
    irPara('/cadastro?plan=premium');
    render(<AuthForm mode="register" />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    const arg = mockSignIn.mock.calls[0][0];
    expect(arg.provider).toBe('google');
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback\?plan=premium$/);
  });

  it('callback com conta existente vai para o destino', async () => {
    mockPost.mockResolvedValue({ data: { completarCadastro: false, paymentRequired: false } });
    render(<OAuthCallbackView />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'));
    expect(mockPost).toHaveBeenCalledWith('/auth/oauth/sessao', { accessToken: 'token-do-supabase-com-mais-de-20' });
    expect(mockRefreshMe).toHaveBeenCalled();
    // A sessão do Google não fica no navegador depois de virar a sessão do app.
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('callback sem conta vai para completar', async () => {
    irPara('/auth/callback?plan=premium');
    mockPost.mockResolvedValue({ data: { completarCadastro: true, email: 'dona@x.com', nome: 'Ana Souza' } });
    render(<OAuthCallbackView />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cadastro/completar?plan=premium'));
    expect(JSON.parse(sessionStorage.getItem('easyagenda:oauth-completar') || '{}')).toEqual({ email: 'dona@x.com', nome: 'Ana Souza' });
    // O completar ainda precisa da sessão do Google.
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('completar envia os dados sem e-mail e senha', async () => {
    irPara('/cadastro/completar?plan=premium');
    sessionStorage.setItem('easyagenda:oauth-completar', JSON.stringify({ email: 'dona@x.com', nome: 'Ana Souza' }));
    mockPost.mockResolvedValue({ data: { completarCadastro: false, paymentRequired: true, desiredPlan: 'premium' } });
    render(<CompletarCadastroView />);

    expect(await screen.findByText('dona@x.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do responsável')).toHaveValue('Ana Souza');
    expect(screen.queryByLabelText(/senha/i)).not.toBeInTheDocument();
    expect(screen.getByText('Já tem conta com outro e-mail? Entre com ele.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome do negócio'), { target: { value: 'Studio Aurora' } });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '11999999999' } });
    fireEvent.change(screen.getByLabelText('CPF/CNPJ'), { target: { value: '529.982.247-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/auth/oauth/completar', {
      accessToken: 'token-do-supabase-com-mais-de-20', businessName: 'Studio Aurora', ownerName: 'Ana Souza',
      whatsapp: '11999999999', cpfCnpj: '52998224725', desiredPlan: 'premium',
    }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/pagamento?from=confirm&plan=premium'));
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('completar sem sessão do Google volta ao cadastro', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<CompletarCadastroView />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cadastro'));
  });
});
