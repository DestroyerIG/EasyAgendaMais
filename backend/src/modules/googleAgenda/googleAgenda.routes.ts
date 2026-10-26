import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { CallbackQuerySchema, ConectarQuerySchema, ConfirmarSchema, DefinirProfissionalSchema, OcupadoQuerySchema } from './googleAgenda.types.js';
import { callback, conectar, confirmar, definirProfissional, desconectar, ocupado, verConexao } from './googleAgenda.controller.js';

// Google Agenda (fase 7). A dona conecta em qualquer plano; a profissional, pelo app (Equipe e Salão).
const router = express.Router();
const logado = [authMiddleware, requireRole(['tenant_admin', 'employee', 'professional'])];
const conecta = [authMiddleware, requireRole(['tenant_admin', 'professional'])];
const dona = [authMiddleware, requireRole(['tenant_admin'])];
const painel = [authMiddleware, requireRole(['tenant_admin', 'employee'])];

const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

router.get('/conexao', ...logado, verConexao);
router.get('/conectar', ...conecta, validate({ query: ConectarQuerySchema }), conectar);
router.post('/confirmar', ...conecta, validate({ body: ConfirmarSchema }), confirmar);
router.get('/ocupado', ...painel, validate({ query: OcupadoQuerySchema }), ocupado);
router.put('/conexao', ...dona, validate({ body: DefinirProfissionalSchema }), definirProfissional);
router.delete('/conexao', ...conecta, desconectar);
// Público: o Google volta para cá; quem é a pessoa vem do state assinado.
router.get('/callback', callbackLimiter, validate({ query: CallbackQuerySchema }), callback);

export default router;
