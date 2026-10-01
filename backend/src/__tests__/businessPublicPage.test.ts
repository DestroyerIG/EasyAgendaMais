import { describe, it, expect, vi, beforeEach } from 'vitest';
import { slugify, isValidSlug, businessPublicPageService } from '../modules/businessPublicPage/businessPublicPage.service.js';
import { businessPublicPageRepository } from '../modules/businessPublicPage/businessPublicPage.repository.js';
import { UpdatePublicPageSchema } from '../modules/businessPublicPage/businessPublicPage.types.js';

vi.mock('../modules/businessPublicPage/businessPublicPage.repository.js', () => ({
  businessPublicPageRepository: {
    findByBusinessId: vi.fn(),
    slugExists: vi.fn(),
    update: vi.fn(),
  },
}));

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();

vi.mock('../services/supabaseAuthService.js', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }),
    },
  }),
}));

describe('slugify', () => {
  it('normaliza nome do negócio para um slug válido', () => {
    expect(slugify('Studio Aurora & Unhas')).toBe('studio-aurora-unhas');
  });

  it('remove acentos', () => {
    expect(slugify('Espaço Lumé Estética')).toBe('espaco-lume-estetica');
  });
});

describe('isValidSlug', () => {
  it('aceita apenas letras minúsculas, números e hífen', () => {
    expect(isValidSlug('studio-aurora')).toBe(true);
    expect(isValidSlug('Studio Aurora')).toBe(false);
    expect(isValidSlug('studio_aurora')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});

describe('UpdatePublicPageSchema — validação de formato da chave Pix por tipo', () => {
  const parse = (body: Record<string, unknown>) => UpdatePublicPageSchema.safeParse(body);

  it('aceita chaves válidas de cada tipo', () => {
    expect(parse({ pixKeyType: 'cpf', pixKey: '123.456.789-09' }).success).toBe(true);
    expect(parse({ pixKeyType: 'cnpj', pixKey: '34.865.261/0001-63' }).success).toBe(true);
    expect(parse({ pixKeyType: 'telefone', pixKey: '(83) 99999-0000' }).success).toBe(true);
    expect(parse({ pixKeyType: 'telefone', pixKey: '+55 (83) 99999-0000' }).success).toBe(true);
    expect(parse({ pixKeyType: 'telefone', pixKey: '8333334444' }).success).toBe(true);
    expect(parse({ pixKeyType: 'aleatoria', pixKey: '123e4567-e12b-12d1-a456-426655440000' }).success).toBe(true);
    expect(parse({ pixKeyType: 'email', pixKey: 'studio@aurora.com' }).success).toBe(true);
  });

  it('rejeita CPF e CNPJ com quantidade errada de dígitos', () => {
    expect(parse({ pixKeyType: 'cpf', pixKey: '1234567890' }).success).toBe(false);
    expect(parse({ pixKeyType: 'cpf', pixKey: '123456789012' }).success).toBe(false);
    expect(parse({ pixKeyType: 'cnpj', pixKey: '3486526100016' }).success).toBe(false);
    expect(parse({ pixKeyType: 'cnpj', pixKey: '348652610001634' }).success).toBe(false);
  });

  it('rejeita e-mail com mais de 77 caracteres antes de chegar ao gerador de payload', () => {
    const longEmail = `${'a'.repeat(70)}@exemplo.com`; // 82 caracteres
    const result = parse({ pixKeyType: 'email', pixKey: longEmail });
    expect(result.success).toBe(false);

    const exactly77 = `${'a'.repeat(65)}@exemplo.com`; // 77 caracteres
    expect(exactly77).toHaveLength(77);
    expect(parse({ pixKeyType: 'email', pixKey: exactly77 }).success).toBe(true);
  });

  it('rejeita e-mail, telefone e chave aleatória em formato inválido', () => {
    expect(parse({ pixKeyType: 'email', pixKey: 'sem-arroba.com' }).success).toBe(false);
    expect(parse({ pixKeyType: 'telefone', pixKey: '99999' }).success).toBe(false);
    expect(parse({ pixKeyType: 'telefone', pixKey: '(01) 99999-0000' }).success).toBe(false);
    expect(parse({ pixKeyType: 'aleatoria', pixKey: 'nao-e-um-uuid' }).success).toBe(false);
  });

  it('exige chave e tipo juntos', () => {
    expect(parse({ pixKey: 'studio@aurora.com' }).success).toBe(false);
    expect(parse({ pixKeyType: 'email' }).success).toBe(false);
    expect(parse({ slug: 'studio-aurora' }).success).toBe(true);
  });

  it('aceita até 6 fotos de galeria com URL válida', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://x.com/foto-${i}.jpg`);
    expect(parse({ galleryPhotos: urls }).success).toBe(true);
    expect(parse({ galleryPhotos: [] }).success).toBe(true);
  });

  it('rejeita mais de 6 fotos de galeria ou URL inválida', () => {
    const tooMany = Array.from({ length: 7 }, (_, i) => `https://x.com/foto-${i}.jpg`);
    expect(parse({ galleryPhotos: tooMany }).success).toBe(false);
    expect(parse({ galleryPhotos: ['nao-e-uma-url'] }).success).toBe(false);
  });
});

describe('businessPublicPageService.checkSlugAvailability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna false para um slug em formato inválido, sem consultar o banco', async () => {
    const available = await businessPublicPageService.checkSlugAvailability('Studio Aurora', 'biz-1');
    expect(available).toBe(false);
    expect(businessPublicPageRepository.slugExists).not.toHaveBeenCalled();
  });

  it('retorna true quando o slug válido não está em uso por outro negócio', async () => {
    (businessPublicPageRepository.slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const available = await businessPublicPageService.checkSlugAvailability('studio-aurora', 'biz-1');

    expect(available).toBe(true);
    expect(businessPublicPageRepository.slugExists).toHaveBeenCalledWith('studio-aurora', 'biz-1');
  });

  it('retorna false quando o slug já está em uso por outro negócio', async () => {
    (businessPublicPageRepository.slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const available = await businessPublicPageService.checkSlugAvailability('studio-aurora', 'biz-1');

    expect(available).toBe(false);
  });
});

describe('businessPublicPageService.uploadImage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envia o buffer decodificado para o Supabase via cliente admin e devolve a URL pública', async () => {
    uploadMock.mockResolvedValue({ error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.test/biz-1/foto.jpg' } });

    const imageBase64 = Buffer.from('conteudo-fake-da-imagem').toString('base64');
    const url = await businessPublicPageService.uploadImage('biz-1', { imageBase64, contentType: 'image/jpeg' });

    expect(url).toBe('https://cdn.test/biz-1/foto.jpg');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, buffer, options] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^biz-1\/\d+-[a-z0-9]+\.jpg$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: true });
  });

  it('rejeita imagem maior que 4MB antes de chamar o Supabase', async () => {
    const imageBase64 = Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');

    await expect(
      businessPublicPageService.uploadImage('biz-1', { imageBase64, contentType: 'image/png' })
    ).rejects.toThrow('Imagem inválida ou maior que 4MB');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejeita base64 vazio', async () => {
    await expect(
      businessPublicPageService.uploadImage('biz-1', { imageBase64: '', contentType: 'image/png' })
    ).rejects.toThrow('Imagem inválida ou maior que 4MB');
  });

  it('propaga erro do Supabase como falha de upload', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'bucket not found' } });
    const imageBase64 = Buffer.from('x').toString('base64');

    await expect(
      businessPublicPageService.uploadImage('biz-1', { imageBase64, contentType: 'image/webp' })
    ).rejects.toThrow('Falha ao enviar imagem: bucket not found');
  });
});
