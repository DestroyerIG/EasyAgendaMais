import type { Request } from 'express';
import type { SubscriptionStatus } from '../../types/domain.js';

/**
 * Status da assinatura que as checagens de feature devem usar.
 * Na carência (e no Pix antecipado, que segue `ativa`) o status não restringe
 * features: o authMiddleware já decidiu o que é leitura e escrita, e só o plano conta.
 */
export function statusEfetivoDaAssinatura(req: Pick<Request, 'user' | 'estadoConta'>): SubscriptionStatus {
  const tipo = req.estadoConta?.tipo;
  if (tipo === 'carencia' || tipo === 'ativa') return 'active';
  return req.user?.subscriptionStatus;
}
