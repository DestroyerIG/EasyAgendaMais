import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { NotFoundError } from '../../utils/errors.js';
import { pushService } from './push.service.js';

// Inscrição do aparelho no push: vale para o painel (dona e recepção) e para o app da profissional.
const router = express.Router();
const logado = [authMiddleware, requireRole(['tenant_admin', 'employee', 'professional'])];

const InscricaoSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});
const RemoverSchema = z.object({ endpoint: z.string().url().max(2000) });

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const chave: H = async (_req, res, next) => {
  try {
    const publica = pushService.chavePublica();
    if (!publica) throw new NotFoundError('Push');
    sendSuccess(res, { chavePublica: publica });
  } catch (e) { next(e); }
};
const inscrever: H = async (req, res, next) => {
  try {
    await pushService.inscrever(req.user.userId, req.body, req.get('user-agent') ?? null);
    sendSuccess(res, { inscrito: true }, 201);
  } catch (e) { next(e); }
};
const remover: H = async (req, res, next) => {
  try {
    await pushService.remover(req.user.userId, req.body.endpoint);
    sendSuccess(res, { inscrito: false });
  } catch (e) { next(e); }
};

router.get('/chave', ...logado, chave);
router.post('/inscricoes', ...logado, validate({ body: InscricaoSchema }), inscrever);
router.delete('/inscricoes', ...logado, validate({ body: RemoverSchema }), remover);

export default router;
