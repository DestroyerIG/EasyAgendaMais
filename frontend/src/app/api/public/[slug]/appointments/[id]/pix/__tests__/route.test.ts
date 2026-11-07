// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

describe('BFF da troca para Pix', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('repassa o POST para a rota pública de Pix do backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ forma: 'pix', pixPayload: 'x', expiresAt: '2026-11-07T12:00:00Z' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(
      new Request('http://localhost:3000/api/public/barbearia/appointments/ag-1/pix', { method: 'POST' }),
      { params: Promise.resolve({ slug: 'barbearia', id: 'ag-1' }) },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/public\/barbearia\/appointments\/ag-1\/pix$/);
    expect(init.method).toBe('POST');
    expect(res.status).toBe(200);
  });
});
