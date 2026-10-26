import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { googleAgendaService } from './googleAgenda.service.js';
import type { UsuarioLogado } from './googleAgenda.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const usuario = (req: Request): UsuarioLogado => ({
  userId: req.user.userId, businessId: req.user.businessId!, role: req.user.role, plan: req.user.plan as string,
});

export const conectar: H = async (req, res, next) => {
  try { sendSuccess(res, googleAgendaService.conectarUrl(usuario(req), req.query['para'] as 'negocio' | 'profissional')); } catch (e) { next(e); }
};
export const callback: H = async (req, res, next) => {
  try {
    res.redirect(302, await googleAgendaService.callback(req.query['code'] as string | undefined, req.query['state'] as string | undefined));
  } catch (e) { next(e); }
};
export const verConexao: H = async (req, res, next) => {
  try { sendSuccess(res, await googleAgendaService.minhaConexao(usuario(req))); } catch (e) { next(e); }
};
export const definirProfissional: H = async (req, res, next) => {
  try { sendSuccess(res, await googleAgendaService.definirProfissional(usuario(req), req.body.professionalId)); } catch (e) { next(e); }
};
export const desconectar: H = async (req, res, next) => {
  try { sendSuccess(res, await googleAgendaService.desconectar(usuario(req))); } catch (e) { next(e); }
};
