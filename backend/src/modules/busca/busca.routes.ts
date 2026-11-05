import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { BuscaQuerySchema } from './busca.types.js';
import { buscar } from './busca.controller.js';

const router = express.Router();

// Limite próprio por negócio: a busca dispara um pedido a cada pausa na digitação e fica fora do
// limite global (server.ts). Vem depois do login para a chave ser o negócio.
export const buscaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const businessId = (req as express.Request & { user?: { businessId?: string } }).user?.businessId;
    return businessId ? `tenant:${businessId}` : ipKeyGenerator(req.ip ?? 'unknown');
  },
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em alguns minutos.' } },
});

// POST para o termo (nome, telefone, e-mail) não ir na URL nem em logs de acesso.
router.post('/', authMiddleware, requireTenantRoles, buscaLimiter, requireFeature('clients'), validate({ body: BuscaQuerySchema }), buscar);

export default router;
