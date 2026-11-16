import { afterEach, describe, expect, it, vi } from 'vitest';

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
    const fbq = vi.fn();
    window.fbq = fbq;
    trackCadastroConcluido('email');
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {
      status: true,
      content_name: 'cadastro_email',
    });
  });

  it('só permite o pixel nas páginas públicas', async () => {
    const { rotaPermitePixel } = await carregar('123456789012345');
    expect(rotaPermitePixel('/')).toBe(true);
    expect(rotaPermitePixel('/cadastro')).toBe(true);
    expect(rotaPermitePixel('/cadastro/')).toBe(true);
    expect(rotaPermitePixel('/dashboard')).toBe(false);
    expect(rotaPermitePixel('/admin')).toBe(false);
    expect(rotaPermitePixel('/agendar/studio-aurora')).toBe(false);
    expect(rotaPermitePixel(null)).toBe(false);
  });
});
