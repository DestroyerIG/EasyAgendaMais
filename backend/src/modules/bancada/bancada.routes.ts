import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requireProfissional } from './bancada.middleware.js';
import { BancadaComandaSchema, CancelarSchema, HorariosQuerySchema, NotaSchema, ReagendarSchema } from './bancada.types.js';
import {
  cancel, clientCard, closeComanda, freeSlots, getComanda, numbers, ratings, reschedule, saveComanda, saveNote,
  sendToFrontDesk, start, today, uploadPhoto,
} from './bancada.controller.js';

// App da profissional: só o papel `professional`, sempre com a profissional do login.
const router = express.Router();
const ela = [authMiddleware, requireProfissional];
const ParamsId = validate({ params: z.object({ id: z.string().uuid() }) });

router.get('/hoje', ...ela, today);
router.get('/clientes/:id', ...ela, ParamsId, clientCard);
router.put('/clientes/:id/nota', ...ela, ParamsId, validate({ body: NotaSchema }), saveNote);
router.post('/clientes/:id/fotos', ...ela, ParamsId, uploadPhoto);
router.post('/agendamentos/:id/iniciar', ...ela, ParamsId, start);
router.get('/horarios', ...ela, validate({ query: HorariosQuerySchema }), freeSlots);
router.post('/agendamentos/:id/reagendar', ...ela, ParamsId, validate({ body: ReagendarSchema }), reschedule);
router.post('/agendamentos/:id/cancelar', ...ela, ParamsId, validate({ body: CancelarSchema }), cancel);
router.get('/comandas/:id', ...ela, ParamsId, getComanda);
router.put('/comandas/:id', ...ela, ParamsId, validate({ body: BancadaComandaSchema }), saveComanda);
router.post('/comandas/:id/enviar', ...ela, ParamsId, validate({ body: BancadaComandaSchema }), sendToFrontDesk);
router.post('/comandas/:id/fechar', ...ela, ParamsId, validate({ body: BancadaComandaSchema }), closeComanda);
router.get('/numeros', ...ela, numbers);
router.get('/avaliacoes', ...ela, ratings);

export default router;
