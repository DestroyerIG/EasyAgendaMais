import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getStatus: vi.fn(), createCheckoutSession: vi.fn() }));
vi.mock('@/lib/billing', () => ({ billingApi: api }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { ConviteCartao } = await import('../ConviteCartao');

const emTeste = (extra: Record<string, unknown> = {}) => ({
  plan: 'profissional', provider: null, paymentMethod: null, subscriptionStatus: 'trialing',
  currentPeriodStart: null, currentPeriodEnd: '2026-11-08T15:00:00.000Z', cancelAtPeriodEnd: false, hasCustomer: false,
  cobrancaComCartaoEm: '2026-11-15T15:00:00.000Z',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('convite do cartão', () => {
  it('aparece no teste sem cartão, com a data da primeira cobrança', async () => {
    api.getStatus.mockResolvedValue(emTeste());
    render(<ConviteCartao />);
    expect(await screen.findByRole('button', { name: 'Cadastrar cartão e ganhar mais 7 dias' })).toBeInTheDocument();
    expect(screen.getByText(/A primeira cobrança só acontece em 15\/11/)).toBeInTheDocument();
  });

  it('cadastrar cartão abre o checkout do Asaas no plano escolhido', async () => {
    api.getStatus.mockResolvedValue(emTeste());
    api.createCheckoutSession.mockResolvedValue({ provider: 'asaas', formaPagamento: 'card', checkoutUrl: 'https://asaas/c/1', cobrancaEm: '2026-11-15T15:00:00.000Z' });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<ConviteCartao />);
    fireEvent.click(await screen.findByRole('radio', { name: /Solo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cartão e ganhar mais 7 dias' }));
    await waitFor(() => expect(api.createCheckoutSession).toHaveBeenCalledWith('basico', 'card'));
    expect(assign).toHaveBeenCalledWith('https://asaas/c/1');
    vi.unstubAllGlobals();
  });

  it('some com o cartão já cadastrado', async () => {
    api.getStatus.mockResolvedValue(emTeste({ paymentMethod: 'card' }));
    const { container } = render(<ConviteCartao />);
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('some com o teste vencido', async () => {
    api.getStatus.mockResolvedValue(emTeste({ currentPeriodEnd: '2026-11-01T15:00:00.000Z' }));
    const { container } = render(<ConviteCartao />);
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('some fora do teste', async () => {
    api.getStatus.mockResolvedValue(emTeste({ subscriptionStatus: 'active' }));
    const { container } = render(<ConviteCartao />);
    await waitFor(() => expect(api.getStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
