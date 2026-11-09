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
const SO_DIGITOS = /^\d{1,64}$/;
const ALFANUMERICO = /^[A-Za-z0-9]{1,64}$/;

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
  try {
    const u = usuario(req);
    const estado = await conexaoService.confirmar(u, gatewayDe(req), req.body.t);
    sendSuccess(res, estado);
    // Pagamentos que entraram com a conexão caída: confere em segundo plano, sem segurar a resposta.
    void pagamentosService.conferirAoReconectar(u.businessId);
  } catch (e) { next(e); }
};
export const conectarChave: H = async (req, res, next) => {
  try {
    const u = usuario(req);
    sendSuccess(res, await conexaoService.conectarChave(u, { handle: req.body.handle, chave: req.body.chave }));
    void pagamentosService.conferirAoReconectar(u.businessId);
  } catch (e) { next(e); }
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
  if (tipo !== 'order' && tipo !== 'payment') return;
  // Fora do formato não vai ao gateway nem ao log: a rota é pública.
  if (!SO_DIGITOS.test(contaId) || !(tipo === 'payment' ? SO_DIGITOS : ALFANUMERICO).test(recursoId)) return;
  void pagamentosService.processarAviso({ contaId, tipo, recursoId });
};
