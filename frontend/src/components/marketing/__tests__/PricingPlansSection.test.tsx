import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { planoDoCatalogo } from '@/lib/planCatalog';

const usuario = vi.hoisted(() => ({ atual: null as null | Record<string, unknown> }));

vi.mock('@/lib/billing', () => ({ billingApi: {} }));
vi.mock('@/lib/businessProfile', () => ({ businessProfileApi: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { PricingPlansSection, recursosDoCartao } = await import('../PricingPlansSection');

describe('cards de preço', () => {
  it('Solo lista os destaques do catálogo', () => {
    expect(recursosDoCartao('basico')).toEqual(planoDoCatalogo('basico').destaques);
  });

  it('Equipe e Salão começam pelo plano anterior', () => {
    expect(recursosDoCartao('profissional')[0]).toBe('Tudo do Solo +');
    const salao = recursosDoCartao('premium');
    expect(salao[0]).toBe('Tudo do Equipe +');
    expect(salao[salao.length - 1]).toBe('Várias unidades (em breve)');
    for (const id of ['basico', 'profissional', 'premium'] as const) {
      expect(recursosDoCartao(id)).not.toContain('Suporte prioritário');
    }
  });

  it('card mostra a equipe pelo limite', () => {
    usuario.atual = null;
    render(<PricingPlansSection />);
    expect(screen.getByText('1 profissional')).toBeInTheDocument();
    expect(screen.getByText('Até 5 profissionais')).toBeInTheDocument();
    expect(screen.getByText('Profissionais ilimitadas')).toBeInTheDocument();
    expect(screen.getByText('Várias unidades (em breve)')).toBeInTheDocument();
  });

  it('plano atual continua marcado', () => {
    usuario.atual = { plan: 'profissional', role: 'tenant_admin', email: 'a@b.c' };
    render(<PricingPlansSection currentPlan="profissional" subscriptionStatus="active" />);
    const card = screen.getByRole('heading', { name: 'Equipe' }).closest('article')!;
    const botoes = within(card).getAllByRole('button', { name: 'Plano atual' });
    expect(botoes.length).toBeGreaterThan(0);
    for (const botao of botoes) expect(botao).toBeDisabled();
  });

  it('Salão sem valor combinado: "Sob consulta" e "Falar com a gente", sem checkout', () => {
    usuario.atual = null;
    render(<PricingPlansSection />);
    const card = screen.getByRole('heading', { name: 'Salão' }).closest('article')!;
    expect(within(card).getByText('Sob consulta')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Falar com a gente' })).toHaveAttribute('href', expect.stringMatching(/wa\.me/));
    expect(within(card).queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it('Salão com valor combinado: mostra o valor e o checkout', () => {
    usuario.atual = { plan: 'profissional', role: 'tenant_admin', email: 'a@b.c' };
    render(<PricingPlansSection valorSalao={450} />);
    const card = screen.getByRole('heading', { name: 'Salão' }).closest('article')!;
    expect(within(card).getByText(/R\$\s*450,00/)).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Cart/ })).toBeInTheDocument();
  });
});
