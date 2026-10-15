import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { getInsights, getPhases, exportClientsCsv } from './crm.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('clients')];

router.get('/insights', ...guard, getInsights);
router.get('/phases', ...guard, getPhases);
router.get('/export.csv', ...guard, exportClientsCsv);

export default router;
