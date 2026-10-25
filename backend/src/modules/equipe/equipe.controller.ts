import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { equipeService } from './equipe.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const negocio = (req: Request) => req.user.businessId!;
const id = (req: Request) => req.params['id'] as string;
const token = (req: Request) => req.params['token'] as string;

export const listAccess: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.acessos(negocio(req))); } catch (e) { next(e); }
};
export const invite: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.convidar(negocio(req), req.user.userId, id(req), req.body.email), 201); } catch (e) { next(e); }
};
export const revokeInvite: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.revogar(negocio(req), id(req))); } catch (e) { next(e); }
};
export const removeAccess: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.removerAcesso(negocio(req), id(req))); } catch (e) { next(e); }
};
export const restoreAccess: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.reativarAcesso(negocio(req), id(req))); } catch (e) { next(e); }
};
export const getSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.configuracao(negocio(req))); } catch (e) { next(e); }
};
export const saveSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.salvarConfiguracao(negocio(req), req.body.profissionalCobra)); } catch (e) { next(e); }
};
export const showInvite: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.verConvite(token(req))); } catch (e) { next(e); }
};
export const acceptInvite: H = async (req, res, next) => {
  try { sendSuccess(res, await equipeService.aceitar(res, token(req), req.body.senha)); } catch (e) { next(e); }
};
