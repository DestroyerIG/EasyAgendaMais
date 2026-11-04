import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { depoimentosService } from './depoimentos.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const meu: H = async (req, res, next) => {
  try { sendSuccess(res, await depoimentosService.estado(req.user)); } catch (e) { next(e); }
};
export const enviar: H = async (req, res, next) => {
  try { sendSuccess(res, await depoimentosService.enviar(req.user, req.body)); } catch (e) { next(e); }
};
export const adiar: H = async (req, res, next) => {
  try { sendSuccess(res, await depoimentosService.adiar(req.user)); } catch (e) { next(e); }
};
export const dispensar: H = async (req, res, next) => {
  try { sendSuccess(res, await depoimentosService.dispensar(req.user)); } catch (e) { next(e); }
};
export const retirar: H = async (req, res, next) => {
  try { sendSuccess(res, await depoimentosService.retirar(req.user)); } catch (e) { next(e); }
};
export const publicos: H = async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    sendSuccess(res, await depoimentosService.publicos());
  } catch (e) { next(e); }
};
