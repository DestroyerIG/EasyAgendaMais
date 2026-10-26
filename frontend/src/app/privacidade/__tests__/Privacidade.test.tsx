import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/marketing/PublicNavbar', () => ({ PublicNavbar: () => null }));
vi.mock('@/components/marketing/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/components/theme/ForcedDark', () => ({ ForcedDark: ({ children }: { children?: React.ReactNode }) => children ?? null }));

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
});
