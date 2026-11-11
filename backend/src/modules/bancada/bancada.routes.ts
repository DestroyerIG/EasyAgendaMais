import express from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requireProfissional } from './bancada.middleware.js';
import { comandaDeHojeNaCarencia, somenteHojeNaCarencia } from '../conta/somenteHoje.middleware.js';
import {
  BancadaCobrarSchema, BancadaComandaSchema, BuscaClienteQuerySchema, CancelarSchema, ClientesQuerySchema, HojeQuerySchema, HorariosNovoQuerySchema,
  HorariosQuerySchema, NotaSchema, NovoAgendamentoSchema, NovoClienteSchema, ReagendarSchema,
} from './bancada.types.js';
import {
  cancel, clientCard, closeComanda, comandaCancelarCobranca, comandaCobranca, comandaCobrar, comandaPix, createAppointment, createClient, freeSlots,
  getComanda, myClients, newSlots, numbers, ratings, reschedule, saveComanda, saveNote, searchClients, sendToFrontDesk, servicesList,
  shortcuts, start, today, uploadPhoto,
} from './bancada.controller.js';

// App da profissional: só o papel `professional`, sempre com a profissional do login.
const router = express.Router();
const ela = [authMiddleware, requireProfissional];
const ParamsId = validate({ params: z.object({ id: z.string().uuid() }) });

router.get('/hoje', ...ela, validate({ query: HojeQuerySchema }), today);
router.get('/clientes', ...ela, validate({ query: ClientesQuerySchema }), myClients);
router.post('/clientes', ...ela, validate({ body: NovoClienteSchema }), createClient);
router.get('/clientes/buscar', ...ela, validate({ query: BuscaClienteQuerySchema }), searchClients);
router.get('/clientes/:id', ...ela, ParamsId, clientCard);
router.put('/clientes/:id/nota', ...ela, ParamsId, validate({ body: NotaSchema }), saveNote);
router.post('/clientes/:id/fotos', ...ela, ParamsId, uploadPhoto);
router.post('/agendamentos/:id/iniciar', ...ela, ParamsId, somenteHojeNaCarencia, start);
router.get('/servicos', ...ela, servicesList);
router.get('/horarios-novo', ...ela, validate({ query: HorariosNovoQuerySchema }), newSlots);
router.post('/agendamentos', ...ela, validate({ body: NovoAgendamentoSchema }), createAppointment);
router.get('/horarios',...ela, validate({ query: HorariosQuerySchema }), freeSlots);
router.post('/agendamentos/:id/reagendar', ...ela, ParamsId, validate({ body: ReagendarSchema }), reschedule);
router.post('/agendamentos/:id/cancelar', ...ela, ParamsId, validate({ body: CancelarSchema }), cancel);
router.get('/atalhos', ...ela, shortcuts);
router.get('/comandas/:id', ...ela, ParamsId, getComanda);
router.put('/comandas/:id', ...ela, ParamsId, comandaDeHojeNaCarencia, validate({ body: BancadaComandaSchema }), saveComanda);
router.post('/comandas/:id/enviar', ...ela, ParamsId, comandaDeHojeNaCarencia, validate({ body: BancadaComandaSchema }), sendToFrontDesk);
router.post('/comandas/:id/pix', ...ela, ParamsId, comandaDeHojeNaCarencia, validate({ body: BancadaComandaSchema }), comandaPix);
router.get('/comandas/:id/cobranca', ...ela, ParamsId, comandaCobranca);
router.post('/comandas/:id/cobranca', ...ela, ParamsId, comandaDeHojeNaCarencia, validate({ body: BancadaCobrarSchema }), comandaCobrar);
router.post('/comandas/:id/cobranca/cancelar', ...ela, ParamsId, comandaDeHojeNaCarencia, comandaCancelarCobranca);
router.post('/comandas/:id/fechar', ...ela, ParamsId, comandaDeHojeNaCarencia, validate({ body: BancadaComandaSchema }), closeComanda);
router.get('/numeros', ...ela, numbers);
router.get('/avaliacoes', ...ela, ratings);

export default router;
