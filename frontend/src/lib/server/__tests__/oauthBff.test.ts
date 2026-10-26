import { describe, it, expect, vi, beforeEach } from 'vitest';

const bff = vi.hoisted(() => ({
  requestBackendAuth: vi.fn(),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  extractAuthTokens: vi.fn((p: { token?: string; refreshToken?: string }) => ({ accessToken: p?.token ?? null, refreshToken: p?.refreshToken ?? null })),
  successResponse: vi.fn((payload: unknown, status: number) => ({ payload, status })),
  errorResponse: vi.fn((status: number, payload: unknown) => ({ status, payload })),
}));
vi.mock('@/lib/server/authBff', () => bff);

const { encaminharOAuth } = await import('../oauthBff');
const pedido = (corpo: unknown) => ({ json: async () => corpo }) as never;
const upstream = (status: number, payload: unknown) => ({ response: { ok: status < 400, status }, payload, networkError: false });

describe('rotas OAuth do BFF', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sessão com conta existente grava os cookies no domínio do site', async () => {
    bff.requestBackendAuth.mockResolvedValue(upstream(200, { completarCadastro: false, token: 'a', refreshToken: 'r' }));
    await encaminharOAuth('oauth/sessao', pedido({ accessToken: 'x' }));
    expect(bff.requestBackendAuth).toHaveBeenCalledWith('oauth/sessao', expect.objectContaining({ method: 'POST', body: JSON.stringify({ accessToken: 'x' }) }));
    expect(bff.setAuthCookies).toHaveBeenCalledWith(expect.anything(), 'a', 'r');
  });

  it('pedido de completar cadastro passa sem cookies', async () => {
    bff.requestBackendAuth.mockResolvedValue(upstream(200, { completarCadastro: true, email: 'dona@x.com', nome: 'Ana' }));
    const r = await encaminharOAuth('oauth/sessao', pedido({ accessToken: 'x' })) as unknown as { payload: unknown };
    expect(bff.setAuthCookies).not.toHaveBeenCalled();
    expect(r.payload).toEqual({ completarCadastro: true, email: 'dona@x.com', nome: 'Ana' });
  });

  it('erro do backend volta com o status dele', async () => {
    bff.requestBackendAuth.mockResolvedValue(upstream(401, { error: { code: 'X' } }));
    const r = await encaminharOAuth('oauth/completar', pedido({})) as unknown as { status: number };
    expect(r.status).toBe(401);
    expect(bff.setAuthCookies).not.toHaveBeenCalled();
  });
});
