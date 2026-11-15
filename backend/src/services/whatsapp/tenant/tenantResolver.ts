/**
 * tenantResolver.ts — Resolve business pelo instanceName da Evolution API.
 *
 * Fluxo:
 *   1. Consultar tenantCache
 *   2. Cache miss → query no banco (businesses + subscription_status)
 *   3. Popular cache com TTL de 60s
 *   4. Retornar { business, connectedNumber, subscriptionStatus } ou null
 *
 * Nunca lança exceção — retorna null em caso de erro ou não encontrado.
 */

import { Prisma } from '@prisma/client';
import logger from '../../../utils/logger.js';
import { prisma } from '../../../config/prisma.js';
import { getTenant, setTenant } from './tenantCache.js';

const NEGATIVE_TTL_MS = 15_000;

export interface TenantBusiness {
  id: string;
  name: string;
  instanceName: string;
}

export interface TenantData {
  business: TenantBusiness;
  connectedNumber: string | null;
  subscriptionStatus: string | null;
}

interface BusinessRow {
  id: string;
  name: string;
  connected_number: string | null;
  instance_name: string;
  subscription_status: string | null;
}

/**
 * Resolves the tenant (business) associated with a WhatsApp instance.
 *
 * @param instanceName  Raw instanceName from Evolution API webhook
 */
export const resolveTenant = async (instanceName: string): Promise<TenantData | null> => {
  if (!instanceName || typeof instanceName !== 'string') return null;

  const key = instanceName.trim().toLowerCase();
  if (!key) return null;

  // 1. Cache hit
  const cached = getTenant<TenantData>(key);
  if (cached !== undefined) return cached;

  // 2. Database query — uses raw SQL because of the NULLIF/btrim/lower pattern
  try {
    const rows = await prisma.$queryRaw<BusinessRow[]>(Prisma.sql`
      SELECT id,
             name,
             whatsapp                AS connected_number,
             whatsapp_instance_name  AS instance_name,
             subscription_status
        FROM businesses
       WHERE active = true
         AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
         AND lower(btrim(whatsapp_instance_name)) = ${key}
       LIMIT 1
    `);

    if (!rows.length) {
      logger.debug({ instanceName: key }, 'resolveTenant: business not found');
      // Cache negativo curto: o webhook é público e instâncias desconhecidas não devem custar uma consulta por requisição.
      setTenant(key, null, NEGATIVE_TTL_MS);
      return null;
    }

    const row = rows[0];
    if (!row) {
      logger.debug({ instanceName: key }, 'resolveTenant: business not found');
      return null;
    }
    const tenant: TenantData = {
      business: {
        id: row.id,
        name: row.name,
        instanceName: row.instance_name,
      },
      connectedNumber: row.connected_number || null,
      subscriptionStatus: row.subscription_status || null,
    };

    setTenant(key, tenant);
    return tenant;
  } catch (err) {
    logger.error(
      { err, instanceName: key },
      'resolveTenant: database query failed',
    );
    return null;
  }
};
