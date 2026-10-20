import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { retornoService } from './retorno.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// `validate` já normalizou query e body nas rotas.
export const listarRetorno: H = async (req, res, next) => {
  try {
    const { incluirLink, ...filtros } = req.query as unknown as { incluirLink: boolean; professionalId?: string; somenteComEncaixe?: boolean };
    sendSuccess(res, await retornoService.listar(req.user.businessId!, filtros, new Date(), incluirLink));
  } catch (e) { next(e); }
};
export const enviarRetorno: H = async (req, res, next) => {
  try { sendSuccess(res, await retornoService.enviar(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const testarRetorno: H = async (req, res, next) => {
  try { sendSuccess(res, await retornoService.testar(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
