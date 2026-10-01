import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { businessPublicPageService } from './businessPublicPage.service.js';

export const getPublicPageSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessPublicPageService.get(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updatePublicPageSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessPublicPageService.update(req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const checkSlugAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = String(req.query.slug ?? '');
    const available = await businessPublicPageService.checkSlugAvailability(slug, req.user.businessId!);
    sendSuccess(res, { available });
  } catch (error) {
    next(error);
  }
};

export const uploadPublicPageImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const url = await businessPublicPageService.uploadImage(req.user.businessId!, req.body);
    sendSuccess(res, { url });
  } catch (error) {
    next(error);
  }
};
