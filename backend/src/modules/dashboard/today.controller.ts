import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { todayService } from './today.service.js';

export const getToday = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await todayService.resumo(req.user.businessId!));
  } catch (error) {
    next(error);
  }
};
