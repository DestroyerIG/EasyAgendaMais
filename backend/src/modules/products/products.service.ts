import { NotFoundError } from '../../utils/errors.js';
import { productsRepository } from './products.repository.js';
import type { CreateProductInput, UpdateProductInput, ProductDto } from './products.types.js';

const toDto = (p: { id: string; name: string; description: string | null; price: unknown; active: boolean }): ProductDto => ({
  id: p.id, name: p.name, description: p.description, price: Number(p.price), active: p.active,
});

export const productsService = {
  async list(businessId: string) {
    return (await productsRepository.list(businessId)).map(toDto);
  },
  async create(businessId: string, data: CreateProductInput) {
    return toDto(await productsRepository.create(businessId, data));
  },
  async update(id: string, businessId: string, data: UpdateProductInput) {
    const p = await productsRepository.update(id, businessId, data);
    if (!p) throw new NotFoundError('Produto');
    return toDto(p);
  },
  async remove(id: string, businessId: string) {
    const ok = await productsRepository.deactivate(id, businessId);
    if (!ok) throw new NotFoundError('Produto');
  },
};
