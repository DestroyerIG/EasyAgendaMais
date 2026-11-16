import { afterEach, describe, expect, it, vi } from 'vitest';
import { salvarConsentimento } from '../cookieConsent';

async function carregar(id: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', id);
  return import('../metaPixel');
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { fbq?: unknown }).fbq;
});

describe('metaPixel', () => {
  it('fica desligado sem ID e não dispara evento', async () => {
    const { pixelAtivo, trackMetaEvent } = await carregar('');
    const fbq = vi.fn();
    window.fbq = fbq;
    expect(pixelAtivo()).toBe(false);
    trackMetaEvent('PageView');
    expect(fbq).not.toHaveBeenCalled();
  });

  it('rejeita ID que não é numérico', async () => {
    const { pixelAtivo } = await carregar('abc123');
    expect(pixelAtivo()).toBe(false);
  });

  it('dispara o evento com ID válido', async () => {
    const { trackCadastroConcluido } = await carregar('123456789012345');
    salvarConsentimento(true);
    const fbq = vi.fn();
    window.fbq = fbq;
    trackCadastroConcluido('email');
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {
      status: true,
      content_name: 'cadastro_email',
    });
  });

  it('não dispara evento sem consentimento de marketing', async () => {
    const { trackMetaEvent } = await carregar('123456789012345');
    const fbq = vi.fn();
    window.fbq = fbq;
    trackMetaEvent('PageView');
    salvarConsentimento(false);
    trackMetaEvent('PageView');
    expect(fbq).not.toHaveBeenCalled();
    salvarConsentimento(true);
    trackMetaEvent('PageView');
    expect(fbq).toHaveBeenCalledWith('track', 'PageView');
  });

  it('para de disparar quando o consentimento é revogado', async () => {
    const { trackMetaEvent } = await carregar('123456789012345');
    const fbq = vi.fn();
    window.fbq = fbq;
    salvarConsentimento(true);
    salvarConsentimento(false);
    trackMetaEvent('PageView');
    expect(fbq).not.toHaveBeenCalled();
  });

  it('só permite o pixel nas páginas públicas', async () => {
    const { rotaPermitePixel } = await carregar('123456789012345');
    expect(rotaPermitePixel('/')).toBe(true);
    expect(rotaPermitePixel('/cadastro')).toBe(true);
    expect(rotaPermitePixel('/cadastro/')).toBe(true);
    expect(rotaPermitePixel('/cookies')).toBe(true);
    expect(rotaPermitePixel('/dashboard')).toBe(false);
    expect(rotaPermitePixel('/admin')).toBe(false);
    expect(rotaPermitePixel('/agendar/studio-aurora')).toBe(false);
    expect(rotaPermitePixel(null)).toBe(false);
  });
});
