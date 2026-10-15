import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireRole, requireTenantRoles } from '../middleware/rbac.js';
// @ts-ignore
import { requireFeature } from '../middleware/subscriptionGuard.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import { getCrmSettings, putCrmSettings } from '../modules/crm/crm.controller.js';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js';
// @ts-ignore
import { getProfessionals, createProfessional, updateProfessional, deleteProfessional } from '../controllers/professionalController.js';
// @ts-ignore
import {
	createServiceSchema,
	updateServiceSchema,
	createProfessionalSchema,
	updateProfessionalSchema,
	updateBusinessSettingsSchema,
	updateBusinessProfileSchema,
	updateAccountProfileSchema,
	updateAccountPasswordSchema,
} from '../validators/schemas/index.js';
// @ts-ignore
import {
	getBusinessSettings,
	getBusinessProfile,
	updateBusinessProfile,
	updateBusinessSettings,
	getAccountProfile,
	updateAccountProfile,
	updateAccountPassword,
} from '../controllers/businessSettingsController.js';

const router = express.Router();

router.get('/services', authMiddleware, requireTenantRoles, requireFeature('services'), getServices);
router.post('/services', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: createServiceSchema }), createService);
router.put('/services/:id', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: updateServiceSchema }), updateService);
router.delete('/services/:id', authMiddleware, requireTenantRoles, requireFeature('services'), deleteService);

router.get('/professionals', authMiddleware, requireTenantRoles, requireFeature('services'), getProfessionals);
router.post('/professionals', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: createProfessionalSchema }), createProfessional);
router.put('/professionals/:id', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: updateProfessionalSchema }), updateProfessional);
router.delete('/professionals/:id', authMiddleware, requireTenantRoles, requireFeature('services'), deleteProfessional);

router.get('/settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), getBusinessSettings);
router.put('/settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), validate({ body: updateBusinessSettingsSchema }), updateBusinessSettings);
router.get('/crm-settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), getCrmSettings);
router.put('/crm-settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), putCrmSettings);

router.get('/profile', authMiddleware, requireTenantRoles, requireFeature('billing'), getBusinessProfile);
router.put('/profile', authMiddleware, requireTenantRoles, requireFeature('billing'), validate({ body: updateBusinessProfileSchema }), updateBusinessProfile);
router.get('/account-profile', authMiddleware, requireRole(['tenant_admin']), getAccountProfile);
router.put('/account-profile', authMiddleware, requireRole(['tenant_admin']), validate({ body: updateAccountProfileSchema }), updateAccountProfile);
router.put('/account-password', authMiddleware, requireRole(['tenant_admin']), requireFeature('advanced_admin'), validate({ body: updateAccountPasswordSchema }), updateAccountPassword);

export default router;
