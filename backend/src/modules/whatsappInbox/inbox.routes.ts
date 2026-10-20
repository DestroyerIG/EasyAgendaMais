import express from 'express';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import {
  listarConversas, detalheConversa, mensagensConversa, enviarMensagem, assumirConversa, devolverConversa, marcarLidas,
  respostasRapidasConversa, resumoDaConexao,
} from './inbox.controller.js';

const router = express.Router();
const guard = [authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')];

router.get('/conversations', ...guard, listarConversas);
// Antes das rotas com :id, senão "lidas" seria lido como id.
router.post('/conversations/lidas', ...guard, marcarLidas);
router.get('/conversations/:id', ...guard, detalheConversa);
router.get('/conversations/:id/messages', ...guard, mensagensConversa);
router.post('/conversations/:id/messages', ...guard, enviarMensagem);
router.get('/conversations/:id/respostas-rapidas', ...guard, respostasRapidasConversa);
router.get('/connection/summary', ...guard, resumoDaConexao);
router.post('/conversations/:id/assumir', ...guard, assumirConversa);
router.post('/conversations/:id/devolver', ...guard, devolverConversa);

export default router;
