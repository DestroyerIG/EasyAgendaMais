// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

describe('BFF do backup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('repassa os mesmos headers do proxy comum (IP, agente e request id vão para a auditoria)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([80, 75]), {
      status: 200, headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="b.zip"' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(new Request('http://localhost:3000/api/conta/backup', {
      headers: {
        cookie: 'access=abc', authorization: 'Bearer t', 'x-forwarded-for': '200.1.2.3',
        'user-agent': 'Mozilla/5.0 Celular', 'x-request-id': 'req-1', connection: 'keep-alive',
      },
    }));

    const enviados = fetchMock.mock.calls[0][1].headers as Headers;
    expect(enviados.get('cookie')).toBe('access=abc');
    expect(enviados.get('authorization')).toBe('Bearer t');
    expect(enviados.get('x-forwarded-for')).toBe('200.1.2.3');
    expect(enviados.get('user-agent')).toBe('Mozilla/5.0 Celular');
    expect(enviados.get('x-request-id')).toBe('req-1');
    expect(enviados.get('connection')).toBeNull();
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([80, 75]));
  });
});
