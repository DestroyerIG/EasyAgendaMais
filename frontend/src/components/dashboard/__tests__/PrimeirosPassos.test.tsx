import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onboardingApi } from '@/lib/onboarding';
import { PrimeirosPassos } from '../PrimeirosPassos';

vi.mock('@/lib/onboarding', async (orig) => {
  const real = await orig<typeof import('@/lib/onboarding')>();
  return { ...real, onboardingApi: { ...real.onboardingApi, primeirosPassos: vi.fn(), dispensarPrimeirosPassos: vi.fn() } };
});

describe('PrimeirosPassos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista o que falta, com o link de cada passo', async () => {
    vi.mocked(onboardingApi.primeirosPassos).mockResolvedValue([
      { id: 'pagina', titulo: 'Publique sua página', href: '/minha-pagina' },
      { id: 'whatsapp', titulo: 'Conecte o WhatsApp', href: '/whatsapp' },
    ]);
    render(<PrimeirosPassos ativo />);
    expect(await screen.findByText('Termine de configurar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Publique sua página/ })).toHaveAttribute('href', '/minha-pagina');
    expect(screen.getByRole('link', { name: /Conecte o WhatsApp/ })).toHaveAttribute('href', '/whatsapp');
  });

  it('dispensar esconde o card e avisa o backend', async () => {
    const user = userEvent.setup();
    vi.mocked(onboardingApi.primeirosPassos).mockResolvedValue([{ id: 'pix', titulo: 'Cadastre a chave Pix', href: '/configuracoes' }]);
    vi.mocked(onboardingApi.dispensarPrimeirosPassos).mockResolvedValue();
    render(<PrimeirosPassos ativo />);
    await user.click(await screen.findByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByText('Termine de configurar')).not.toBeInTheDocument();
    expect(onboardingApi.dispensarPrimeirosPassos).toHaveBeenCalled();
  });

  it('sem passos pendentes não aparece', async () => {
    vi.mocked(onboardingApi.primeirosPassos).mockResolvedValue([]);
    render(<PrimeirosPassos ativo />);
    await waitFor(() => expect(onboardingApi.primeirosPassos).toHaveBeenCalled());
    expect(screen.queryByText('Termine de configurar')).not.toBeInTheDocument();
  });

  it('para quem não é a dona não busca nada', () => {
    render(<PrimeirosPassos ativo={false} />);
    expect(onboardingApi.primeirosPassos).not.toHaveBeenCalled();
  });
});
