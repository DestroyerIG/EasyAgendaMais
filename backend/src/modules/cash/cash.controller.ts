import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { cashService } from './cash.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const getCashDay: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.getDay(req.user.businessId!, req.query['date'] as string | undefined)); } catch (e) { next(e); }
};
export const openCash: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.open(req.user.businessId!, req.user.userId, req.body.openingBalance)); } catch (e) { next(e); }
};
export const addCashMovement: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.addMovement(req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
export const reopenCash: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.reopen(req.user.businessId!)); } catch (e) { next(e); }
};
export const closeCash: H = async (req, res, next) => {
  try { sendSuccess(res, await cashService.close(req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
