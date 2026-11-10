import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { onboardingService } from './onboarding.service.js';
import type { Segmento } from './onboarding.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const negocio = (req: Request) => req.user.businessId!;

export const show: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.ver(negocio(req))); } catch (e) { next(e); }
};
export const catalog: H = async (req, res, next) => {
  try { sendSuccess(res, onboardingService.catalogo(req.query['segmento'] as Segmento)); } catch (e) { next(e); }
};
export const saveBusiness: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.salvarNegocio(negocio(req), req.body)); } catch (e) { next(e); }
};
export const saveHours: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.salvarHorarios(negocio(req), req.body)); } catch (e) { next(e); }
};
export const saveServices: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.salvarServicos(negocio(req), req.body)); } catch (e) { next(e); }
};
export const saveReceipts: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.salvarRecebimentos(negocio(req), req.body)); } catch (e) { next(e); }
};
export const finish: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.concluir(negocio(req))); } catch (e) { next(e); }
};
export const firstSteps: H = async (req, res, next) => {
  try { sendSuccess(res, await onboardingService.primeirosPassos(negocio(req))); } catch (e) { next(e); }
};
export const dismissFirstSteps: H = async (req, res, next) => {
  try { await onboardingService.dispensarPrimeirosPassos(negocio(req)); sendSuccess(res, { dispensado: true }); } catch (e) { next(e); }
};
