import express, { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole, requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { AppError, UnauthorizedError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import {
  CreateCheckoutSessionSchema,
  BillingActionBodySchema,
  PixPaymentParamsSchema,
  ValidateCouponBodySchema,
  ChangePlanBodySchema,
  InvoicesQuerySchema,
} from './billing.types.js';
import {
  createCheckoutSession,
  getBillingStatus,
  cancelBillingSubscription,
  reactivateBillingSubscription,
  getPixPaymentStatus,
  handleAsaasWebhook,
  validateCoupon,
  getPlans,
  previewPlanChange,
  changePlan,
  cancelPlanChange,
  getInvoices,
  getPaymentMethod,
} from './billing.controller.js';

const router = express.Router();

// ─── Asaas webhook — token validation com timing-safe compare ─────────────────

const ASAAS_TOKEN_HEADERS = [
  'asaas-access-token',
  'x-asaas-access-token',
  'x-webhook-token',
];

const asaasWebhookMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!expected) {
    // Sem token configurado o webhook ficaria aberto a qualquer chamador: em produção, falha fechado.
    if (process.env.NODE_ENV === 'production') {
      logger.error({ requestId: req.requestId }, 'Asaas webhook recusado: ASAAS_WEBHOOK_TOKEN não configurado');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
    return;
  }

  let token: string | null = null;
  for (const header of ASAAS_TOKEN_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string' && value.trim()) {
      token = value.trim();
      break;
    }
  }

  // Fallback: Authorization Bearer
  if (!token) {
    const auth = req.headers['authorization'];
    if (typeof auth === 'string') {
      const match = auth.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) token = match[1].trim();
    }
  }

  if (!token) {
    logger.warn({ requestId: req.requestId }, 'Asaas webhook: token ausente');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    const valid =
      tokenBuf.length === expectedBuf.length &&
      timingSafeEqual(tokenBuf, expectedBuf);

    if (!valid) {
      logger.warn({ requestId: req.requestId }, 'Asaas webhook: token inválido');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, 'Asaas webhook: erro ao validar token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};

router.post('/webhooks/asaas', asaasWebhookMiddleware, handleAsaasWebhook);
router.post('/webhook/asaas', asaasWebhookMiddleware, handleAsaasWebhook);

// ─── Rotas autenticadas ───────────────────────────────────────────────────────

router.post(
  '/validate-coupon',
  authMiddleware,
  validate({ body: ValidateCouponBodySchema }),
  validateCoupon
);

router.post(
  '/checkout/session',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: CreateCheckoutSessionSchema }),
  createCheckoutSession
);

router.get(
  '/status',
  authMiddleware,
  requireTenantRoles,
  requireFeature('subscription_status'),
  getBillingStatus
);

router.post(
  '/cancel',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: BillingActionBodySchema }),
  cancelBillingSubscription
);

router.post(
  '/reactivate',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: BillingActionBodySchema }),
  reactivateBillingSubscription
);

router.get(
  '/pix/:paymentId',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ params: PixPaymentParamsSchema }),
  getPixPaymentStatus
);

// ─── Plano e cobrança (2D) ────────────────────────────────────────────────────

// Catálogo público (a landing também usa).
router.get('/plans', getPlans);

const leitura = [authMiddleware, requireTenantRoles, requireFeature('subscription_status')];
// Trocar de plano é da dona da conta, não da equipe.
const acao = [authMiddleware, requireRole(['tenant_admin']), requireFeature('billing')];

router.get('/invoices', ...leitura, validate({ query: InvoicesQuerySchema }), getInvoices);
router.get('/payment-method', ...leitura, getPaymentMethod);
router.post('/change-plan/preview', ...acao, validate({ body: ChangePlanBodySchema }), previewPlanChange);
router.post('/change-plan', ...acao, validate({ body: ChangePlanBodySchema }), changePlan);
router.delete('/change-plan', ...acao, cancelPlanChange);

export default router;
