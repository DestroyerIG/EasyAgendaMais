import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CatalogoPlanos, SubscriptionStatusResponse } from '@/lib/billing';
import type { EstadoConta } from '@/lib/conta';

const billing = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getPlans: vi.fn(),
  reactivateSubscription: vi.fn(),
  getPixPaymentStatus: vi.fn(),
}));
const conta = vi.hoisted(() => ({ estado: vi.fn(), baixarBackup: vi.fn() }));
const openBillingPortal = vi.hoisted(() => vi.fn());
const usuario = vi.hoisted(() => ({ atual: { role: 'tenant_admin', businessName: 'Studio Aurora', plan: 'profissional' } }));

vi.mock('@/lib/billing', () => ({ billingApi: billing }));
vi.mock('@/lib/conta', () => ({ contaApi: conta }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));
vi.mock('@/hooks/useDashboardBilling', () => ({
  useDashboardBilling: () => ({ openBillingPortal, portalLoading: false }),
}));

const { TelaContingencia } = await import('../TelaContingencia');

const catalogo: CatalogoPlanos = {
  planos: [
    { id: 'basico', nome: 'Solo', preco: 49.9, limiteProfissionais: 1, publico: '', descricao: '', destaques: [], emBreve: [] },
    { id: 'profissional', nome: 'Equipe', preco: 99.9, limiteProfissionais: 5, publico: '', descricao: '', destaques: [], emBreve: [] },
    { id: 'premium', nome: 'Salão', preco: 199.9, limiteProfissionais: null, publico: '', descricao: '', destaques: [], emBreve: [] },
  ],
  matriz: [],
};

const status = (extra: Partial<SubscriptionStatusResponse> = {}): SubscriptionStatusResponse => ({
  plan: 'profissional',
  provider: 'asaas',
  subscriptionStatus: 'pending',
  paymentMethod: 'pix',
  currentPeriodStart: null,
  currentPeriodEnd: '2026-10-15T12:00:00.000Z',
  nextDueDate: '2026-10-15T12:00:00.000Z',
  cancelAtPeriodEnd: false,
  hasCustomer: true,
  ...extra,
});

const carencia: EstadoConta = {
  tipo: 'carencia',
  desde: '2026-10-15T12:00:00.000Z',
  ate: '2026-10-22T12:00:00.000Z',
  diasRestantes: 4,
};

const LOCATION_ORIGINAL = window.location;
const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  usuario.atual = { role: 'tenant_admin', businessName: 'Studio Aurora', plan: 'profissional' };
  billing.getStatus.mockResolvedValue(status());
  billing.getPlans.mockResolvedValue(catalogo);
  conta.estado.mockResolvedValue(carencia);
  conta.baixarBackup.mockResolvedValue(undefined);
  Object.defineProperty(window, 'location', { configurable: true, value: { ...LOCATION_ORIGINAL, assign } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, 'location', { configurable: true, value: LOCATION_ORIGINAL });
});

const TEXTOS_VETADOS = ['24 horas', '1 minuto', 'nunca são deletados'];
const semTextosVetados = (container: HTMLElement) => {
  for (const texto of TEXTOS_VETADOS) expect(container.textContent).not.toContain(texto);
};

