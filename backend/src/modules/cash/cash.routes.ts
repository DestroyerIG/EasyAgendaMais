import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { OpenCashSchema, CashMovementSchema, CloseCashSchema, CashDayQuerySchema } from './cash.types.js';
import { getCashDay, openCash, addCashMovement, closeCash, reopenCash } from './cash.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('finance')];

router.get('/today', ...guard, validate({ query: CashDayQuerySchema }), getCashDay);
router.post('/open', ...guard, validate({ body: OpenCashSchema }), openCash);
router.post('/movements', ...guard, validate({ body: CashMovementSchema }), addCashMovement);
router.post('/close', ...guard, validate({ body: CloseCashSchema }), closeCash);
router.post('/reopen', ...guard, reopenCash);

export default router;
