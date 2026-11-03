// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as exportarNegocios } from '../route';
import { GET as exportarAuditoria } from '../../[id]/auditoria.csv/route';

// O BOM no começo do CSV é o que faz o Excel abrir os acentos certo: ler o corpo como texto o perderia.
const BYTES = new Uint8Array([0xef, 0xbb, 0xbf, 78, 101, 103]);

const respostaCsv = () => new Response(BYTES, {
  status: 200,
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="negocios.csv"' },
});

describe('BFF dos CSVs do SuperAdmin', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exportação de negócios repassa a query, os bytes (com BOM) e os headers do arquivo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaCsv());
    vi.stubGlobal('fetch', fetchMock);

    const res = await exportarNegocios(new Request(
      'http://localhost:3000/api/admin/tenants/export.csv?status=carencia&busca=ana',
      { headers: { cookie: 'access=abc', 'x-request-id': 'req-1' } },
    ));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/admin\/tenants\/export\.csv\?status=carencia&busca=ana$/);
    expect((init.headers as Headers).get('cookie')).toBe('access=abc');
    expect((init.headers as Headers).get('x-request-id')).toBe('req-1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="negocios.csv"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it('auditoria do negócio repassa o id e a categoria', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaCsv());
    vi.stubGlobal('fetch', fetchMock);

    const res = await exportarAuditoria(
      new Request('http://localhost:3000/api/admin/tenants/abc/auditoria.csv?categoria=financeiro'),
      { params: Promise.resolve({ id: 'abc' }) },
    );

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/admin\/tenants\/abc\/auditoria\.csv\?categoria=financeiro$/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it('erro do backend mantém o status e o JSON do erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"success":false}', {
      status: 403, headers: { 'content-type': 'application/json' },
    })));

    const res = await exportarNegocios(new Request('http://localhost:3000/api/admin/tenants/export.csv'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('{"success":false}');
  });

  it('falha de rede vira 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await exportarNegocios(new Request('http://localhost:3000/api/admin/tenants/export.csv'));
    expect(res.status).toBe(502);
  });
});
