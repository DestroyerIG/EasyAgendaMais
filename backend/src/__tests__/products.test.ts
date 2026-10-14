import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), findActiveByIds: vi.fn() }));
vi.mock('../modules/products/products.repository.js', () => ({ productsRepository: repo }));

const { productsService } = await import('../modules/products/products.service.js');
const { CreateProductSchema } = await import('../modules/products/products.types.js');
const { NotFoundError } = await import('../utils/errors.js');

describe('productsService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista convertendo preço para número', async () => {
    repo.list.mockResolvedValue([{ id: 'p1', name: 'Óleo', description: null, price: '25.00', active: true }]);
    await expect(productsService.list('b1')).resolves.toEqual([{ id: 'p1', name: 'Óleo', description: null, price: 25, active: true }]);
  });

  it('atualizar produto de outro negócio dá NotFound', async () => {
    repo.update.mockResolvedValue(null);
    await expect(productsService.update('p1', 'b1', { price: 30 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('remover só desativa', async () => {
    repo.deactivate.mockResolvedValue(true);
    await productsService.remove('p1', 'b1');
    expect(repo.deactivate).toHaveBeenCalledWith('p1', 'b1');
  });
});

describe('CreateProductSchema', () => {
  it('recusa preço zero ou negativo', () => {
    expect(CreateProductSchema.safeParse({ name: 'Óleo', price: 0 }).success).toBe(false);
  });
  it('aceita produto com descrição curta', () => {
    expect(CreateProductSchema.safeParse({ name: 'Óleo', description: 'Produto Home Care', price: 25 }).success).toBe(true);
  });
});
