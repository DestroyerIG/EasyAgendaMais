import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { CobrarSchema, SaveComandaSchema } from './comandas.types.js';
import { CommissionSettingsSchema } from './commissionSettings.js';
import { comandaDeHojeNaCarencia } from '../conta/somenteHoje.middleware.js';
import {
  getComanda, saveComanda, closeComanda, comandaPix, cobrancaDaComanda, cobrarComanda, cancelarCobrancaDaComanda, resendReceipt, getShortcuts,
  getCommissionSettings, updateCommissionSettings,
} from './comandas.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('finance')];

// Rotas fixas antes de "/:id"
router.get('/settings', ...guard, getCommissionSettings);
router.put('/settings', ...guard, validate({ body: CommissionSettingsSchema }), updateCommissionSettings);
router.get('/shortcuts', ...guard, getShortcuts);
router.get('/:id', ...guard, getComanda);
router.put('/:id', ...guard, comandaDeHojeNaCarencia, validate({ body: SaveComandaSchema }), saveComanda);
router.post('/:id/close', ...guard, comandaDeHojeNaCarencia, validate({ body: SaveComandaSchema }), closeComanda);
router.get('/:id/cobranca', ...guard, cobrancaDaComanda);
router.post('/:id/cobranca', ...guard, comandaDeHojeNaCarencia, validate({ body: CobrarSchema }), cobrarComanda);
router.post('/:id/cobranca/cancelar', ...guard, comandaDeHojeNaCarencia, cancelarCobrancaDaComanda);
router.post('/:id/pix', ...guard, comandaDeHojeNaCarencia, validate({ body: SaveComandaSchema }), comandaPix);
router.post('/:id/receipt', ...guard, comandaDeHojeNaCarencia, resendReceipt);

export default router;
