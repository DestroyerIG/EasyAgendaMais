import { describe, it, expect, vi, beforeEach } from 'vitest';
import { percentualDoSinal } from '../modules/recebimentos/reservaComSinal.rules.js';
import { businessPublicPageService } from '../modules/businessPublicPage/businessPublicPage.service.js';
import { businessPublicPageRepository } from '../modules/businessPublicPage/businessPublicPage.repository.js';
import { ValidationError } from '../utils/errors.js';

vi.mock('../modules/businessPublicPage/businessPublicPage.repository.js', () => ({
  businessPublicPageRepository: { findByBusinessId: vi.fn(), slugExists: vi.fn(), update: vi.fn() },
}));
vi.mock('../services/supabaseAuthService.js', () => ({ getSupabaseAdminClient: () => ({}) }));

describe('percentualDoSinal', () => {
  const ligado = { ativo: true, pct: 30 };
  it('a porcentagem do serviço prevalece sobre a geral', () => expect(percentualDoSinal(50, ligado)).toBe(50));
  it('serviço com 0% não pede sinal, mesmo com o geral ligado', () => expect(percentualDoSinal(0, ligado)).toBe(0));
  it('serviço sem porcentagem usa a geral quando ligada', () => expect(percentualDoSinal(null, ligado)).toBe(30));
  it('serviço sem porcentagem e geral desligada: sem sinal', () => expect(percentualDoSinal(null, { ativo: false, pct: 30 })).toBe(0));
  it('geral ligada sem porcentagem válida: sem sinal', () => expect(percentualDoSinal(null, { ativo: true, pct: null })).toBe(0));
});

describe('sinal geral nos ajustes (mesmo interruptor da cobrança do sinal)', () => {
  beforeEach(() => vi.clearAllMocks());
  const atual = (over: object) => (businessPublicPageRepository.findByBusinessId as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ pixKey: 'a@b.com', sinalPadraoPct: null, ...over });
  const salva = () => (businessPublicPageRepository.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

  it('recusa ligar sem chave Pix', async () => {
    atual({ pixKey: null });
    await expect(businessPublicPageService.update('b', { botCobraSinal: true, sinalPadraoPct: 30 })).rejects.toThrow(ValidationError);
    expect(businessPublicPageRepository.update).not.toHaveBeenCalled();
  });
  it('recusa ligar sem porcentagem', async () => {
    atual({});
    await expect(businessPublicPageService.update('b', { botCobraSinal: true })).rejects.toThrow('Informe a porcentagem');
  });
  it('liga com chave e porcentagem', async () => {
    atual({}); salva();
    await businessPublicPageService.update('b', { botCobraSinal: true, sinalPadraoPct: 30 });
    expect(businessPublicPageRepository.update).toHaveBeenCalledWith('b', { botCobraSinal: true, sinalPadraoPct: 30 });
  });
  it('liga usando a porcentagem já salva', async () => {
    atual({ sinalPadraoPct: 25 }); salva();
    await businessPublicPageService.update('b', { botCobraSinal: true });
    expect(businessPublicPageRepository.update).toHaveBeenCalled();
  });
  it('desligar não exige nada', async () => {
    salva();
    await businessPublicPageService.update('b', { botCobraSinal: false });
    expect(businessPublicPageRepository.findByBusinessId).not.toHaveBeenCalled();
  });
});
