import { tagsRepository } from './tags.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import type { CreateTagInput, UpdateTagInput } from './tags.types.js';

async function comNomeUnico<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw new ConflictError('Já existe uma etiqueta com esse nome');
    throw e;
  }
}

export const tagsService = {
  list: (businessId: string) => tagsRepository.list(businessId),
  create: (businessId: string, input: CreateTagInput) => comNomeUnico(() => tagsRepository.create(businessId, input)),
  async update(id: string, businessId: string, input: UpdateTagInput) {
    const r = await comNomeUnico(() => tagsRepository.update(id, businessId, input));
    if (!r) throw new NotFoundError('Etiqueta');
    return r;
  },
  async remove(id: string, businessId: string) {
    if (!(await tagsRepository.delete(id, businessId))) throw new NotFoundError('Etiqueta');
  },
  async setClientTags(businessId: string, clientId: string, tagIds: string[]) {
    if (!(await tagsRepository.clientExists(clientId, businessId))) throw new NotFoundError('Cliente');
    const ids = [...new Set(tagIds)];
    if (ids.length && (await tagsRepository.countOwned(businessId, ids)) !== ids.length) throw new ValidationError('Etiqueta inválida');
    return tagsRepository.setClientTags(businessId, clientId, ids);
  },
};
