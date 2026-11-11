import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { CatalogoQuerySchema, HorariosSchema, NegocioSchema, RecebimentosSchema, ServicosSchema } from './onboarding.types.js';
import { catalog, dismissFirstSteps, finish, finishTour, firstSteps, saveBusiness, saveHours, saveReceipts, saveServices, show } from './onboarding.controller.js';

// Onboarding guiado (fase 6): só a dona. Sem requireFeature: vale em qualquer plano e no teste grátis.
const router = express.Router();
const dona = [authMiddleware, requireRole(['tenant_admin'])];

router.get('/', ...dona, show);
router.get('/catalogo', ...dona, validate({ query: CatalogoQuerySchema }), catalog);
router.put('/negocio', ...dona, validate({ body: NegocioSchema }), saveBusiness);
router.put('/horarios', ...dona, validate({ body: HorariosSchema }), saveHours);
router.put('/servicos', ...dona, validate({ body: ServicosSchema }), saveServices);
router.put('/recebimentos', ...dona, validate({ body: RecebimentosSchema }), saveReceipts);
router.post('/concluir', ...dona, finish);
router.get('/primeiros-passos', ...dona, firstSteps);
router.post('/primeiros-passos/dispensar', ...dona, dismissFirstSteps);
router.post('/tour/concluir', ...dona, finishTour);

export default router;
