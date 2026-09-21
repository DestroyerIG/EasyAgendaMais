import type { Request, Response, NextFunction } from 'express';
import { businessSettingsService } from '../services/businessSettingsService.js';
import { authService } from '../services/authService.js';
import { sendSuccess } from '../utils/response.js';
import logger from '../utils/logger.js';

export const getBusinessSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessSettingsService.getSettings(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBusinessSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessSettingsService.updateSettings(req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBusinessProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessSettingsService.getProfile(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateBusinessProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessSettingsService.updateProfile(req.user.businessId!, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAccountProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await businessSettingsService.getAccountProfile(req.user as { businessId: string; userId: string; role: string });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateAccountProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info(
      {
        operation: 'updateAccountProfile',
        requestId: req.requestId,
        path: req.path,
        method: req.method,
        userId: req.user?.userId || null,
        businessId: req.user?.businessId || null,
        role: req.user?.role || null,
      },
      'Recebida requisicao para atualizar dados cadastrais'
    );

    const result = await businessSettingsService.updateAccountProfile(req.user as { businessId: string; userId: string; role: string }, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser as Parameters<typeof authService.refreshAuthenticatedSession>[1]);
    }

    sendSuccess(res, result.profile);
  } catch (error) {
    next(error);
  }
};

export const updateAccountPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await businessSettingsService.updatePassword(req.user as { businessId: string; userId: string; role: string }, req.body);

    if (result?.sessionUser) {
      await authService.refreshAuthenticatedSession(res, result.sessionUser as Parameters<typeof authService.refreshAuthenticatedSession>[1]);
    }

    sendSuccess(res, { message: result.message });
  } catch (error) {
    next(error);
  }
};
