import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { NotFoundError } from '../../utils/errors.js';
import { sendSuccess } from '../../utils/response.js';
import { inboxRepository } from './inbox.repository.js';
import { respostasRapidas } from './quickReplies.js';
import { resumoConexao } from './connectionSummary.js';
import { inboxService } from './inbox.service.js';
import { EnviarSchema, LidasSchema, ListaConversasQuery, MensagensQuery } from './inbox.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// id que não é UUID responde 404 (o Prisma devolveria 500 numa coluna uuid).
const uuid = (req: Request): string => {
  const r = z.string().uuid().safeParse(req.params['id']);
  if (!r.success) throw new NotFoundError('Conversa');
  return r.data;
};
// requireTenantRoles já barra o papel 'client'.
const ator = (req: Request) => ({ userId: req.user.userId, role: req.user.role as 'tenant_admin' | 'employee' });

export const listarConversas: H = async (req, res, next) => {
  try { sendSuccess(res, await inboxService.listar(req.user.businessId!, ListaConversasQuery.parse(req.query))); } catch (e) { next(e); }
};
export const detalheConversa: H = async (req, res, next) => {
  try { sendSuccess(res, await inboxService.detalhe(req.user.businessId!, uuid(req))); } catch (e) { next(e); }
};
export const mensagensConversa: H = async (req, res, next) => {
  try {
    const { antes } = MensagensQuery.parse(req.query);
    sendSuccess(res, await inboxService.mensagens(req.user.businessId!, uuid(req), antes));
  } catch (e) { next(e); }
};
export const enviarMensagem: H = async (req, res, next) => {
  try {
    const { texto } = EnviarSchema.parse(req.body);
    sendSuccess(res, await inboxService.enviar(req.user.businessId!, ator(req), uuid(req), texto));
  } catch (e) { next(e); }
};
export const assumirConversa: H = async (req, res, next) => {
  try { sendSuccess(res, await inboxService.assumir(req.user.businessId!, ator(req), uuid(req))); } catch (e) { next(e); }
};
export const devolverConversa: H = async (req, res, next) => {
  try { sendSuccess(res, await inboxService.devolver(req.user.businessId!, ator(req), uuid(req))); } catch (e) { next(e); }
};
export const marcarLidas: H = async (req, res, next) => {
  try {
    const { ids } = LidasSchema.parse(req.body ?? {});
    sendSuccess(res, await inboxService.marcarLidas(req.user.businessId!, ids));
  } catch (e) { next(e); }
};
export const respostasRapidasConversa: H = async (req, res, next) => {
  try {
    const id = uuid(req);
    if (!(await inboxRepository.conversaDoNegocio(req.user.businessId!, id))) throw new NotFoundError('Conversa');
    sendSuccess(res, await respostasRapidas(req.user.businessId!));
  } catch (e) { next(e); }
};
export const resumoDaConexao: H = async (req, res, next) => {
  try { sendSuccess(res, await resumoConexao(req.user.businessId!)); } catch (e) { next(e); }
};
