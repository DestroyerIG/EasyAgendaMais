import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { conexaoService } from './conexao.service.js';
import { pagamentosService } from './pagamentos.service.js';
import type { GatewayId, UsuarioLogado } from './recebimentos.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const usuario = (req: Request): UsuarioLogado => ({
  userId: req.user.userId, businessId: req.user.businessId!, role: req.user.role,
});
const gatewayDe = (req: Request) => req.params['gateway'] as GatewayId;
const emTexto = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

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

/** Responde 200 primeiro, sempre: o corpo só diz onde olhar, e o que vale é a consulta ao gateway. */
export const webhookMercadoPago = (req: Request, res: Response): void => {
  res.sendStatus(200);
  const corpo = (req.body ?? {}) as { type?: unknown; user_id?: unknown; data?: { id?: unknown } | null };
  const tipo = emTexto(corpo.type) || emTexto(req.query['type']);
  const contaId = emTexto(corpo.user_id);
  const recursoId = emTexto(corpo.data?.id) || emTexto(req.query['data.id']);
  if ((tipo !== 'order' && tipo !== 'payment') || !contaId || !recursoId) return;
  void pagamentosService.processarAviso({ contaId, tipo, recursoId });
};
