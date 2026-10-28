import type { Request, Response, NextFunction } from 'express';
import { normalizeRole } from '../../utils/roles.js';
import { evaluateFeatureAccess } from '../../services/featureAccessService.js';
import { FeatureAccessError, ForbiddenError } from '../../utils/errors.js';
import { bancadaRepository } from './bancada.repository.js';
import { statusEfetivoDaAssinatura } from '../conta/statusEfetivo.js';
import type { Profissional } from './bancada.types.js';

/**
 * Só o papel `professional`, com o plano liberado, login ativo e cadastro ativo do mesmo negócio.
 * Lido do banco a cada requisição: remover o acesso ou desativar a profissional vale na hora.
 */
export async function requireProfissional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (normalizeRole(req.user?.role) !== 'professional') throw new ForbiddenError('Acesso negado para este perfil');
    const decisao = evaluateFeatureAccess({ feature: 'app_profissional', plan: req.user.plan, subscriptionStatus: statusEfetivoDaAssinatura(req) });
    if (!decisao.allowed) throw new FeatureAccessError('app_profissional', decisao);
    const u = await bancadaRepository.usuarioProfissional(req.user.userId);
    const p = u?.professional;
    if (!u || u.blocked || !p || !p.active || p.businessId !== req.user.businessId || u.businessId !== req.user.businessId) {
      throw new ForbiddenError('Seu acesso ao app foi encerrado. Fale com o salão.');
    }
    const profissional: Profissional = { id: p.id, nome: p.name };
    res.locals['profissional'] = profissional;
    next();
  } catch (e) {
    next(e);
  }
}

export const profissionalDe = (res: Response): Profissional => res.locals['profissional'] as Profissional;
