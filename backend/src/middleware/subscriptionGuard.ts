import type { Request, Response, NextFunction } from 'express';
import { FeatureAccessError } from '../utils/errors.js';
import { evaluateFeatureAccess } from '../services/featureAccessService.js';
import logger from '../utils/logger.js';

export const requireFeature = (feature: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Na carência (e no Pix antecipado, que segue ativo) o status não restringe a
    // feature: o authMiddleware já decidiu o que é leitura e escrita. Só o plano conta.
    const tipoEstado = req.estadoConta?.tipo;
    const statusEfetivo =
      tipoEstado === 'carencia' || tipoEstado === 'ativa' ? 'active' : req.user?.subscriptionStatus;
    const decision = evaluateFeatureAccess({
      feature,
      plan: req.user?.plan,
      subscriptionStatus: statusEfetivo,
    });

    if (!decision.allowed) {
      logger.warn({
        event: 'feature_access_blocked',
        tenantId: req.user?.businessId,
        feature,
        currentPlan: req.user?.plan,
        requiredPlan: decision.requiredPlan,
        subscriptionStatus: req.user?.subscriptionStatus,
        reason: decision.reason,
      });
      return next(new FeatureAccessError(feature, decision));
    }

    return next();
  };
};
