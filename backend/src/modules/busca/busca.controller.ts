import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { buscaService } from './busca.service.js';
import { BuscaQuerySchema } from './busca.types.js';

export const buscar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.set('Cache-Control', 'no-store');
    const { q } = BuscaQuerySchema.parse(req.body);
    sendSuccess(res, await buscaService.buscar(req.user.businessId!, q));
  } catch (e) { next(e); }
};
