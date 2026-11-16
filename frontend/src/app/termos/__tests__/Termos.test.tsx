import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/marketing/PublicNavbar', () => ({ PublicNavbar: () => null }));
vi.mock('@/components/marketing/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('@/components/theme/ForcedLight', () => ({ ForcedLight: ({ children }: { children?: React.ReactNode }) => children ?? null }));

const { default: TermosPage } = await import('../page');

describe('Termos de Uso', () => {
  it('fica no tema claro', () => {
    const { container } = render(<TermosPage />);
    expect(container.textContent).toContain('Termos de Uso');
    expect(container.querySelector('.dark')).toBeNull();
  });
});
