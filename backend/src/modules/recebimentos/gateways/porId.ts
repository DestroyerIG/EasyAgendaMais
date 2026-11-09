import type { GatewayId } from '../recebimentos.types.js';
import { gateways } from './index.js';
import { GatewayIndisponivel, type Gateway } from './tipos.js';

/** Gateway por id. A InfinitePay ainda não tem implementação aqui: tratada como indisponível. */
export function gatewayDe(id: GatewayId): Gateway {
  const g = (gateways as Partial<Record<GatewayId, Gateway>>)[id];
  if (!g) throw new GatewayIndisponivel();
  return g;
}
