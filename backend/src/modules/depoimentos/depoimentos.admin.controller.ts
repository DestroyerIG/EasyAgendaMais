import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { depoimentosAdminService as service } from './depoimentos.service.js';
import type { Aba } from './depoimentos.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const admin = (req: Request) => ({ userId: req.user.userId, businessId: req.user.businessId ?? null });

export const listar: H = async (req, res, next) => {
  try {
    const { itens, publicados } = await service.listar(req.query.aba as Aba);
    sendSuccess(res, itens, 200, { publicados });
  } catch (e) { next(e); }
};
export const publicar: H = async (req, res, next) => {
  try { await service.publicar(req.params.id as string, admin(req), req); sendSuccess(res, { ok: true }); } catch (e) { next(e); }
};
export const recusar: H = async (req, res, next) => {
  try { await service.recusar(req.params.id as string, admin(req), req); sendSuccess(res, { ok: true }); } catch (e) { next(e); }
};
export const corrigir: H = async (req, res, next) => {
  try {
    await service.corrigir(req.params.id as string, req.body.texto, admin(req), req);
    sendSuccess(res, { ok: true });
  } catch (e) { next(e); }
};
