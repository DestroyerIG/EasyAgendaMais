import { describe, it, expect } from 'vitest';
import { shouldSkipRefreshByUrl } from '@/lib/api';

describe('refresh automático', () => {
  it('não tenta renovar a sessão nas rotas do login com Google', () => {
    expect(shouldSkipRefreshByUrl('/auth/oauth/sessao')).toBe(true);
    expect(shouldSkipRefreshByUrl('/auth/oauth/completar')).toBe(true);
    expect(shouldSkipRefreshByUrl('/appointments')).toBe(false);
  });
});

describe('páginas públicas do login com Google', () => {
  it('o retorno do Google e o completar cadastro não exigem sessão', async () => {
    const { isPublicAuthPath } = await import('@/lib/publicRoutes');
    expect(isPublicAuthPath('/auth/callback')).toBe(true);
    expect(isPublicAuthPath('/cadastro/completar')).toBe(true);
  });
});
