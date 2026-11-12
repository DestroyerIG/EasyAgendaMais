// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// O front só chega ao backend por rotas de repasse declaradas uma a uma; sem elas a chamada
// vira 404 ("Recurso não encontrado"). Este teste garante que as três do liga/desliga existem.
const proxyRequest = vi.hoisted(() => vi.fn().mockResolvedValue(new Response('{}')));
vi.mock('@/lib/server/proxy', () => ({ proxyRequest }));

const req = (metodo: string) => new Request('http://localhost:3000/api/x', { method: metodo });

describe('repasses da disponibilidade da profissional', () => {
  it('dona: PUT /business/professionals/:id/disponibilidade', async () => {
    const { PUT } = await import('./business/professionals/[id]/disponibilidade/route');
    await PUT(req('PUT'), { params: Promise.resolve({ id: 'p1' }) });
    expect(proxyRequest).toHaveBeenLastCalledWith(expect.any(Request), '/business/professionals/p1/disponibilidade', 'PUT');
  });

  it('admin: GET /admin/tenants/:id/profissionais', async () => {
    const { GET } = await import('./admin/tenants/[id]/profissionais/route');
    await GET(req('GET'), { params: Promise.resolve({ id: 't1' }) });
    expect(proxyRequest).toHaveBeenLastCalledWith(expect.any(Request), '/admin/tenants/t1/profissionais', 'GET');
  });

  it('admin: PATCH /admin/tenants/:id/profissionais/:professionalId/disponibilidade', async () => {
    const { PATCH } = await import('./admin/tenants/[id]/profissionais/[professionalId]/disponibilidade/route');
    await PATCH(req('PATCH'), { params: Promise.resolve({ id: 't1', professionalId: 'p1' }) });
    expect(proxyRequest).toHaveBeenLastCalledWith(expect.any(Request), '/admin/tenants/t1/profissionais/p1/disponibilidade', 'PATCH');
  });
});
