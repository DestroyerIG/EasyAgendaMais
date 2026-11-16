import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ABRIR_PREFERENCIAS_EVENT, salvarConsentimento } from '@/lib/cookieConsent';

vi.mock('@/components/marketing/PublicNavbar', () => ({ PublicNavbar: () => null }));
vi.mock('@/components/marketing/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { default: CookiesPage } = await import('../page');
const { default: sitemap } = await import('../../sitemap');

describe('Política de Cookies', () => {
  it('explica as categorias e lista os cookies', () => {
    const { container } = render(<CookiesPage />);
    const texto = container.textContent ?? '';
    expect(texto).toContain('Política de Cookies');
    expect(texto).toContain('Necessários');
    expect(texto).toContain('Marketing');
    expect(texto).toContain('pixel da Meta');
    for (const nome of ['access_token', 'refresh_token', 'cookie_consent', 'easyagenda-theme', '_fbp', '_fbc', 'fr']) {
      expect(texto).toContain(nome);
    }
    expect(texto).toContain('contato@easyconnectcg.com.br');
  });

  it('não promete mais do que o código garante sobre dados enviados', () => {
    const { container } = render(<CookiesPage />);
    const texto = container.textContent ?? '';
    expect(texto).not.toContain('não enviamos nome');
    expect(texto).toContain('nossos eventos não incluem');
    expect(texto).toContain('fbclid');
  });

  it('usa rótulo de seção com cor de token legível no claro', () => {
    const { container } = render(<CookiesPage />);
    expect(container.querySelector('.section-eyebrow')).toBeNull();
  });

  it('o botão "Gerenciar cookies" reabre as preferências', () => {
    render(<CookiesPage />);
    const ouvinte = vi.fn();
    window.addEventListener(ABRIR_PREFERENCIAS_EVENT, ouvinte);
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar cookies' }));
    window.removeEventListener(ABRIR_PREFERENCIAS_EVENT, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('mostra a escolha atual', () => {
    const { container } = render(<CookiesPage />);
    expect(container.textContent).toContain('Marketing desativado');
    act(() => {
      salvarConsentimento(true);
    });
    expect(container.textContent).toContain('Marketing ativado');
  });

  it('entra no sitemap', () => {
    expect(sitemap().some((p) => p.url.endsWith('/cookies'))).toBe(true);
  });
});
