import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
  clientExists: vi.fn(), countOwned: vi.fn(), setClientTags: vi.fn(),
}));
vi.mock('../modules/tags/tags.repository.js', () => ({ tagsRepository: repo }));

const { tagsService } = await import('../modules/tags/tags.service.js');
const { CreateTagSchema } = await import('../modules/tags/tags.types.js');

const p2002 = () => Object.assign(new Error('unique'), { code: 'P2002' });
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  repo.clientExists.mockResolvedValue(true);
  repo.countOwned.mockResolvedValue(1);
  repo.setClientTags.mockResolvedValue([{ id: T1, name: 'VIP', color: 'brand' }]);
});

describe('tagsService', () => {
  it('nome repetido (P2002) na criação vira ConflictError', async () => {
    repo.create.mockRejectedValue(p2002());
    await expect(tagsService.create('b1', { name: 'vip', color: 'brand' })).rejects.toMatchObject({ statusCode: 409, message: 'Já existe uma etiqueta com esse nome' });
  });
  it('nome repetido (P2002) na edição vira ConflictError', async () => {
    repo.update.mockRejectedValue(p2002());
    await expect(tagsService.update(T1, 'b1', { name: 'VIP' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('editar etiqueta inexistente -> NotFound', async () => {
    repo.update.mockResolvedValue(null);
    await expect(tagsService.update(T1, 'b1', { name: 'X' })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('apagar chama delete (cascade remove de client_tags)', async () => {
    repo.delete.mockResolvedValue(true);
    await tagsService.remove(T1, 'b1');
    expect(repo.delete).toHaveBeenCalledWith(T1, 'b1');
  });
  it('apagar etiqueta de outro negócio -> NotFound', async () => {
    repo.delete.mockResolvedValue(false);
    await expect(tagsService.remove(T1, 'b1')).rejects.toMatchObject({ statusCode: 404 });
  });
  it('PUT clients/:id/tags com etiqueta de outro negócio -> Etiqueta inválida', async () => {
    repo.countOwned.mockResolvedValue(1);
    await expect(tagsService.setClientTags('b1', 'c1', [T1, T2])).rejects.toMatchObject({ statusCode: 400, message: 'Etiqueta inválida' });
    expect(repo.setClientTags).not.toHaveBeenCalled();
  });
  it('cliente de outro negócio -> Cliente não encontrada', async () => {
    repo.clientExists.mockResolvedValue(false);
    await expect(tagsService.setClientTags('b1', 'c1', [T1])).rejects.toMatchObject({ statusCode: 404, message: 'Cliente não encontrada' });
  });
  it('define etiquetas (sem duplicar) e aceita lista vazia', async () => {
    expect(await tagsService.setClientTags('b1', 'c1', [T1, T1])).toHaveLength(1);
    expect(repo.setClientTags).toHaveBeenCalledWith('b1', 'c1', [T1]);
    await tagsService.setClientTags('b1', 'c1', []);
    expect(repo.countOwned).toHaveBeenCalledTimes(1);
  });
});

describe('CreateTagSchema', () => {
  it('rejeita cor inválida e nome vazio/longo; apara o nome', () => {
    expect(CreateTagSchema.safeParse({ name: 'VIP', color: 'rosa' }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: '   ', color: 'brand' }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: 'x'.repeat(41), color: 'brand' }).success).toBe(false);
    expect(CreateTagSchema.parse({ name: '  VIP ', color: 'danger' }).name).toBe('VIP');
  });
});
