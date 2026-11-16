import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/script', () => ({
  default: ({ id, children }: { id: string; children?: React.ReactNode }) => (
    <script data-testid={id}>{children}</script>
  ),
}));

async function carregar() {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '123456789012345');
  const { MetaPixel } = await import('../MetaPixel');
  const consent = await import('@/lib/cookieConsent');
  return { MetaPixel, consent };
}

beforeEach(() => {
  pathname = '/';
});
afterEach(() => vi.unstubAllEnvs());

describe('MetaPixel', () => {
  it('não carrega o script sem consentimento', async () => {
    const { MetaPixel } = await carregar();
    const { queryByTestId } = render(<MetaPixel />);
    expect(queryByTestId('meta-pixel')).toBeNull();
  });

  it('carrega após aceitar Marketing e some ao revogar', async () => {
    const { MetaPixel, consent } = await carregar();
    const { queryByTestId } = render(<MetaPixel />);
    act(() => {
      consent.salvarConsentimento(true);
    });
    expect(queryByTestId('meta-pixel')).not.toBeNull();
    act(() => {
      consent.salvarConsentimento(false);
    });
    expect(queryByTestId('meta-pixel')).toBeNull();
  });

  it('não carrega fora das rotas públicas, mesmo com consentimento', async () => {
    pathname = '/dashboard';
    const { MetaPixel, consent } = await carregar();
    const { queryByTestId } = render(<MetaPixel />);
    act(() => {
      consent.salvarConsentimento(true);
    });
    expect(queryByTestId('meta-pixel')).toBeNull();
  });

  it('desliga o rastreio automático de navegação (pushState) do pixel', async () => {
    const { MetaPixel, consent } = await carregar();
    const { getByTestId } = render(<MetaPixel />);
    act(() => {
      consent.salvarConsentimento(true);
    });
    expect(getByTestId('meta-pixel').textContent).toContain('disablePushState');
  });

  it('avisa o pixel já carregado quando o consentimento é revogado e quando volta', async () => {
    const { MetaPixel, consent } = await carregar();
    const fbq = vi.fn();
    window.fbq = fbq;
    render(<MetaPixel />);
    act(() => {
      consent.salvarConsentimento(true);
    });
    act(() => {
      consent.salvarConsentimento(false);
    });
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke');
    act(() => {
      consent.salvarConsentimento(true);
    });
    expect(fbq).toHaveBeenCalledWith('consent', 'grant');
    delete (window as { fbq?: unknown }).fbq;
  });

  it('revoga o pixel e apaga o _fbp ao sair das rotas públicas', async () => {
    const { MetaPixel, consent } = await carregar();
    const fbq = vi.fn();
    window.fbq = fbq;
    document.cookie = '_fbp=fb.1.123.456; path=/';
    consent.salvarConsentimento(true);
    pathname = '/dashboard';
    render(<MetaPixel />);
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke');
    expect(document.cookie).not.toContain('_fbp');
    delete (window as { fbq?: unknown }).fbq;
  });
});
