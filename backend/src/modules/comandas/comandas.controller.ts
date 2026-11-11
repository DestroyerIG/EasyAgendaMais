import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '../../utils/response.js';
import { comandasService } from './comandas.service.js';
import { cobrancaSaldoService } from '../recebimentos/cobrancaSaldo.service.js';
import { commissionSettings } from './commissionSettings.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const id = (req: Request) => String(req.params['id']);

export const openComanda: H = async (req, res, next) => {
  try { sendCreated(res, await comandasService.open(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const getComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.get(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const saveComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.save(id(req), req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const closeComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.close(id(req), req.user.businessId!, req.user.userId, req.body)); } catch (e) { next(e); }
};
export const comandaPix: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.gerarPix(id(req), req.user.businessId!, req.body)); } catch (e) { next(e); }
};
export const cobrancaDaComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await cobrancaSaldoService.estado(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const cobrarComanda: H = async (req, res, next) => {
  try {
    const { via, forma, ...input } = req.body;
    const como = via === 'maquininha' ? { via, forma } : { via: 'pix' as const };
    sendSuccess(res, await cobrancaSaldoService.criar(id(req), req.user.businessId!, req.user.userId, input, como));
  } catch (e) { next(e); }
};
export const cancelarCobrancaDaComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await cobrancaSaldoService.cancelar(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const resendReceipt: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.resendReceipt(id(req), req.user.businessId!)); } catch (e) { next(e); }
};
export const getShortcuts: H = async (req, res, next) => {
  try { sendSuccess(res, await comandasService.shortcuts(req.user.businessId!)); } catch (e) { next(e); }
};
export const getCommissionSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await commissionSettings.get(req.user.businessId!)); } catch (e) { next(e); }
};
export const updateCommissionSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await commissionSettings.update(req.user.businessId!, req.body)); } catch (e) { next(e); }
};
