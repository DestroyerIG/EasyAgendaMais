import express from 'express';
import { validate } from '../../middleware/validate.js';
import { CorrigirSchema, IdParamsSchema, ListaAdminQuerySchema } from './depoimentos.types.js';
import { corrigir, listar, publicar, recusar } from './depoimentos.admin.controller.js';

// Montado em /admin/depoimentos com authMiddleware + requireAdmin (ver server.ts).
const router = express.Router();

router.get('/', validate({ query: ListaAdminQuerySchema }), listar);
router.post('/:id/publicar', validate({ params: IdParamsSchema }), publicar);
router.post('/:id/recusar', validate({ params: IdParamsSchema }), recusar);
router.post('/:id/corrigir', validate({ params: IdParamsSchema, body: CorrigirSchema }), corrigir);

export default router;
