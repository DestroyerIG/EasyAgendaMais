import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { UpdatePublicPageSchema, UploadImageSchema } from './businessPublicPage.types.js';
import {
  getPublicPageSettings,
  updatePublicPageSettings,
  checkSlugAvailability,
  uploadPublicPageImage,
} from './businessPublicPage.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles];

router.get('/', ...guard, getPublicPageSettings);
router.get('/slug-availability', ...guard, checkSlugAvailability);
router.put('/', ...guard, validate({ body: UpdatePublicPageSchema }), updatePublicPageSettings);
router.post('/upload-image', ...guard, validate({ body: UploadImageSchema }), uploadPublicPageImage);

export default router;
