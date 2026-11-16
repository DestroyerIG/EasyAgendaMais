import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ABRIR_PREFERENCIAS_EVENT,
  CONSENT_EVENT,
  CONSENT_KEY,
  CONSENT_VERSION,
  abrirPreferenciasCookies,
  lerConsentimento,
  marketingConsentido,
  salvarConsentimento,
} from '../cookieConsent';

const DIA = 24 * 60 * 60 * 1000;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('cookieConsent', () => {
  it('grava e lê a escolha', () => {
    const salvo = salvarConsentimento(true, 1000);
    expect(salvo).toEqual({ versao: CONSENT_VERSION, marketing: true, em: 1000 });
    expect(lerConsentimento(1000)).toEqual(salvo);
  });

  it('sem nada gravado devolve null', () => {
    expect(lerConsentimento()).toBeNull();
  });

  it('JSON inválido vira "sem escolha"', () => {
    localStorage.setItem(CONSENT_KEY, '{x');
    expect(lerConsentimento()).toBeNull();
  });

  it('versão antiga vira "sem escolha"', () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ versao: 0, marketing: true, em: Date.now() }));
    expect(lerConsentimento()).toBeNull();
  });

  it('expira depois de 12 meses', () => {
    salvarConsentimento(true, 0);
    expect(lerConsentimento(364 * DIA)).not.toBeNull();
    expect(lerConsentimento(366 * DIA)).toBeNull();
  });

  it('descarta escolha com data no futuro (relógio errado ou valor adulterado)', () => {
    salvarConsentimento(true, 10 * DIA);
    expect(lerConsentimento(1 * DIA)).toBeNull();
  });

  it('tolera localStorage que lança', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => salvarConsentimento(true)).not.toThrow();
    expect(lerConsentimento()).toBeNull();
  });

  it('dispara o evento ao salvar', () => {
    const ouvinte = vi.fn();
    window.addEventListener(CONSENT_EVENT, ouvinte);
    salvarConsentimento(false);
    window.removeEventListener(CONSENT_EVENT, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('marketingConsentido só é true após aceitar', () => {
    expect(marketingConsentido()).toBe(false);
    salvarConsentimento(false);
    expect(marketingConsentido()).toBe(false);
    salvarConsentimento(true);
    expect(marketingConsentido()).toBe(true);
  });

  it('abrirPreferenciasCookies dispara o evento de abertura', () => {
    const ouvinte = vi.fn();
    window.addEventListener(ABRIR_PREFERENCIAS_EVENT, ouvinte);
    abrirPreferenciasCookies();
    window.removeEventListener(ABRIR_PREFERENCIAS_EVENT, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});
