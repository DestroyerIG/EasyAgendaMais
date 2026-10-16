import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { listPhotos, uploadPhoto, deletePhoto } from './clientPhotos.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('clients')];

router.get('/:id/photos', ...guard, listPhotos);
router.post('/:id/photos', ...guard, uploadPhoto);
router.delete('/:id/photos/:photoId', ...guard, deletePhoto);

export default router;
