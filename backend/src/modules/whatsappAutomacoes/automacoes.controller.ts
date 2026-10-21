import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { automacoes } from './automacoes.service.js';
import { metricas } from './metricas.service.js';
import type { Regra } from './automacoes.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const listarAutomacoes: H = async (req, res, next) => {
  try { sendSuccess(res, { regras: await automacoes.obterTodas(req.user.businessId!) }); } catch (e) { next(e); }
};
export const atualizarAutomacao: H = async (req, res, next) => {
  try { sendSuccess(res, await automacoes.atualizar(req.user.businessId!, req.params.regra as Regra, req.body)); } catch (e) { next(e); }
};
export const testarAutomacao: H = async (req, res, next) => {
  try { sendSuccess(res, await automacoes.testar(req.user.businessId!, req.params.regra as Regra)); } catch (e) { next(e); }
};
export const painelAutomacoes: H = async (req, res, next) => {
  try { sendSuccess(res, await metricas.painel(req.user.businessId!)); } catch (e) { next(e); }
};
export const historicoAutomacoes: H = async (req, res, next) => {
  try { sendSuccess(res, await metricas.historico(req.user.businessId!, Number(req.query.limite ?? 30))); } catch (e) { next(e); }
};
