import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABRIR_PREFERENCIAS_EVENT, lerConsentimento, salvarConsentimento } from '@/lib/cookieConsent';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { CookieBanner } = await import('../CookieBanner');

const dialogo = () => screen.queryByRole('dialog', { name: 'Cookies no EasyAgenda+' });

beforeEach(() => {
  pathname = '/';
});
afterEach(() => vi.restoreAllMocks());

describe('CookieBanner', () => {
  it('aparece na primeira visita com os três botões', () => {
    render(<CookieBanner />);
    expect(dialogo()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Recusar não essenciais' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personalizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Política de Cookies' })).toHaveAttribute('href', '/cookies');
  });

  it('"Aceitar todos" grava marketing=true e fecha', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar todos' }));
    expect(lerConsentimento()?.marketing).toBe(true);
    expect(dialogo()).toBeNull();
  });

  it('"Recusar não essenciais" grava marketing=false e fecha', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Recusar não essenciais' }));
    expect(lerConsentimento()?.marketing).toBe(false);
    expect(dialogo()).toBeNull();
  });

  it('"Personalizar" mostra Necessários travado e Marketing desligado, e salva a escolha', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }));
    const necessarios = screen.getByRole('switch', { name: 'Necessários' });
    const marketing = screen.getByRole('switch', { name: 'Marketing' });
    expect(screen.getByText(/nossos eventos não incluem nome, e-mail ou telefone/i)).toBeInTheDocument();
    expect(screen.queryByText(/não enviamos/i)).toBeNull();
    expect(necessarios).toBeDisabled();
    expect(necessarios).toBeChecked();
    expect(marketing).not.toBeChecked();
    fireEvent.click(marketing);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(lerConsentimento()?.marketing).toBe(true);
  });

  it('"Voltar" retorna aos três botões', () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeInTheDocument();
  });

  it('não aparece com consentimento válido e reabre pelo evento, já nas preferências', () => {
    salvarConsentimento(true);
    render(<CookieBanner />);
    expect(dialogo()).toBeNull();
    act(() => {
      window.dispatchEvent(new Event(ABRIR_PREFERENCIAS_EVENT));
    });
    expect(dialogo()).not.toBeNull();
    expect(screen.getByRole('switch', { name: 'Marketing' })).toBeChecked();
  });

  it('não aparece fora das rotas públicas', () => {
    pathname = '/dashboard';
    render(<CookieBanner />);
    expect(dialogo()).toBeNull();
  });

  it('funciona com localStorage bloqueado', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(<CookieBanner />);
    expect(dialogo()).not.toBeNull();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Aceitar todos' }))).not.toThrow();
  });
});
