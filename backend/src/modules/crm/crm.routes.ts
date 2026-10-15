import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { getInsights, getPhases, exportClientsCsv, getProfile, getTimeline, putTechnicalSheet, postConsent } from './crm.controller.js';
import { putClientTags } from '../tags/tags.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('clients')];

router.get('/insights', ...guard, getInsights);
router.get('/phases', ...guard, getPhases);
router.get('/export.csv', ...guard, exportClientsCsv);
router.get('/:id/profile', ...guard, getProfile);
router.get('/:id/timeline', ...guard, getTimeline);
router.put('/:id/technical-sheet', ...guard, putTechnicalSheet);
router.post('/:id/consent', ...guard, postConsent);
router.put('/:id/tags', ...guard, putClientTags);

export default router;
