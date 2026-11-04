import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { EnvioSchema } from './depoimentos.types.js';
import { adiar, dispensar, enviar, meu, retirar } from './depoimentos.controller.js';

// Depoimentos reais: só a dona avalia o EasyAgenda+.
const router = express.Router();
const dona = [authMiddleware, requireRole(['tenant_admin'])];

router.get('/meu', ...dona, meu);
router.post('/', ...dona, validate({ body: EnvioSchema }), enviar);
router.post('/adiar', ...dona, adiar);
router.post('/dispensar', ...dona, dispensar);
router.post('/retirar', ...dona, retirar);

export default router;
