import express from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { AceitarConviteSchema, ConfiguracaoSchema, ConvidarSchema } from './equipe.types.js';
import {
  acceptInvite, getSettings, invite, listAccess, removeAccess, restoreAccess, revokeInvite, saveSettings, showInvite,
} from './equipe.controller.js';

// Painel: só a dona convida e tira o acesso.
const router = express.Router();
const dona = [authMiddleware, requireRole(['tenant_admin']), requireFeature('app_profissional')];
const ParamsId = validate({ params: z.object({ id: z.string().uuid() }) });

router.get('/acessos', ...dona, listAccess);
router.get('/configuracao', ...dona, getSettings);
router.put('/configuracao', ...dona, validate({ body: ConfiguracaoSchema }), saveSettings);
router.post('/profissionais/:id/convite', ...dona, ParamsId, validate({ body: ConvidarSchema }), invite);
router.delete('/profissionais/:id/convite', ...dona, ParamsId, revokeInvite);
router.post('/profissionais/:id/acesso/remover', ...dona, ParamsId, removeAccess);
router.post('/profissionais/:id/acesso/reativar', ...dona, ParamsId, restoreAccess);

export default router;

// Público: a página /convite/[token].
export const conviteRoutes = express.Router();
const conviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: { success: false, error: { code: 'RATE_LIMIT_CONVITE', message: 'Muitas tentativas. Tente novamente em alguns minutos.' } },
});
const ParamsToken = validate({ params: z.object({ token: z.string().min(20).max(100) }) });

conviteRoutes.get('/:token', conviteLimiter, ParamsToken, showInvite);
conviteRoutes.post('/:token/aceitar', conviteLimiter, ParamsToken, validate({ body: AceitarConviteSchema }), acceptInvite);
