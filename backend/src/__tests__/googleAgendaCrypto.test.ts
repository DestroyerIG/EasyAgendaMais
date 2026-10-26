import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { cifrar, decifrar, googleConfigurado } from '../modules/googleAgenda/googleAgenda.crypto.js';

const VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_AGENDA_REDIRECT_URI', 'GOOGLE_TOKEN_KEY'] as const;

describe('cifra do token do Google', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'segredo';
    process.env.GOOGLE_AGENDA_REDIRECT_URI = 'https://api.exemplo.com/api/v1/google-agenda/callback';
    process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');
  });
  afterEach(() => { for (const v of VARS) delete process.env[v]; });

  it('cifra e decifra ida e volta', () => {
    const c = cifrar('1//refresh-token');
    expect(c).not.toContain('refresh-token');
    expect(c.split('.')).toHaveLength(3);
    expect(decifrar(c)).toBe('1//refresh-token');
  });

  it('decifrar com dado adulterado lança', () => {
    const [iv, tag, dados] = cifrar('1//refresh-token').split('.');
    const trocado = `${iv}.${tag}.${dados.slice(0, -2)}AA`;
    expect(() => decifrar(trocado)).toThrow();
  });

  it('googleConfigurado é false sem GOOGLE_TOKEN_KEY', () => {
    expect(googleConfigurado()).toBe(true);
    delete process.env.GOOGLE_TOKEN_KEY;
    expect(googleConfigurado()).toBe(false);
  });
});
