import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ buscar: vi.fn(), gravar: vi.fn() }));
vi.mock('../modules/whatsappAvatar/avatar.repository.js', () => ({ avatarRepository: repo }));
const evo = vi.hoisted(() => ({ evolutionApi: { fetchProfilePictureUrl: vi.fn() } }));
vi.mock('../modules/whatsapp/evolution-api.service.js', () => evo);
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);

const { avatares, VALIDADE_FOTO_DIAS, NOVA_TENTATIVA_SEM_FOTO_DIAS, LOTE_POR_NEGOCIO } =
  await import('../modules/whatsappAvatar/avatar.service.js');

const AGORA = new Date('2026-10-20T15:00:00Z');
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);
const linha = (phoneKey: string, url: string | null, dias: number) => ({
  id: 'x', businessId: 'b1', phoneKey, url, fetchedAt: diasAtras(dias),
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.buscar.mockResolvedValue([]);
  repo.gravar.mockResolvedValue(undefined);
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected', instanceName: 'inst-b1' });
  evo.evolutionApi.fetchProfilePictureUrl.mockResolvedValue('https://pps/foto.jpg');
});

describe('constantes', () => {
  it('valores do spec', () => {
    expect([VALIDADE_FOTO_DIAS, NOVA_TENTATIVA_SEM_FOTO_DIAS, LOTE_POR_NEGOCIO]).toEqual([3, 7, 10]);
  });
});

describe('urlsPara', () => {
  it('sem registro: null e agenda a busca', async () => {
    const m = await avatares.urlsPara('b1', ['83999990000'], AGORA);
    expect(m.get('8399990000')).toBeNull();
    await avatares.processar(AGORA);
    expect(evo.evolutionApi.fetchProfilePictureUrl).toHaveBeenCalledWith('inst-b1', '5583999990000');
  });

  it('url de 1 dia: devolve e não agenda', async () => {
    repo.buscar.mockResolvedValue([linha('8399991111', 'https://a', 1)]);
    const m = await avatares.urlsPara('b1', ['83999991111'], AGORA);
    expect(m.get('8399991111')).toBe('https://a');
    await avatares.processar(AGORA);
    expect(evo.evolutionApi.fetchProfilePictureUrl).not.toHaveBeenCalled();
  });

  it('url de 4 dias: devolve a antiga e agenda', async () => {
    repo.buscar.mockResolvedValue([linha('8399992222', 'https://velha', 4)]);
    const m = await avatares.urlsPara('b1', ['83999992222'], AGORA);
    expect(m.get('8399992222')).toBe('https://velha');
    await avatares.processar(AGORA);
    expect(evo.evolutionApi.fetchProfilePictureUrl).toHaveBeenCalledTimes(1);
  });

  it('sem foto há 2 dias: não agenda; há 8 dias: agenda', async () => {
    repo.buscar.mockResolvedValue([linha('8399993333', null, 2), linha('8399994444', null, 8)]);
    const m = await avatares.urlsPara('b1', ['83999993333', '83999994444'], AGORA);
    expect(m.get('8399993333')).toBeNull();
    expect(m.get('8399994444')).toBeNull();
    await avatares.processar(AGORA);
    expect(evo.evolutionApi.fetchProfilePictureUrl).toHaveBeenCalledTimes(1);
    expect(evo.evolutionApi.fetchProfilePictureUrl).toHaveBeenCalledWith('inst-b1', '5583999994444');
  });

  it('telefones com e sem 9/55 caem na mesma chave', async () => {
    repo.buscar.mockResolvedValue([linha('8399995555', 'https://x', 1)]);
    const m = await avatares.urlsPara('b1', ['83999995555', '5583999995555', '8399995555'], AGORA);
    expect(m.size).toBe(1);
    expect(m.get('8399995555')).toBe('https://x');
    expect(repo.buscar).toHaveBeenCalledWith('b1', ['8399995555']);
  });

  it('lista vazia não consulta o banco', async () => {
    const m = await avatares.urlsPara('b1', [], AGORA);
    expect(m.size).toBe(0);
    expect(repo.buscar).not.toHaveBeenCalled();
  });

  it('falha ao ler o cache não lança: tudo null', async () => {
    repo.buscar.mockRejectedValue(new Error('db'));
    const m = await avatares.urlsPara('b1', ['83999990000'], AGORA);
    expect(m.get('8399990000')).toBeNull();
  });
});

describe('processar', () => {
  it('busca no máximo 10 por negócio por tick e grava a url', async () => {
    const fones = Array.from({ length: 12 }, (_, i) => `839999000${String(i).padStart(2, '0')}`);
    await avatares.urlsPara('b1', fones, AGORA);
    const r1 = await avatares.processar(AGORA);
    expect(r1.buscados).toBe(10);
    expect(repo.gravar).toHaveBeenCalledTimes(10);
    expect(repo.gravar).toHaveBeenCalledWith('b1', expect.any(String), 'https://pps/foto.jpg', AGORA);
    const r2 = await avatares.processar(AGORA);
    expect(r2.buscados).toBe(2);
  });

  it('grava null quando não há foto', async () => {
    evo.evolutionApi.fetchProfilePictureUrl.mockResolvedValue(null);
    await avatares.urlsPara('b1', ['83999990000'], AGORA);
    await avatares.processar(AGORA);
    expect(repo.gravar).toHaveBeenCalledWith('b1', '8399990000', null, AGORA);
  });

  it('ignora negócio desconectado', async () => {
    wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected', instanceName: 'inst-b1' });
    await avatares.urlsPara('b1', ['83999990000'], AGORA);
    const r = await avatares.processar(AGORA);
    expect(r.buscados).toBe(0);
    expect(evo.evolutionApi.fetchProfilePictureUrl).not.toHaveBeenCalled();
    expect(repo.gravar).not.toHaveBeenCalled();
  });

  it('erro da Evolution grava null sem lançar', async () => {
    evo.evolutionApi.fetchProfilePictureUrl.mockRejectedValue(new Error('boom'));
    await avatares.urlsPara('b1', ['83999990000'], AGORA);
    await expect(avatares.processar(AGORA)).resolves.toEqual({ buscados: 1 });
    expect(repo.gravar).toHaveBeenCalledWith('b1', '8399990000', null, AGORA);
  });
});
