import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  CallbackQuerySchema, ChaveSchema, ConectarQuerySchema, ConfirmarSchema, DefinirTerminalSchema, FormasSchema, GatewayOAuthParamSchema,
  GatewayParamSchema, TerminalParamSchema,
} from './recebimentos.types.js';
import {
  ativarPdvDaMaquininha, callback, conectar, conectarChave, confirmar, definirFormas, definirMaquininhaPadrao, desconectar,
  listarMaquininhas, verConexao, webhookInfinitePay, webhookMercadoPago,
} from './recebimentos.controller.js';

// Recebimentos automáticos do sinal (Mercado Pago). Só quem administra o negócio mexe.
const router = express.Router();
const dono = [authMiddleware, requireRole(['tenant_admin'])];
const gateway = validate({ params: GatewayParamSchema });
const gatewayOAuth = validate({ params: GatewayOAuthParamSchema });

const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

// Excedeu: responde 200 para o gateway não insistir, e a rotina de cada minuto cobre o que foi descartado.
// Um limite por gateway: os avisos de um não gastam o do outro.
const limiteDeWebhook = () => rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  handler: (_req, res) => { res.sendStatus(200); },
});

// Público: o aviso não prova nada; o pagamento é conferido no gateway com o token do negócio.
router.post('/webhook/mercadopago', limiteDeWebhook(), webhookMercadoPago);
router.post('/webhook/infinitepay/:cobrancaId', limiteDeWebhook(), webhookInfinitePay);
router.get('/conexoes', ...dono, verConexao);
// Maquininhas Point da conta do Mercado Pago (antes das rotas `/:gateway/...`).
router.get('/maquininhas', ...dono, listarMaquininhas);
router.put('/maquininhas/padrao', ...dono, validate({ body: DefinirTerminalSchema }), definirMaquininhaPadrao);
router.post('/maquininhas/:id/pdv', ...dono, validate({ params: TerminalParamSchema }), ativarPdvDaMaquininha);
// Público: o Mercado Pago volta para cá; quem é a pessoa vem do estado assinado.
router.get('/:gateway/callback', callbackLimiter, gatewayOAuth, validate({ query: CallbackQuerySchema }), callback);
router.get('/:gateway/conectar', ...dono, gatewayOAuth, validate({ query: ConectarQuerySchema }), conectar);
router.post('/:gateway/confirmar', ...dono, gatewayOAuth, validate({ body: ConfirmarSchema }), confirmar);
router.post('/infinitepay/chave', ...dono, validate({ body: ChaveSchema }), conectarChave);
router.put('/:gateway/formas', ...dono, gateway, validate({ body: FormasSchema }), definirFormas);
router.delete('/:gateway/conexao', ...dono, gateway, desconectar);

export default router;
