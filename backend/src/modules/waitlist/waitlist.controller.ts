import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { waitlistService } from './waitlist.service.js';
import { ListQuerySchema } from './waitlist.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const id = (req: Request) => String(req.params['id']);

export const listWaitlist: H = async (req, res, next) => {
  try { sendSuccess(res, await waitlistService.list(req.user.businessId!, ListQuerySchema.parse(req.query))); } catch (e) { next(e); }
};
export const createWaitlist: H = async (req, res, next) => {
  try { sendCreated(res, await waitlistService.create(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const updateWaitlist: H = async (req, res, next) => {
  try { sendSuccess(res, await waitlistService.update(req.user.businessId!, id(req), req.body)); } catch (e) { next(e); }
};
export const offerWaitlist: H = async (req, res, next) => {
  try { sendSuccess(res, await waitlistService.offer(req.user.businessId!, id(req), req.body)); } catch (e) { next(e); }
};
export const bookedWaitlist: H = async (req, res, next) => {
  try { sendSuccess(res, await waitlistService.booked(req.user.businessId!, id(req), req.body.appointmentId)); } catch (e) { next(e); }
};
