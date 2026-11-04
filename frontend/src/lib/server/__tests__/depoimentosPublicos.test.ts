import { describe, it, expect, vi, afterEach } from 'vitest';
import { buscarDepoimentosPublicos } from '../depoimentosPublicos';

const resposta = (status: number, corpo: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as unknown as Response;

const item = (n: number) => ({
  texto: `Texto ${n}`,
  nota: 5,
  nomeExibido: `Dono ${n}`,
  negocio: `Negocio ${n}`,
  cidade: `Cidade ${n}`,
  logoUrl: n === 1 ? 'https://x.test/logo.png' : null,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buscarDepoimentosPublicos', () => {
  it('mapeia os itens do envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(200, { success: true, data: [item(1), item(2)] }));
    global.fetch = fetchMock as never;
    const r = await buscarDepoimentosPublicos();
    expect(r).toEqual([
      { quote: 'Texto 1', rating: 5, name: 'Dono 1', business: 'Negocio 1', city: 'Cidade 1', logoUrl: 'https://x.test/logo.png' },
      { quote: 'Texto 2', rating: 5, name: 'Dono 2', business: 'Negocio 2', city: 'Cidade 2', logoUrl: null },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/depoimentos\/publicos$/);
    expect(fetchMock.mock.calls[0][1]).toEqual({ next: { revalidate: 300 } });
  });

  it('devolve [] quando o fetch rejeita', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('rede')) as never;
    expect(await buscarDepoimentosPublicos()).toEqual([]);
  });

  it('devolve [] com status 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(500, { success: false })) as never;
    expect(await buscarDepoimentosPublicos()).toEqual([]);
  });

  it('devolve [] quando data nao e array', async () => {
    global.fetch = vi.fn().mockResolvedValue(resposta(200, { success: true, data: { a: 1 } })) as never;
    expect(await buscarDepoimentosPublicos()).toEqual([]);
  });
});
