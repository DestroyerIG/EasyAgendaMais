import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { notificationsService } from './notifications.service.js';

export const listNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = await notificationsService.list(req.user.businessId!, limit);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await notificationsService.unreadCount(req.user.businessId!);
    sendSuccess(res, { count });
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await notificationsService.markRead(req.params.id, req.user.businessId!);
    sendSuccess(res, { success: true });
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await notificationsService.markAllRead(req.user.businessId!);
    sendSuccess(res, { count });
  } catch (error) {
    next(error);
  }
};
