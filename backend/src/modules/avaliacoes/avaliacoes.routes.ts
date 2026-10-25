import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { avaliacoesService, AvaliarSchema } from './avaliacoes.service.js';

// Público: a página /avaliar/[token] do comprovante.
const router = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: { success: false, error: { code: 'RATE_LIMIT_AVALIACAO', message: 'Muitas tentativas. Tente novamente em alguns minutos.' } },
});
const ParamsToken = validate({ params: z.object({ token: z.string().min(20).max(100) }) });

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const token = (req: Request) => req.params['token'] as string;

const ver: H = async (req, res, next) => {
  try { sendSuccess(res, await avaliacoesService.ver(token(req))); } catch (e) { next(e); }
};
const avaliar: H = async (req, res, next) => {
  try { sendSuccess(res, await avaliacoesService.avaliar(token(req), req.body), 201); } catch (e) { next(e); }
};

router.get('/:token', limiter, ParamsToken, ver);
router.post('/:token', limiter, ParamsToken, validate({ body: AvaliarSchema }), avaliar);

export default router;
