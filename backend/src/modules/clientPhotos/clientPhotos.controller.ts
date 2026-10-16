import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { NotFoundError } from '../../utils/errors.js';
import { clientPhotosService } from './clientPhotos.service.js';
import { UploadPhotoSchema, UuidParam } from './clientPhotos.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const uuid = (value: unknown, resource: string): string => {
  const r = UuidParam.safeParse(value);
  if (!r.success) throw new NotFoundError(resource);
  return r.data;
};

export const listPhotos: H = async (req, res, next) => {
  try { sendSuccess(res, await clientPhotosService.list(req.user.businessId!, uuid(req.params['id'], 'Cliente'))); } catch (e) { next(e); }
};
export const uploadPhoto: H = async (req, res, next) => {
  try {
    const clientId = uuid(req.params['id'], 'Cliente');
    const input = UploadPhotoSchema.parse(req.body);
    sendCreated(res, await clientPhotosService.upload(req.user.businessId!, clientId, input, req.user.userId));
  } catch (e) { next(e); }
};
export const deletePhoto: H = async (req, res, next) => {
  try {
    await clientPhotosService.remove(req.user.businessId!, uuid(req.params['id'], 'Cliente'), uuid(req.params['photoId'], 'Foto'));
    sendSuccess(res, { message: 'Foto removida' });
  } catch (e) { next(e); }
};
