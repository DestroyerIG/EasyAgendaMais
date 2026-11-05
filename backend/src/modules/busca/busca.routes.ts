import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { BuscaQuerySchema } from './busca.types.js';
import { buscar } from './busca.controller.js';

const router = express.Router();

// POST para o termo (nome, telefone, e-mail) não ir na URL nem em logs de acesso.
router.post('/', authMiddleware, requireTenantRoles, requireFeature('clients'), validate({ body: BuscaQuerySchema }), buscar);

export default router;
