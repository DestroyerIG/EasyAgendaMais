import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import type { CatalogoPlanos, SubscriptionStatusResponse } from '@/lib/billing';

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getPlans: vi.fn(),
  previewPlanChange: vi.fn(),
  changePlan: vi.fn(),
  getPixPaymentStatus: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());
const refreshMe = vi.hoisted(() => vi.fn());
const busca = vi.hoisted(() => ({ atual: new URLSearchParams() }));
const usuario = vi.hoisted(() => ({ role: 'tenant_admin' }));

vi.mock('@/lib/billing', () => ({ billingApi: api }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { plan: 'profissional', businessName: 'Studio Aurora', role: usuario.role, email: 'a@b.c' }, refreshMe }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/components/shell/SettingsTabs', () => ({ SettingsTabs: () => null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push }),
  useSearchParams: () => busca.atual,
}));

const { default: CompararPlanosPage } = await import('../page');

const catalogo: CatalogoPlanos = {
  planos: [
    { id: 'basico', nome: 'Solo', preco: 49.9, sobConsulta: false, limiteProfissionais: 1, publico: 'Autônomas', descricao: 'Para autônomas.', destaques: ['Caixa'], emBreve: [] },
    { id: 'profissional', nome: 'Equipe', preco: 99.9, sobConsulta: false, limiteProfissionais: 5, publico: 'Estúdios', descricao: 'Para estúdios.', destaques: ['Comissões'], emBreve: ['Acesso das profissionais'] },
    { id: 'premium', nome: 'Salão', preco: 199.9, sobConsulta: false, limiteProfissionais: null, publico: 'Salões', descricao: 'Para salões.', destaques: ['Suporte prioritário'], emBreve: ['Clube e pacotes'] },
  ],
  matriz: [
    { id: 'caixa', grupo: 'Equipe e operação', titulo: 'Controle de caixa', basico: true, profissional: true, premium: true },
    { id: 'profissionais', grupo: 'Equipe e operação', titulo: 'Profissionais na grade', basico: '1', profissional: 'Até 5', premium: 'Ilimitadas' },
    { id: 'clube', grupo: 'Expansão e gestão avançada', titulo: 'Clube e pacotes de serviços', basico: false, profissional: false, premium: 'em_breve' },
  ],
};

const status = (extra: Partial<SubscriptionStatusResponse> = {}): SubscriptionStatusResponse => ({
  plan: 'profissional',
  provider: 'asaas',
  paymentMethod: 'card',
  subscriptionStatus: 'active',
  currentPeriodStart: null,
  currentPeriodEnd: '2026-11-15T12:00:00.000Z',
  cancelAtPeriodEnd: false,
  hasCustomer: true,
  planoAgendado: null,
  ...extra,
});

const cartao = (nome: string) => screen.getByRole('heading', { name: nome, level: 3 }).closest('article') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  busca.atual = new URLSearchParams();
  usuario.role = 'tenant_admin';
  api.getPlans.mockResolvedValue(catalogo);
  api.getStatus.mockResolvedValue(status());
});

