import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { CreateProductSchema, UpdateProductSchema } from './products.types.js';
import { listProducts, createProduct, updateProduct, deleteProduct } from './products.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('services')];

router.get('/', ...guard, listProducts);
router.post('/', ...guard, validate({ body: CreateProductSchema }), createProduct);
router.put('/:id', ...guard, validate({ body: UpdateProductSchema }), updateProduct);
router.delete('/:id', ...guard, deleteProduct);

export default router;
