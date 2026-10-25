import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { ValidationError } from '../../utils/errors.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { UploadPhotoSchema } from '../clientPhotos/clientPhotos.types.js';
import { PeriodoQuerySchema } from '../reports/reports.types.js';
import { quinzenaDe, type Periodo } from '../reports/periodo.js';
import { bancadaService } from './bancada.service.js';
import { profissionalDe } from './bancada.middleware.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const negocio = (req: Request) => req.user.businessId!;
const id = (req: Request) => req.params['id'] as string;

/** Quinzena atual por padrão, como na tela de Comissões. */
async function periodo(req: Request): Promise<Periodo> {
  const { inicio, fim } = req.query as { inicio?: string; fim?: string };
  if (!inicio && !fim) {
    const { timezone } = await getBusinessScheduleSettings(negocio(req));
    return quinzenaDe(todayInTimezone(timezone));
  }
  const r = PeriodoQuerySchema.safeParse({ inicio, fim });
  if (!r.success) throw new ValidationError('Período inválido');
  return r.data as Periodo;
}

export const today: H = async (req, res, next) => {
  try {
    const { data } = req.query as { data?: string };
    sendSuccess(res, await bancadaService.hoje(negocio(req), profissionalDe(res), data));
  } catch (e) { next(e); }
};
export const myClients: H = async (req, res, next) => {
  try {
    const { busca } = req.query as { busca?: string };
    sendSuccess(res, await bancadaService.clientes(negocio(req), profissionalDe(res), busca));
  } catch (e) { next(e); }
};
export const clientCard: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.ficha(negocio(req), profissionalDe(res), id(req))); } catch (e) { next(e); }
};
export const saveNote: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.salvarNota(negocio(req), profissionalDe(res), id(req), req.body.notas)); } catch (e) { next(e); }
};
export const uploadPhoto: H = async (req, res, next) => {
  try {
    const input = UploadPhotoSchema.parse(req.body);
    sendSuccess(res, await bancadaService.enviarFoto(negocio(req), req.user.userId, profissionalDe(res), id(req), input), 201);
  } catch (e) { next(e); }
};
export const start: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.iniciar(negocio(req), profissionalDe(res), id(req))); } catch (e) { next(e); }
};
export const freeSlots: H = async (req, res, next) => {
  try {
    const q = req.query as { agendamento: string; data: string };
    sendSuccess(res, await bancadaService.horarios(negocio(req), profissionalDe(res), q.agendamento, q.data));
  } catch (e) { next(e); }
};
export const reschedule: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.reagendar(negocio(req), profissionalDe(res), id(req), req.body)); } catch (e) { next(e); }
};
export const cancel: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.cancelar(negocio(req), profissionalDe(res), id(req), req.body)); } catch (e) { next(e); }
};
export const shortcuts: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.atalhos(negocio(req))); } catch (e) { next(e); }
};
export const getComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.comanda(negocio(req), profissionalDe(res), id(req))); } catch (e) { next(e); }
};
export const saveComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.salvarComanda(negocio(req), profissionalDe(res), id(req), req.body)); } catch (e) { next(e); }
};
export const sendToFrontDesk: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.enviarParaRecepcao(negocio(req), profissionalDe(res), id(req), req.body)); } catch (e) { next(e); }
};
export const closeComanda: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.fecharComanda(negocio(req), req.user.userId, profissionalDe(res), id(req), req.body)); } catch (e) { next(e); }
};
export const numbers: H = async (req, res, next) => {
  try {
    const ctx = { plan: req.user.plan, subscriptionStatus: req.user.subscriptionStatus };
    sendSuccess(res, await bancadaService.numeros(negocio(req), profissionalDe(res), await periodo(req), ctx));
  } catch (e) { next(e); }
};
export const ratings: H = async (req, res, next) => {
  try { sendSuccess(res, await bancadaService.avaliacoes(negocio(req), profissionalDe(res), await periodo(req))); } catch (e) { next(e); }
};