describe('Comparação e upgrade', () => {
  it('destaca o plano atual, recomenda o próximo e marca o que é "Em breve"', async () => {
    render(<CompararPlanosPage />);
    expect(await screen.findByText('Planos flexíveis para a escala do Studio Aurora')).toBeInTheDocument();
    await waitFor(() => expect(within(cartao('Equipe')).getByRole('button', { name: 'Plano atual (Ativo)' })).toBeDisabled());
    expect(within(cartao('Salão')).getByText('Recomendado')).toBeInTheDocument();
    expect(within(cartao('Salão')).getByRole('button', { name: 'Fazer upgrade para Salão' })).toBeInTheDocument();
    expect(within(cartao('Solo')).getByRole('button', { name: 'Mudar para Solo' })).toBeInTheDocument();
    expect(screen.getAllByText('Em breve').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Ilimitadas')).toBeInTheDocument();
    expect(screen.queryByText(/Anual/)).not.toBeInTheDocument();
  });

  it('Salão sob consulta: sem preço e com "Falar com a gente" no lugar do upgrade', async () => {
    api.getPlans.mockResolvedValue({
      ...catalogo,
      planos: catalogo.planos.map((p) => (p.id === 'premium' ? { ...p, preco: null, sobConsulta: true } : p)),
    });
    render(<CompararPlanosPage />);
    await screen.findByText('Planos flexíveis para a escala do Studio Aurora');
    await waitFor(() => expect(within(cartao('Salão')).getByText('Sob consulta')).toBeInTheDocument());
    expect(within(cartao('Salão')).getByRole('link', { name: 'Falar com a gente' })).toHaveAttribute('href', expect.stringMatching(/wa\.me/));
    expect(within(cartao('Salão')).queryByRole('button', { name: /upgrade/ })).not.toBeInTheDocument();
  });

  it('Salão com valor combinado: mostra o valor e libera o upgrade', async () => {
    api.getPlans.mockResolvedValue({
      ...catalogo,
      planos: catalogo.planos.map((p) => (p.id === 'premium' ? { ...p, preco: null, sobConsulta: true } : p)),
    });
    api.getStatus.mockResolvedValue(status({ valorSalao: 450 }));
    render(<CompararPlanosPage />);
    await waitFor(() => expect(within(cartao('Salão')).getByText(/R\$\s*450,00/)).toBeInTheDocument());
    expect(within(cartao('Salão')).getByRole('button', { name: 'Fazer upgrade para Salão' })).toBeInTheDocument();
  });

  it('backend antigo com a equipe nos destaques não repete a linha da equipe', async () => {
    api.getPlans.mockResolvedValue({
      ...catalogo,
      planos: catalogo.planos.map((p) =>
        p.id === 'profissional' ? { ...p, destaques: ['Até 5 profissionais', 'Comissões'] } : p,
      ),
    });
    render(<CompararPlanosPage />);
    await screen.findByText('Planos flexíveis para a escala do Studio Aurora');
    await waitFor(() => expect(within(cartao('Equipe')).getAllByText('Até 5 profissionais')).toHaveLength(1));
  });

  it('a faixa "Recurso exclusivo" só aparece com ?recurso=', async () => {
    render(<CompararPlanosPage />);
    await screen.findByText('Planos flexíveis para a escala do Studio Aurora');
    expect(screen.queryByText('Recurso exclusivo')).not.toBeInTheDocument();
  });

  it('com ?recurso=profissionais explica o upgrade para o próximo plano', async () => {
    busca.atual = new URLSearchParams('recurso=profissionais');
    render(<CompararPlanosPage />);
    expect(await screen.findByText('Recurso exclusivo')).toBeInTheDocument();
    expect(screen.getByText('Mais profissionais no plano Salão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver plano Salão/ })).toBeInTheDocument();
  });

  it('upgrade aplicado na hora: prévia, confirmação e volta para Plano e cobrança', async () => {
    api.previewPlanChange.mockResolvedValue({
      tipo: 'upgrade', planoAtual: 'profissional', planoNovo: 'premium', valorHoje: 50, dias: 15,
      valorMensalNovo: 199.9, aPartirDe: '2026-11-15T12:00:00.000Z', formaPagamento: 'card', bloqueio: null,
    });
    api.changePlan.mockResolvedValue({ tipo: 'upgrade', status: 'pago', plano: 'premium' });
    render(<CompararPlanosPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Fazer upgrade para Salão' }))[0]!);
    expect(await screen.findByText('Diferença proporcional de 15 dias até a próxima fatura.')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*50,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar upgrade' }));
    await waitFor(() => expect(api.changePlan).toHaveBeenCalledWith('premium'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/planos'));
    expect(showToast).toHaveBeenCalledWith('Pronto! Seu plano agora é o Salão.', 'success');
    expect(refreshMe).toHaveBeenCalled();
  });

  it('upgrade no Pix mostra o QR Code e libera quando o pagamento confirma', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getStatus.mockResolvedValue(status({ provider: 'asaas' }));
    api.previewPlanChange.mockResolvedValue({
      tipo: 'upgrade', planoAtual: 'profissional', planoNovo: 'premium', valorHoje: 50, dias: 15,
      valorMensalNovo: 199.9, aPartirDe: null, formaPagamento: 'pix', bloqueio: null,
    });
    api.changePlan.mockResolvedValue({
      tipo: 'upgrade', status: 'aguardando', plano: 'premium', valor: 50, paymentId: 'pay_up', pixCopyPaste: 'copia', qrCode: 'abc',
    });
    api.getPixPaymentStatus.mockResolvedValue({ status: 'active' });

    render(<CompararPlanosPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Fazer upgrade para Salão' }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar upgrade' }));
    expect(await screen.findByText('copia')).toBeInTheDocument();
    expect(screen.getByText('Aguardando o pagamento. A tela atualiza sozinha.')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(api.getPixPaymentStatus).toHaveBeenCalledWith('pay_up'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/planos'));
    vi.useRealTimers();
  });

  it('upgrade no cartão leva à fatura do Asaas para pagar a diferença', async () => {
    api.getStatus.mockResolvedValue(status({ provider: 'asaas', paymentMethod: 'card' }));
    api.previewPlanChange.mockResolvedValue({
      tipo: 'upgrade', planoAtual: 'profissional', planoNovo: 'premium', valorHoje: 50, dias: 15,
      valorMensalNovo: 199.9, aPartirDe: null, formaPagamento: 'card', bloqueio: null,
    });
    api.changePlan.mockResolvedValue({
      tipo: 'upgrade', status: 'aguardando', plano: 'premium', valor: 50, paymentId: 'pay_up',
      pixCopyPaste: null, qrCode: null, invoiceUrl: 'https://asaas/i/pay_up',
    });

    render(<CompararPlanosPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Fazer upgrade para Salão' }))[0]!);
    expect(await screen.findByText(/a diferença é paga no cartão, na página segura do Asaas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar upgrade' }));
    expect(await screen.findByRole('link', { name: 'Pagar a diferença no cartão' })).toHaveAttribute('href', 'https://asaas/i/pay_up');
  });

  it('downgrade bloqueado por profissionais não deixa confirmar', async () => {
    api.previewPlanChange.mockResolvedValue({
      tipo: 'downgrade', planoAtual: 'profissional', planoNovo: 'basico', valorHoje: 0, dias: 0,
      valorMensalNovo: 49.9, aPartirDe: null, formaPagamento: 'card',
      bloqueio: { motivo: 'O plano Solo permite 1 profissional. Desative 2 profissionais antes de mudar.' },
    });
    render(<CompararPlanosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar para Solo' }));
    expect(await screen.findByText(/Desative 2 profissionais/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar mudança' })).toBeDisabled();
  });

  it('downgrade agenda e avisa a data', async () => {
    api.previewPlanChange.mockResolvedValue({
      tipo: 'downgrade', planoAtual: 'profissional', planoNovo: 'basico', valorHoje: 0, dias: 0,
      valorMensalNovo: 49.9, aPartirDe: '2026-11-15T12:00:00.000Z', formaPagamento: 'card', bloqueio: null,
    });
    api.changePlan.mockResolvedValue({ tipo: 'downgrade', agendadoPara: '2026-11-15T12:00:00.000Z', plano: 'basico' });
    render(<CompararPlanosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar para Solo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar mudança' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Seu plano muda para Solo em 15/11.', 'success'));
  });

  it('sem assinatura paga, os botões levam ao checkout', async () => {
    api.getStatus.mockResolvedValue(status({ subscriptionStatus: 'trialing', provider: null }));
    render(<CompararPlanosPage />);
    await waitFor(() => expect(within(cartao('Salão')).getByRole('link', { name: 'Assinar o Salão' })).toHaveAttribute('href', '/planos#assinar'));
    expect(screen.queryByRole('button', { name: /Fazer upgrade/ })).not.toBeInTheDocument();
  });

  it('a equipe vê os planos mas não troca', async () => {
    usuario.role = 'employee';
    render(<CompararPlanosPage />);
    await waitFor(() =>
      expect(within(cartao('Salão')).getByText('Só a administradora da conta pode trocar de plano.')).toBeInTheDocument()
    );
  });
});
