import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CatalogoPlanos, FaturasResponse, FormaPagamento, SubscriptionStatusResponse } from '@/lib/billing';

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getPlans: vi.fn(),
  getPaymentMethod: vi.fn(),
  getInvoices: vi.fn(),
  cancelSubscription: vi.fn(),
  reactivateSubscription: vi.fn(),
  cancelPlanChange: vi.fn(),
  getPixPaymentStatus: vi.fn(),
}));
const showToast = vi.hoisted(() => vi.fn());
const refreshMe = vi.hoisted(() => vi.fn());
const openBillingPortal = vi.hoisted(() => vi.fn());

vi.mock('@/lib/billing', () => ({ billingApi: api }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { plan: 'profissional', businessName: 'Studio Aurora', role: 'tenant_admin', email: 'a@b.c' }, refreshMe }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/hooks/useDashboardBilling', () => ({
  useDashboardBilling: () => ({ openBillingPortal, portalLoading: false }),
}));
vi.mock('@/components/marketing/PricingPlansSection', () => ({
  PricingPlansSection: () => <div data-testid="checkout">checkout</div>,
}));
vi.mock('@/components/shell/SettingsTabs', () => ({ SettingsTabs: () => null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/planos',
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: PlanosPage } = await import('../page');

const futuro = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

const catalogo: CatalogoPlanos = {
  planos: [
    { id: 'basico', nome: 'Solo', preco: 49.9, sobConsulta: false, limiteProfissionais: 1, publico: 'Autônomas', descricao: '', destaques: ['Caixa'], emBreve: [] },
    { id: 'profissional', nome: 'Equipe', preco: 99.9, sobConsulta: false, limiteProfissionais: 5, publico: 'Estúdios', descricao: '', destaques: ['Até 5 profissionais', 'Comissões'], emBreve: [] },
    { id: 'premium', nome: 'Salão', preco: 199.9, sobConsulta: false, limiteProfissionais: null, publico: 'Salões', descricao: '', destaques: [], emBreve: [] },
  ],
  matriz: [],
};

const status = (extra: Partial<SubscriptionStatusResponse> = {}): SubscriptionStatusResponse => ({
  plan: 'profissional',
  provider: 'asaas',
  paymentMethod: 'card',
  subscriptionStatus: 'active',
  currentPeriodStart: null,
  currentPeriodEnd: futuro,
  nextDueDate: futuro,
  cancelAtPeriodEnd: false,
  hasCustomer: true,
  planoAgendado: null,
  planoAgendadoEm: null,
  upgradePendente: null,
  profissionaisAtivas: 2,
  nomesProfissionais: ['Bruno', 'Carla'],
  ...extra,
});

const cartao: FormaPagamento = { tipo: 'card', bandeira: 'MASTERCARD', final: '8821', urlFatura: 'https://asaas/i/0' };

const faturas: FaturasResponse = {
  anos: [2026],
  itens: Array.from({ length: 5 }, (_, i) => ({
    id: `f${i}`,
    data: `2026-0${9 - i}-15T12:00:00.000Z`,
    referencia: 'Mensalidade EasyAgenda+ Equipe',
    periodoInicio: `2026-0${9 - i}-15T12:00:00.000Z`,
    periodoFim: `2026-${String(10 - i).padStart(2, '0')}-14T12:00:00.000Z`,
    valor: 99.9,
    forma: 'card' as const,
    formaDetalhe: 'Cartão de crédito',
    status: i === 0 ? ('em_aberto' as const) : ('pago' as const),
    tipo: 'mensalidade' as const,
    url: i === 0 ? 'https://asaas/i/0' : null,
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getStatus.mockResolvedValue(status());
  api.getPlans.mockResolvedValue(catalogo);
  api.getPaymentMethod.mockResolvedValue(cartao);
  api.getInvoices.mockResolvedValue(faturas);
});

describe('Plano e cobrança', () => {
  it('mostra plano, preço, profissionais reais e o cartão do Asaas', async () => {
    render(<PlanosPage />);
    expect(await screen.findByText('Plano Equipe (Mensal)')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s*99,90/).length).toBeGreaterThan(0);
    expect(screen.getByText('Até 5 profissionais na grade')).toBeInTheDocument();
    expect(screen.getByText('Bruno, Carla e 3 vagas livres')).toBeInTheDocument();
    expect(screen.getByText('•••• •••• •••• 8821')).toBeInTheDocument();
    expect(screen.getByText(/Próxima cobrança/)).toBeInTheDocument();
    expect(screen.queryByTestId('checkout')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mudar de plano/ })).toHaveAttribute('href', '/planos/comparar');
    expect(screen.getByText('Pagamento com cartão processado pelo Asaas.')).toBeInTheDocument();
    expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument();
  });

  it('cartão: "Pagar a fatura com outro cartão" abre a fatura do Asaas', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<PlanosPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Pagar a fatura com outro cartão/ }));
    expect(abrir).toHaveBeenCalledWith('https://asaas/i/0', '_blank', 'noopener,noreferrer');
    abrir.mockRestore();
  });

  it('volta do Asaas com ?cartao=retorno avisa que o cartão foi recebido', async () => {
    window.history.replaceState({}, '', '/planos?cartao=retorno');
    render(<PlanosPage />);
    expect(await screen.findByText('Cartão recebido. Assim que o Asaas confirmar, sua assinatura aparece aqui.')).toBeInTheDocument();
    window.history.replaceState({}, '', '/planos');
  });

  it('faturas reais: 4 primeiras, status e "Carregar histórico completo"', async () => {
    render(<PlanosPage />);
    expect(await screen.findAllByText('Mensalidade EasyAgenda+ Equipe')).not.toHaveLength(0);
    expect(screen.getAllByText('Em aberto').length).toBeGreaterThan(0);
    expect(screen.getByText('Exibindo 4 de 5 lançamentos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar histórico completo' }));
    expect(screen.getByText('Exibindo 5 de 5 lançamentos')).toBeInTheDocument();
  });

  it('sem faturas mostra o vazio real', async () => {
    api.getInvoices.mockResolvedValue({ anos: [], itens: [] });
    render(<PlanosPage />);
    expect(await screen.findByText('Nenhuma cobrança ainda. A primeira aparece aqui quando for gerada.')).toBeInTheDocument();
  });

  it('cancelar pede confirmação e chama o cancelamento', async () => {
    api.cancelSubscription.mockResolvedValue({});
    render(<PlanosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assinatura' }));
    const botoes = await screen.findAllByRole('button', { name: 'Cancelar assinatura' });
    fireEvent.click(botoes[botoes.length - 1]!);
    await waitFor(() => expect(api.cancelSubscription).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('cancelada'), 'success');
  });

  it('cancelada no fim do período oferece reativar', async () => {
    api.getStatus.mockResolvedValue(status({ cancelAtPeriodEnd: true }));
    api.reactivateSubscription.mockResolvedValue({ provider: 'asaas', reactivationMode: 'resumed' });
    render(<PlanosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar assinatura' }));
    await waitFor(() => expect(api.reactivateSubscription).toHaveBeenCalled());
  });

  it('downgrade agendado mostra a faixa e permite cancelar a mudança', async () => {
    api.getStatus.mockResolvedValue(status({ planoAgendado: 'basico', planoAgendadoEm: '2026-11-14T12:00:00.000Z' }));
    api.cancelPlanChange.mockResolvedValue({ cancelado: 'downgrade' });
    render(<PlanosPage />);
    expect(await screen.findByText(/Seu plano muda para Solo em 14\/11/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar mudança' }));
    await waitFor(() => expect(api.cancelPlanChange).toHaveBeenCalled());
  });

  it('upgrade Pix pendente abre o QR Code', async () => {
    api.getStatus.mockResolvedValue(
      status({
        provider: 'asaas',
        upgradePendente: { plano: 'premium', valor: 50, paymentId: 'pay_up', pixCopyPaste: 'copia-e-cola', qrCode: 'abc' },
      })
    );
    api.getPaymentMethod.mockResolvedValue({ tipo: 'pix', cobrancaAberta: null });
    render(<PlanosPage />);
    expect(await screen.findByText(/Upgrade para Salão aguardando/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver Pix' }));
    expect(await screen.findByText('copia-e-cola')).toBeInTheDocument();
    expect(screen.getByAltText('QR Code do Pix')).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('pagamento atrasado no Pix: faixa com "Gerar cobrança Pix"', async () => {
    api.getStatus.mockResolvedValue(status({ provider: 'asaas', paymentMethod: 'pix', subscriptionStatus: 'unpaid' }));
    api.getPaymentMethod.mockResolvedValue({ tipo: 'pix', cobrancaAberta: null });
    render(<PlanosPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pagamento em atraso');
    expect(screen.getByRole('button', { name: 'Gerar cobrança Pix' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar assinatura' })).not.toBeInTheDocument();
  });

  it('em teste grátis: sem forma de pagamento e com o checkout para escolher o plano', async () => {
    api.getStatus.mockResolvedValue(status({ provider: null, subscriptionStatus: 'trialing' }));
    api.getPaymentMethod.mockResolvedValue(null);
    api.getInvoices.mockResolvedValue({ anos: [], itens: [] });
    render(<PlanosPage />);
    expect(await screen.findByTestId('checkout')).toBeInTheDocument();
    expect(screen.getByText(/Período de teste/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma forma de pagamento cadastrada/)).toBeInTheDocument();
  });

  it('sem NEXT_PUBLIC_SUPPORT_WHATSAPP os botões de suporte somem', async () => {
    render(<PlanosPage />);
    await screen.findByText('Plano Equipe (Mensal)');
    expect(screen.queryByText('Dúvidas financeiras')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fale com nosso financeiro/)).not.toBeInTheDocument();
  });
});
