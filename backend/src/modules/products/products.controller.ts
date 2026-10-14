import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { productsService } from './products.service.js';

export const listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await productsService.list(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await productsService.create(req.user.businessId!, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await productsService.update(String(req.params['id']), req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await productsService.remove(String(req.params['id']), req.user.businessId!);
    sendSuccess(res, { message: 'Produto removido' });
  } catch (error) {
    next(error);
  }
};
