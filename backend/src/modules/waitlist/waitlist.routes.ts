import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { IdParamSchema, CreateWaitlistSchema, UpdateWaitlistSchema, OfferSchema, BookedSchema, ListQuerySchema } from './waitlist.types.js';
import { listWaitlist, createWaitlist, updateWaitlist, offerWaitlist, bookedWaitlist } from './waitlist.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('appointments')];
const params = validate({ params: IdParamSchema });

router.get('/', ...guard, validate({ query: ListQuerySchema }), listWaitlist);
router.post('/', ...guard, validate({ body: CreateWaitlistSchema }), createWaitlist);
router.put('/:id', ...guard, params, validate({ body: UpdateWaitlistSchema }), updateWaitlist);
router.post('/:id/offer', ...guard, params, validate({ body: OfferSchema }), offerWaitlist);
router.post('/:id/booked', ...guard, params, validate({ body: BookedSchema }), bookedWaitlist);

export default router;
