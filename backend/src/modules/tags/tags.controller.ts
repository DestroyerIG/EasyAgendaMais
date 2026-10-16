import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../../utils/errors.js';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { tagsService } from './tags.service.js';
import { ClientTagsSchema } from './tags.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// id que não é UUID responde 404 (o Prisma devolveria 500 numa coluna uuid).
const uuid = (req: Request, recurso: string): string => {
  const r = z.string().uuid().safeParse(req.params['id']);
  if (!r.success) throw new NotFoundError(recurso);
  return r.data;
};

export const listTags: H = async (req, res, next) => {
  try { sendSuccess(res, await tagsService.list(req.user.businessId!)); } catch (e) { next(e); }
};
export const createTag: H = async (req, res, next) => {
  try { sendCreated(res, await tagsService.create(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const updateTag: H = async (req, res, next) => {
  try { sendSuccess(res, await tagsService.update(uuid(req, 'Etiqueta'), req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const deleteTag: H = async (req, res, next) => {
  try {
    await tagsService.remove(uuid(req, 'Etiqueta'), req.user.businessId!);
    sendSuccess(res, { message: 'Etiqueta removida' });
  } catch (e) { next(e); }
};
export const putClientTags: H = async (req, res, next) => {
  try {
    const { tagIds } = ClientTagsSchema.parse(req.body);
    sendSuccess(res, await tagsService.setClientTags(req.user.businessId!, uuid(req, 'Cliente'), tagIds));
  } catch (e) { next(e); }
};
