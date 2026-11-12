import type { Request, Response, NextFunction } from 'express';
import { professionalService } from '../services/professionalService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await professionalService.getProfessionals(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createProfessional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await professionalService.createProfessional(req.user.businessId!, req.user.plan ?? '', req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateProfessional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await professionalService.updateProfessional(req.params['id'] as string, req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteProfessional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await professionalService.deleteProfessional(req.params['id'] as string, req.user.businessId!);
    sendSuccess(res, { message: 'Profissional excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const setProfessionalAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await professionalService.setAvailability(req.params['id'] as string, req.user.businessId!, req.body.available);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
