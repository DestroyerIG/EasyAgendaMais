import { mercadoPago } from './mercadoPago.js';
import type { Gateways } from './tipos.js';

export * from './tipos.js';

export const gateways: Gateways = { mercadopago: mercadoPago };
