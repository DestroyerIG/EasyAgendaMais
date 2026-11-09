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

export const getAvailabilityGrid = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getAvailabilityGrid(String(req.params['slug']), req.query as never);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAvailabilityDays = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getAvailabilityDays(String(req.params['slug']), req.query as never);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAppointmentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getAppointmentStatus(String(req.params['slug']), String(req.params['id']));
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

export const getPixDaReserva = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.getPixDaReserva(String(req.params['slug']), String(req.params['id']));
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const confirmarInfinitePay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await publicBookingService.confirmarInfinitePay(String(req.params['slug']), String(req.params['id']), req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
