import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole, requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { AdiantamentoSchema, AdiantamentosQuerySchema, ModeloRepasseSchema, PagarRepasseSchema, PeriodoOpcionalQuerySchema } from './reports.types.js';
import {
  createAdvance, deleteAdvance, exportCommissionsCsv, getCommissions, getEvolution, getOccupancy, getOverview,
  getRatings, listAdvances, payCommission, savePayoutModel, undoCommissionPayment,
} from './reports.controller.js';

const router = express.Router();
const leitura = [authMiddleware, requireTenantRoles, requireFeature('reports')];
const dona = [...leitura, requireRole(['tenant_admin'])];
const ParamsId = z.object({ id: z.string().uuid() });
const periodo = validate({ query: PeriodoOpcionalQuerySchema });

router.get('/overview', ...leitura, periodo, getOverview);
router.get('/occupancy', ...leitura, periodo, getOccupancy);
router.get('/evolution', ...leitura, getEvolution);
router.get('/avaliacoes', ...leitura, periodo, getRatings);
router.get('/commissions', ...leitura, periodo, getCommissions);
router.get('/commissions/export.csv', ...leitura, periodo, exportCommissionsCsv);
router.post('/commissions/payouts', ...dona, validate({ body: PagarRepasseSchema }), payCommission);
router.delete('/commissions/payouts/:id', ...dona, validate({ params: ParamsId }), undoCommissionPayment);
router.get('/advances', ...leitura, validate({ query: AdiantamentosQuerySchema }), listAdvances);
router.post('/advances', ...dona, validate({ body: AdiantamentoSchema }), createAdvance);
router.delete('/advances/:id', ...dona, validate({ params: ParamsId }), deleteAdvance);
router.put('/settings/payout-model', ...dona, validate({ body: ModeloRepasseSchema }), savePayoutModel);

export default router;
