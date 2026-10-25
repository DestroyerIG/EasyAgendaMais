import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole, requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { ConfirmarCobrancaSchema, EditarOfertaSchema, ListaContratosQuerySchema, OfertaSchema, VincularSchema } from './clube.types.js';
import {
  cancelContract, clientContracts, confirmCharge, createOffer, exportContractsCsv, linkClient, listContracts,
  listOffers, resendCharge, updateOffer,
} from './clube.controller.js';

const router = express.Router();
const equipe = [authMiddleware, requireTenantRoles, requireFeature('clube')];
const dona = [...equipe, requireRole(['tenant_admin'])];
const ParamsId = validate({ params: z.object({ id: z.string().uuid() }) });

router.get('/ofertas', ...equipe, listOffers);
router.post('/ofertas', ...dona, validate({ body: OfertaSchema }), createOffer);
router.put('/ofertas/:id', ...dona, ParamsId, validate({ body: EditarOfertaSchema }), updateOffer);
router.get('/contratos', ...equipe, validate({ query: ListaContratosQuerySchema }), listContracts);
router.get('/contratos/export.csv', ...equipe, exportContractsCsv);
router.post('/contratos', ...equipe, validate({ body: VincularSchema }), linkClient);
router.post('/contratos/:id/cancelar', ...dona, ParamsId, cancelContract);
router.post('/cobrancas/:id/confirmar', ...equipe, ParamsId, validate({ body: ConfirmarCobrancaSchema }), confirmCharge);
router.post('/cobrancas/:id/reenviar', ...equipe, ParamsId, resendCharge);
// Contratos que já existem seguem visíveis na ficha mesmo se o plano cair (a cliente já pagou).
router.get('/clientes/:clientId', authMiddleware, requireTenantRoles,
  validate({ params: z.object({ clientId: z.string().uuid() }) }), clientContracts);

export default router;
