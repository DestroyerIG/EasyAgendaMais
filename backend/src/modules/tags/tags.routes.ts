import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { CreateTagSchema, UpdateTagSchema } from './tags.types.js';
import { listTags, createTag, updateTag, deleteTag } from './tags.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('clients')];

router.get('/', ...guard, listTags);
router.post('/', ...guard, validate({ body: CreateTagSchema }), createTag);
router.put('/:id', ...guard, validate({ body: UpdateTagSchema }), updateTag);
router.delete('/:id', ...guard, deleteTag);

export default router;
