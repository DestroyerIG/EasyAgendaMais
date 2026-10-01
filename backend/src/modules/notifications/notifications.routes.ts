import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { ListNotificationsQuerySchema } from './notifications.types.js';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles];

router.get('/', ...guard, validate({ query: ListNotificationsQuerySchema }), listNotifications);
router.get('/unread-count', ...guard, getUnreadCount);
router.put('/read-all', ...guard, markAllNotificationsRead);
router.put('/:id/read', ...guard, markNotificationRead);

export default router;
