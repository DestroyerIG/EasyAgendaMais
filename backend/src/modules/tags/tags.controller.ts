import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { tagsService } from './tags.service.js';
import { ClientTagsSchema } from './tags.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const listTags: H = async (req, res, next) => {
  try { sendSuccess(res, await tagsService.list(req.user.businessId!)); } catch (e) { next(e); }
};
export const createTag: H = async (req, res, next) => {
  try { sendCreated(res, await tagsService.create(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const updateTag: H = async (req, res, next) => {
  try { sendSuccess(res, await tagsService.update(String(req.params['id']), req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const deleteTag: H = async (req, res, next) => {
  try {
    await tagsService.remove(String(req.params['id']), req.user.businessId!);
    sendSuccess(res, { message: 'Etiqueta removida' });
  } catch (e) { next(e); }
};
export const putClientTags: H = async (req, res, next) => {
  try {
    const { tagIds } = ClientTagsSchema.parse(req.body);
    sendSuccess(res, await tagsService.setClientTags(req.user.businessId!, String(req.params['id']), tagIds));
  } catch (e) { next(e); }
};
