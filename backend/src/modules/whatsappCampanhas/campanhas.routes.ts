import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { PublicoSchema, SalvarCampanhaSchema } from './campanhas.types.js';
import {
  listarCampanhas, opcoesCampanha, publicoCampanha, criarCampanha, editarCampanha, detalhesCampanha, cancelarCampanha,
} from './campanhas.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const ParamsId = z.object({ id: z.string().uuid() });

router.get('/', ...guard, listarCampanhas);
// Antes das rotas com :id para não colidirem.
router.get('/opcoes', ...guard, opcoesCampanha);
router.post('/publico', ...guard, validate({ body: PublicoSchema }), publicoCampanha);
router.post('/', ...guard, validate({ body: SalvarCampanhaSchema }), criarCampanha);
router.get('/:id', ...guard, validate({ params: ParamsId }), detalhesCampanha);
router.put('/:id', ...guard, validate({ params: ParamsId, body: SalvarCampanhaSchema }), editarCampanha);
router.post('/:id/cancelar', ...guard, validate({ params: ParamsId }), cancelarCampanha);

export default router;
