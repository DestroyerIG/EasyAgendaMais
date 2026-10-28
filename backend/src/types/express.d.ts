import type { RequestUser, SubscriptionAccessDecision } from './domain.js';
import type { EstadoConta } from '../modules/conta/estadoConta.rules.js';

declare global {
  namespace Express {
    interface Request {
      user: RequestUser;
      subscriptionAccess?: SubscriptionAccessDecision;
      /** Estado da conta (ativa, carência, bloqueada), calculado no authMiddleware. */
      estadoConta?: EstadoConta;
      requestId?: string;
    }
  }
}

export {};
