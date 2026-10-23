import type { Request, Response, NextFunction } from 'express';
import { sendCreated, sendSuccess } from '../../utils/response.js';
import { campanhasRepository } from './campanhas.repository.js';
import { campanhasService } from './campanhas.service.js';
import { publicoService } from './publico.service.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const listarCampanhas: H = async (req, res, next) => {
  try { sendSuccess(res, await campanhasService.listar(req.user.businessId!)); } catch (e) { next(e); }
};
export const opcoesCampanha: H = async (req, res, next) => {
  try { sendSuccess(res, await campanhasRepository.opcoes(req.user.businessId!)); } catch (e) { next(e); }
};
export const publicoCampanha: H = async (req, res, next) => {
  try { sendSuccess(res, await publicoService.previa(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const criarCampanha: H = async (req, res, next) => {
  try { sendCreated(res, await campanhasService.salvar(req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
export const editarCampanha: H = async (req, res, next) => {
  try { sendSuccess(res, await campanhasService.salvar(req.user.businessId!, req.user.userId, req.body, req.params.id)); } catch (e) { next(e); }
};
export const detalhesCampanha: H = async (req, res, next) => {
  try { sendSuccess(res, await campanhasService.detalhes(req.user.businessId!, req.params.id)); } catch (e) { next(e); }
};
export const cancelarCampanha: H = async (req, res, next) => {
  try { sendSuccess(res, await campanhasService.cancelar(req.user.businessId!, req.params.id)); } catch (e) { next(e); }
};
