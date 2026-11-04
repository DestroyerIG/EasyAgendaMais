import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireAdmin } from '../middleware/rbac.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import {
  getAdminMetrics,
  getAdminTenants,
  exportAdminTenants,
  getAdminTenantDetails,
  getAdminTenantAudit,
  exportAdminTenantAudit,
  blockTenant,
  unblockTenant,
  softDeleteTenant,
  blockUser,
  unblockUser,
  getAdminSubscriptions,
  resyncSubscription,
  overridePlan,
  definirValorSalao,
  overrideStatus,
  estenderTeste,
  cancelSubscriptionAdmin,
  getAdminAuditLogs,
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminTenantFiltrosSchema,
  adminTenantAuditQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
} from '../controllers/adminController.js';
// @ts-ignore
import {
  adminOverridePlanBodySchema,
  adminValorSalaoBodySchema,
  adminOverrideStatusBodySchema,
  adminCancelSubscriptionBodySchema,
  adminExtendTrialBodySchema,
} from '../validators/schemas/index.js';
// @ts-ignore
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '../controllers/couponController.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get('/metrics', validate({ query: adminMetricsQuerySchema }), getAdminMetrics);

router.get('/tenants', validate({ query: adminTenantListQuerySchema }), getAdminTenants);
// Antes de /tenants/:id, senão "export.csv" seria lido como id.
router.get('/tenants/export.csv', validate({ query: adminTenantFiltrosSchema }), exportAdminTenants);
router.get('/tenants/:id', validate({ params: adminActionParamsSchema }), getAdminTenantDetails);
router.get('/tenants/:id/auditoria', validate({ params: adminActionParamsSchema, query: adminTenantAuditQuerySchema }), getAdminTenantAudit);
router.get('/tenants/:id/auditoria.csv', validate({ params: adminActionParamsSchema, query: adminTenantAuditQuerySchema }), exportAdminTenantAudit);
router.patch('/tenants/:id/block', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), blockTenant);
router.patch('/tenants/:id/unblock', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), unblockTenant);
router.patch('/tenants/:id/trial', validate({ params: adminActionParamsSchema, body: adminExtendTrialBodySchema }), estenderTeste);
router.delete('/tenants/:id', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), softDeleteTenant);

router.patch('/users/:id/block', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), blockUser);
router.patch('/users/:id/unblock', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), unblockUser);

router.get('/subscriptions', validate({ query: adminSubscriptionListQuerySchema }), getAdminSubscriptions);
router.post('/subscriptions/:id/resync', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), resyncSubscription);
router.patch('/subscriptions/:id/plan', validate({ params: adminActionParamsSchema, body: adminOverridePlanBodySchema }), overridePlan);
router.patch('/subscriptions/:id/valor-salao', validate({ params: adminActionParamsSchema, body: adminValorSalaoBodySchema }), definirValorSalao);
router.patch('/subscriptions/:id/status', validate({ params: adminActionParamsSchema, body: adminOverrideStatusBodySchema }), overrideStatus);
router.post('/subscriptions/:id/cancel', validate({ params: adminActionParamsSchema, body: adminCancelSubscriptionBodySchema }), cancelSubscriptionAdmin);

router.get('/logs', validate({ query: adminAuditLogQuerySchema }), getAdminAuditLogs);

router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.patch('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

export default router;
