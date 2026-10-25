import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { clubeService } from './clube.service.js';
import { clubePublicService } from './clube.public.service.js';
import type { ListaContratosQuery } from './clube.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const negocio = (req: Request) => req.user.businessId!;
const id = (req: Request) => req.params['id'] as string;

export const listOffers: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.listarOfertas(negocio(req))); } catch (e) { next(e); }
};
export const createOffer: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.criarOferta(negocio(req), req.body), 201); } catch (e) { next(e); }
};
export const updateOffer: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.editarOferta(negocio(req), id(req), req.body)); } catch (e) { next(e); }
};
export const listContracts: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.listarContratos(negocio(req), req.query as unknown as ListaContratosQuery)); } catch (e) { next(e); }
};
export const linkClient: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.vincular(negocio(req), req.user.userId, req.body), 201); } catch (e) { next(e); }
};
export const cancelContract: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.cancelar(negocio(req), id(req))); } catch (e) { next(e); }
};
export const confirmCharge: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.confirmarCobranca(negocio(req), req.user.userId, id(req), req.body.forma)); } catch (e) { next(e); }
};
export const resendCharge: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.reenviarCobranca(negocio(req), id(req))); } catch (e) { next(e); }
};
export const exportContractsCsv: H = async (req, res, next) => {
  try {
    const csv = await clubeService.exportarCsv(negocio(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assinantes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
};
export const clientContracts: H = async (req, res, next) => {
  try { sendSuccess(res, await clubeService.contratosDoCliente(negocio(req), req.params['clientId'] as string)); } catch (e) { next(e); }
};

// Públicas
export const publicClubs: H = async (req, res, next) => {
  try { sendSuccess(res, await clubePublicService.vitrine(req.params['slug'] as string)); } catch (e) { next(e); }
};
export const publicClub: H = async (req, res, next) => {
  try { sendSuccess(res, await clubePublicService.oferta(req.params['slug'] as string, req.params['ofertaId'] as string)); } catch (e) { next(e); }
};
export const publicJoin: H = async (req, res, next) => {
  try {
    sendSuccess(res, await clubePublicService.aderir(req.params['slug'] as string, req.params['ofertaId'] as string, req.body), 201);
  } catch (e) { next(e); }
};
