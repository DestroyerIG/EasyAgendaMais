import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { conexaoService } from './conexao.service.js';
import type { GatewayId, UsuarioLogado } from './recebimentos.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const usuario = (req: Request): UsuarioLogado => ({
  userId: req.user.userId, businessId: req.user.businessId!, role: req.user.role,
});
const gatewayDe = (req: Request) => req.params['gateway'] as GatewayId;

export const verConexao: H = async (req, res, next) => {
  try { sendSuccess(res, await conexaoService.verConexao(usuario(req))); } catch (e) { next(e); }
};
export const conectar: H = async (req, res, next) => {
  try { sendSuccess(res, conexaoService.conectarUrl(usuario(req), gatewayDe(req))); } catch (e) { next(e); }
};
export const callback: H = async (req, res, next) => {
  try {
    res.redirect(302, await conexaoService.callback(
      gatewayDe(req), req.query['code'] as string | undefined, req.query['state'] as string | undefined,
    ));
  } catch (e) { next(e); }
};
export const confirmar: H = async (req, res, next) => {
  try { sendSuccess(res, await conexaoService.confirmar(usuario(req), gatewayDe(req), req.body.t)); } catch (e) { next(e); }
};
export const definirFormas: H = async (req, res, next) => {
  try { sendSuccess(res, await conexaoService.definirFormas(usuario(req), gatewayDe(req), req.body)); } catch (e) { next(e); }
};
export const desconectar: H = async (req, res, next) => {
  try { sendSuccess(res, await conexaoService.desconectar(usuario(req), gatewayDe(req))); } catch (e) { next(e); }
};
