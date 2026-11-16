import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/script', () => ({
  default: ({ id }: { id: string }) => <script data-testid={id} />,
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
});