describe('TelaContingencia', () => {
  describe('carência com Pix', () => {
    it('mostra prazo, mensalidade vencida, o que continua liberado e o aviso de pausa', async () => {
      const { container } = render(<TelaContingencia />);
      expect(await screen.findByText('Carência: 4 dias restantes')).toBeInTheDocument();
      expect(
        await screen.findByText(
          'A mensalidade de Studio Aurora (Plano Equipe · R$ 99,90) venceu em 15 de outubro de 2026.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('O que continua liberado')).toBeInTheDocument();
      expect(screen.getByText('Agenda e atendimentos de hoje')).toBeInTheDocument();
      expect(screen.getByText('Backup dos seus dados')).toBeInTheDocument();
      expect(screen.getByText('Lembretes já marcados')).toBeInTheDocument();
      expect(
        screen.getByText('Novos agendamentos pelo link público e campanhas estão pausados até a regularização.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Pagar com outro cartão')).not.toBeInTheDocument();
      semTextosVetados(container);
    });

    it('Gerar Pix chama reactivateSubscription e mostra o copia e cola com a validade do Asaas', async () => {
      billing.reactivateSubscription.mockResolvedValue({
        provider: 'asaas',
        reactivationMode: 'new_pix_checkout',
        paymentId: 'pay_1',
        subscriptionId: 'sub_1',
        status: 'pending',
        qrCode: null,
        pixCopyPaste: '000201pix',
        expiresAt: '2026-10-29T15:00:00.000Z',
      });
      const { container } = render(<TelaContingencia />);
      fireEvent.click(await screen.findByRole('button', { name: /Gerar Pix/ }));
      await waitFor(() => expect(billing.reactivateSubscription).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('000201pix')).toBeInTheDocument();
      expect(screen.getByText(/Código válido até/)).toBeInTheDocument();
      semTextosVetados(container);
    });

    it('sem validade na resposta, a linha da validade não aparece', async () => {
      billing.reactivateSubscription.mockResolvedValue({
        provider: 'asaas',
        reactivationMode: 'new_pix_checkout',
        paymentId: 'pay_1',
        subscriptionId: 'sub_1',
        status: 'pending',
        qrCode: null,
        pixCopyPaste: '000201pix',
        expiresAt: null,
      });
      render(<TelaContingencia />);
      fireEvent.click(await screen.findByRole('button', { name: /Gerar Pix/ }));
      expect(await screen.findByText('000201pix')).toBeInTheDocument();
      expect(screen.queryByText(/Código válido até/)).not.toBeInTheDocument();
    });
  });

  it('com troca agendada, plano e valor são os do plano agendado (o que a reativação cobra)', async () => {
    billing.getStatus.mockResolvedValue(status({ planoAgendado: 'premium' }));
    billing.reactivateSubscription.mockResolvedValue({
      provider: 'asaas',
      reactivationMode: 'new_pix_checkout',
      paymentId: 'pay_1',
      subscriptionId: 'sub_1',
      status: 'pending',
      qrCode: null,
      pixCopyPaste: '000201pix',
      expiresAt: null,
    });
    render(<TelaContingencia />);
    expect(
      await screen.findByText('A mensalidade de Studio Aurora (Plano Salão · R$ 199,90) venceu em 15 de outubro de 2026.'),
    ).toBeInTheDocument();
    expect(screen.getByText('R$ 199,90', { selector: 'span' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gerar Pix/ }));
    expect(await screen.findByText('000201pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 199,90')).toBeInTheDocument();
  });

  it('enquanto a cobrança carrega, não mostra ações de pagamento', async () => {
    billing.getStatus.mockReturnValue(new Promise(() => {}));
    render(<TelaContingencia />);
    await screen.findByText('Carência: 4 dias restantes');
    expect(screen.queryByRole('button', { name: /Pagar com outro cartão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar Pix/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Já paguei/ })).not.toBeInTheDocument();
  });

  it('se a cobrança não carregou, oferece só Já paguei e o suporte', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_WHATSAPP', '5511999990000');
    billing.getStatus.mockRejectedValue(new Error('falhou'));
    render(<TelaContingencia />);
    expect(await screen.findByRole('button', { name: /Já paguei/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Falar com o suporte no WhatsApp/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar com outro cartão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar Pix/ })).not.toBeInTheDocument();
  });

  it('sem o catálogo, o Pix não mostra valor inventado', async () => {
    billing.getPlans.mockRejectedValue(new Error('falhou'));
    billing.reactivateSubscription.mockResolvedValue({
      provider: 'asaas',
      reactivationMode: 'new_pix_checkout',
      paymentId: 'pay_1',
      subscriptionId: 'sub_1',
      status: 'pending',
      qrCode: null,
      pixCopyPaste: '000201pix',
      expiresAt: null,
    });
    const { container } = render(<TelaContingencia />);
    fireEvent.click(await screen.findByRole('button', { name: /Gerar Pix/ }));
    expect(await screen.findByText('000201pix')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/R\$\s0,00/);
    expect(screen.queryByText('Valor do Pix')).not.toBeInTheDocument();
  });

  it('carência com cartão: Pagar com outro cartão abre a fatura do Asaas e não há Pix', async () => {
    billing.getStatus.mockResolvedValue(status({ provider: 'asaas', paymentMethod: 'card', subscriptionStatus: 'past_due' }));
    render(<TelaContingencia />);
    fireEvent.click(await screen.findByRole('button', { name: /Pagar com outro cartão/ }));
    expect(openBillingPortal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Gerar Pix/ })).not.toBeInTheDocument();
  });

  it('bloqueada por cobrança: sem a lista do que continua liberado', async () => {
    conta.estado.mockResolvedValue({ tipo: 'bloqueada', motivo: 'cobranca' });
    const { container } = render(<TelaContingencia />);
    expect(await screen.findByText('Seu acesso está pausado até a regularização.')).toBeInTheDocument();
    expect(screen.queryByText('O que continua liberado')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Gerar Pix/ })).toBeInTheDocument();
    semTextosVetados(container);
  });

  it.each([
    ['teste', 'Seu período de teste terminou'],
    ['cancelada', 'Sua assinatura foi cancelada'],
  ] as const)('bloqueada (%s): mostra o texto do caso e Ver planos', async (motivo, titulo) => {
    conta.estado.mockResolvedValue({ tipo: 'bloqueada', motivo });
    const { container } = render(<TelaContingencia />);
    expect(await screen.findByText(titulo)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver planos/ })).toHaveAttribute('href', '/dashboard/planos/comparar');
    expect(screen.queryByRole('button', { name: /Gerar Pix/ })).not.toBeInTheDocument();
    expect(screen.queryByText('O que continua liberado')).not.toBeInTheDocument();
    semTextosVetados(container);
  });

  describe('backup', () => {
    it.each<EstadoConta>([
      carencia,
      { tipo: 'bloqueada', motivo: 'cobranca' },
      { tipo: 'bloqueada', motivo: 'teste' },
      { tipo: 'bloqueada', motivo: 'cancelada' },
    ])('aparece e chama baixarBackup (%o)', async (estado) => {
      conta.estado.mockResolvedValue(estado);
      render(<TelaContingencia />);
      fireEvent.click(await screen.findByRole('button', { name: 'Baixar backup completo (CSV, abre no Excel)' }));
      await waitFor(() => expect(conta.baixarBackup).toHaveBeenCalledTimes(1));
    });

    it('não aparece para a equipe', async () => {
      usuario.atual = { role: 'employee', businessName: 'Studio Aurora', plan: 'profissional' };
      render(<TelaContingencia />);
      await screen.findByText('Carência: 4 dias restantes');
      expect(screen.queryByRole('button', { name: /Baixar backup/ })).not.toBeInTheDocument();
    });
  });

  describe('suporte', () => {
    it('aparece com NEXT_PUBLIC_SUPPORT_WHATSAPP definido', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPPORT_WHATSAPP', '+55 11 99999-0000');
      render(<TelaContingencia />);
      const link = await screen.findByRole('link', { name: /Falar com o suporte no WhatsApp/ });
      expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/);
    });

    it('some sem a variável', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPPORT_WHATSAPP', '');
      render(<TelaContingencia />);
      await screen.findByText('Carência: 4 dias restantes');
      expect(screen.queryByText(/Falar com o suporte no WhatsApp/)).not.toBeInTheDocument();
    });
  });

  describe('Já paguei', () => {
    it('confere a cobrança, recarrega o estado e vai para o painel quando voltou a ativa', async () => {
      render(<TelaContingencia />);
      const botao = await screen.findByRole('button', { name: /Já paguei/ });
      billing.getStatus.mockClear();
      conta.estado.mockResolvedValue({ tipo: 'ativa' });
      fireEvent.click(botao);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'));
      expect(billing.getStatus).toHaveBeenCalled();
      expect(conta.estado).toHaveBeenCalledTimes(2);
    });

    it('continua na tela e avisa quando o pagamento ainda não foi confirmado', async () => {
      render(<TelaContingencia />);
      fireEvent.click(await screen.findByRole('button', { name: /Já paguei/ }));
      expect(await screen.findByText(/O pagamento ainda não foi confirmado/)).toBeInTheDocument();
      expect(assign).not.toHaveBeenCalled();
    });
  });
});
