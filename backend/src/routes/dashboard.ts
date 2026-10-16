import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireTenantRoles } from '../middleware/rbac.js';
// @ts-ignore
import { requireFeature } from '../middleware/subscriptionGuard.js';
// @ts-ignore
import { getDashboard } from '../controllers/dashboardController.js';
import { getToday } from '../modules/dashboard/today.controller.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('dashboard'), getDashboard);
router.get('/today', authMiddleware, requireTenantRoles, requireFeature('dashboard'), getToday);

export default router;
