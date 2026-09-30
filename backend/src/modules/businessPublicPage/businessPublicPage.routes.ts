import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { UpdatePublicPageSchema } from './businessPublicPage.types.js';
import { getPublicPageSettings, updatePublicPageSettings } from './businessPublicPage.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles];

router.get('/', ...guard, getPublicPageSettings);
router.put('/', ...guard, validate({ body: UpdatePublicPageSchema }), updatePublicPageSettings);

export default router;
