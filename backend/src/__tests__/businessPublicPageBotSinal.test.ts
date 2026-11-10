import { describe, it, expect, vi, beforeEach } from 'vitest';
import { businessPublicPageService } from '../modules/businessPublicPage/businessPublicPage.service.js';
import { businessPublicPageRepository } from '../modules/businessPublicPage/businessPublicPage.repository.js';
import { ValidationError } from '../utils/errors.js';
import type { PublicPageSettings } from '../modules/businessPublicPage/businessPublicPage.types.js';

vi.mock('../modules/businessPublicPage/businessPublicPage.repository.js', () => ({
  businessPublicPageRepository: {
    findByBusinessId: vi.fn(),
    slugExists: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../services/supabaseAuthService.js', () => ({
  getSupabaseAdminClient: () => ({}),
}));

const settings = (over: Partial<PublicPageSettings> = {}): PublicPageSettings => ({
  slug: 'studio',
  pixKey: null,
  pixKeyType: null,
  logoUrl: null,
  brandColor: null,
  galleryPhotos: [],
  address: null,
  coverUrl: null,
  description: null,
  comodidades: [],
  mostrarNota: true,
  botCobraSinal: false,
  ...over,
});

const MSG = 'Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô';

describe('botCobraSinal na página pública', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lê botCobraSinal false por padrão', async () => {
    vi.mocked(businessPublicPageRepository.findByBusinessId).mockResolvedValue(settings());
    const result = await businessPublicPageService.get('b1');
    expect(result.botCobraSinal).toBe(false);
  });

  it('liga quando há chave Pix salva e devolve botCobraSinal true', async () => {
    vi.mocked(businessPublicPageRepository.findByBusinessId).mockResolvedValue(
      settings({ pixKey: '123.456.789-09', pixKeyType: 'cpf' }),
    );
    vi.mocked(businessPublicPageRepository.update).mockResolvedValue(
      settings({ pixKey: '123.456.789-09', pixKeyType: 'cpf', botCobraSinal: true }),
    );
    const result = await businessPublicPageService.update('b1', { botCobraSinal: true });
    expect(businessPublicPageRepository.update).toHaveBeenCalledWith('b1', { botCobraSinal: true });
    expect(result.botCobraSinal).toBe(true);
  });

  it('liga quando a chave Pix vem no mesmo corpo', async () => {
    vi.mocked(businessPublicPageRepository.findByBusinessId).mockResolvedValue(settings());
    vi.mocked(businessPublicPageRepository.update).mockResolvedValue(settings({ botCobraSinal: true }));
    await businessPublicPageService.update('b1', { pixKey: '123.456.789-09', pixKeyType: 'cpf', botCobraSinal: true });
    expect(businessPublicPageRepository.update).toHaveBeenCalled();
  });

  it('recusa ligar sem chave Pix', async () => {
    vi.mocked(businessPublicPageRepository.findByBusinessId).mockResolvedValue(settings());
    const promise = businessPublicPageService.update('b1', { botCobraSinal: true });
    await expect(promise).rejects.toBeInstanceOf(ValidationError);
    await expect(promise).rejects.toThrow(MSG);
    expect(businessPublicPageRepository.update).not.toHaveBeenCalled();
  });

  it('desligar sempre é permitido', async () => {
    vi.mocked(businessPublicPageRepository.update).mockResolvedValue(settings({ botCobraSinal: false }));
    const result = await businessPublicPageService.update('b1', { botCobraSinal: false });
    expect(businessPublicPageRepository.findByBusinessId).not.toHaveBeenCalled();
    expect(result.botCobraSinal).toBe(false);
  });
});
