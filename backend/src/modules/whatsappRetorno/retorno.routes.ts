import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { ListarRetornoQuery, EnviarRetornoSchema, TestarRetornoSchema } from './retorno.types.js';
import { listarRetorno, enviarRetorno, testarRetorno } from './retorno.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

router.get('/', ...guard, validate({ query: ListarRetornoQuery }), listarRetorno);
router.post('/enviar', ...guard, validate({ body: EnviarRetornoSchema }), enviarRetorno);
router.post('/testar', ...guard, validate({ body: TestarRetornoSchema }), testarRetorno);

export default router;
