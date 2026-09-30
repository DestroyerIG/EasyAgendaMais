import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { publicBookingService } from './publicBooking.service.js';

export const getStorefront = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getStorefront(String(req.params['slug']));
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getProfessionals(String(req.params['slug']));
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getAvailability(String(req.params['slug']), req.query as never);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.createPendingAppointment(String(req.params['slug']), req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};
