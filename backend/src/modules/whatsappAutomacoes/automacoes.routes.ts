import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { REGRAS } from './automacoes.types.js';
import { listarAutomacoes, atualizarAutomacao, testarAutomacao } from './automacoes.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

const ParamsRegra = z.object({ regra: z.enum(REGRAS as [string, ...string[]]) });
const AtualizarSchema = z.object({
  ativa: z.boolean().optional(),
  texto: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

router.get('/', ...guard, listarAutomacoes);
router.patch('/:regra', ...guard, validate({ params: ParamsRegra, body: AtualizarSchema }), atualizarAutomacao);
router.post('/:regra/testar', ...guard, validate({ params: ParamsRegra }), testarAutomacao);

export default router;
