import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/marketing/PublicNavbar', () => ({ PublicNavbar: () => null }));
vi.mock('@/components/marketing/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/components/theme/ForcedLight', () => ({ ForcedLight: ({ children }: { children?: React.ReactNode }) => children ?? null }));

const { default: PrivacidadePage } = await import('../page');

describe('Política de Privacidade', () => {
  it('privacidade explica os dados do Google', () => {
    const { container } = render(<PrivacidadePage />);
    const texto = container.textContent ?? '';
    expect(texto).toContain('Dados do Google');
    expect(texto).toContain('Google Agenda');
    expect(texto).toContain('ocupado ou livre');
    expect(texto).toContain('EasyAgenda+');
    expect(texto).toMatch(/desconectar/i);
    expect(texto).toContain('Limited Use');
  });

  it('a seção de cookies cita o pixel da Meta e liga à política de cookies', () => {
    const { container } = render(<PrivacidadePage />);
    expect(container.textContent).toContain('pixel da Meta');
    expect(screen.getByRole('link', { name: 'Política de Cookies' })).toHaveAttribute('href', '/cookies');
  });

  it('fica no tema claro', () => {
    const { container } = render(<PrivacidadePage />);
    expect(container.querySelector('.dark')).toBeNull();
  });

  it('declara o consentimento como base legal e a Meta entre os terceiros', () => {
    const { container } = render(<PrivacidadePage />);
    const texto = container.textContent ?? '';
    expect(texto).toMatch(/consentimento/i);
    expect(texto).toContain('Meta');
    expect(container.querySelector('.section-eyebrow')).toBeNull();
  });
});
