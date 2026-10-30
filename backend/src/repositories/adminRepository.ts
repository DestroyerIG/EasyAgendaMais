import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const getOrderBy = (
  sortBy: string,
  sortOrder: string,
  allowed: Record<string, string>
): string => {
  const normalizedField = allowed[sortBy] || allowed['created_at'];
  const normalizedOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  return `${normalizedField} ${normalizedOrder}`;
};

const buildPaginationMeta = ({
  total,
  page,
  limit,
}: {
  total: number;
  page: number;
  limit: number;
}): { total: number; page: number; limit: number; totalPages: number } => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const adminRepository = {
  async getTenantDetails(tenantId: string): Promise<unknown> {
    const tenantResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`SELECT
        b.id,
        b.name,
        b.owner_name,
        b.email,
        b.whatsapp,
        b.plan,
        b.subscription_status,
        b.subscription_current_period_start,
        b.subscription_current_period_end,
        b.subscription_cancel_at_period_end,
        b.subscription_updated_at,
        b.stripe_customer_id,
        b.stripe_subscription_id,
        b.active,
        b.suspended_at,
        b.suspended_reason,
        b.created_at,
        b.updated_at,
        owner_user.id AS owner_user_id,
        owner_user.email AS owner_user_email,
        owner_user.role AS owner_user_role,
        owner_user.blocked AS owner_user_blocked
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT u.id, u.email, u.role, u.blocked
        FROM users u
        WHERE u.business_id = b.id
        ORDER BY
          CASE
            WHEN u.role = 'tenant_admin' THEN 0
            WHEN u.role = 'admin' THEN 1
            ELSE 2
          END,
          u.created_at ASC
        LIMIT 1
      ) owner_user ON true
      WHERE b.id = ${tenantId}::uuid`
    );

    const tenant = tenantResult[0];
    if (!tenant) {
      return null;
    }

    const [
      usersResult,
      clientsResult,
      appointmentsMonthResult,
      servicesResult,
      professionalsResult,
      lastActivityResult,
    ] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE blocked = true)::int AS blocked_users
         FROM users
         WHERE business_id = ${tenantId}::uuid`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_clients FROM clients WHERE business_id = ${tenantId}::uuid`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_appointments_month
         FROM appointments
         WHERE business_id = ${tenantId}::uuid
           AND created_at >= date_trunc('month', NOW())`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_services
         FROM services
         WHERE business_id = ${tenantId}::uuid AND active = true`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_professionals
         FROM professionals
         WHERE business_id = ${tenantId}::uuid AND active = true`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT MAX(created_at) AS last_activity_at
         FROM appointments
         WHERE business_id = ${tenantId}::uuid`
      ),
    ]);

    return {
      ...tenant,
      usage: {
        totalUsers: (usersResult[0] as Record<string, unknown>)?.['total_users'] || 0,
        blockedUsers: (usersResult[0] as Record<string, unknown>)?.['blocked_users'] || 0,
        totalClients: (clientsResult[0] as Record<string, unknown>)?.['total_clients'] || 0,
        totalAppointmentsMonth: (appointmentsMonthResult[0] as Record<string, unknown>)?.['total_appointments_month'] || 0,
        totalServices: (servicesResult[0] as Record<string, unknown>)?.['total_services'] || 0,
        totalProfessionals: (professionalsResult[0] as Record<string, unknown>)?.['total_professionals'] || 0,
        lastActivityAt: (lastActivityResult[0] as Record<string, unknown>)?.['last_activity_at'] || null,
      },
    };
  },

  async updateTenantAccessStatus(
    _client: unknown = null,
    tenantId: string,
    { active, reason }: { active: boolean; reason?: string }
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE businesses
       SET active = ${active},
           suspended_at = CASE WHEN ${active} = false THEN NOW() ELSE NULL END,
           suspended_reason = CASE WHEN ${active} = false THEN COALESCE(${reason || null}, suspended_reason) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
        WHERE id = ${tenantId}::uuid
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`
    );

    return result[0] || null;
  },

  async softDeleteTenant(
    _client: unknown = null,
    tenantId: string,
    reason?: string
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE businesses
       SET active = false,
           suspended_at = NOW(),
           suspended_reason = COALESCE(${reason || null}, 'soft_deleted'),
           updated_at = CURRENT_TIMESTAMP
        WHERE id = ${tenantId}::uuid
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`
    );

    return result[0] || null;
  },

  async getUserContext(userId: string): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`SELECT
        u.id,
        u.email,
        u.role,
        u.blocked,
        u.blocked_at,
        u.blocked_reason,
        u.business_id,
        b.name AS business_name,
        b.active AS business_active
       FROM users u
       JOIN businesses b ON b.id = u.business_id
        WHERE u.id = ${userId}::uuid`
    );

    return result[0] || null;
  },

  async setUserBlockedStatus(
    _client: unknown = null,
    userId: string,
    { blocked, reason }: { blocked: boolean; reason?: string }
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE users
       SET blocked = ${blocked},
           blocked_at = CASE WHEN ${blocked} = true THEN NOW() ELSE NULL END,
           blocked_reason = CASE WHEN ${blocked} = true THEN ${reason || null} ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}::uuid
       RETURNING id, email, role, business_id, blocked, blocked_at, blocked_reason`
    );

    return result[0] || null;
  },

  async revokeUserRefreshTokens(_client: unknown = null, userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },

  async revokeTenantRefreshTokens(_client: unknown = null, tenantId: string): Promise<void> {
    const users = await prisma.user.findMany({
      where: { businessId: tenantId },
      select: { id: true },
    });

    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.refreshToken.updateMany({
        where: {
          userId: { in: userIds },
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }
  },

  async listSubscriptions(filters: Record<string, unknown> = {}): Promise<unknown> {
    const {
      search,
      status,
      plan,
      overdueOnly,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = filters as {
      search?: string;
      status?: string;
      plan?: string;
      overdueOnly?: boolean;
      sortBy?: string;
      sortOrder?: string;
      page?: number;
      limit?: number;
    };

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${(search as string).toLowerCase()}%`);
      whereClauses.push(`(LOWER(b.name) LIKE $${params.length} OR LOWER(b.email) LIKE $${params.length})`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`b.subscription_status = $${params.length}`);
    }

    if (plan) {
      params.push(plan);
      whereClauses.push(`b.plan = $${params.length}`);
    }

    if (overdueOnly === true) {
      whereClauses.push(`b.subscription_status IN ('past_due', 'unpaid', 'incomplete')`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const orderBy = getOrderBy(sortBy as string, sortOrder as string, {
      updated_at: 'b.subscription_updated_at',
      subscription_current_period_end: 'b.subscription_current_period_end',
      name: 'b.name',
    });

    const pageNum = page as number;
    const limitNum = limit as number;
    const offset = (pageNum - 1) * limitNum;

    const dataQuery = `
      SELECT
        b.id AS tenant_id,
        b.name,
        b.email,
        b.plan,
        b.subscription_status,
        b.subscription_current_period_start,
        b.subscription_current_period_end,
        b.subscription_cancel_at_period_end,
        b.subscription_updated_at,
        b.stripe_customer_id,
        b.stripe_subscription_id,
        b.active,
        owner_user.email AS owner_user_email
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT u.email
        FROM users u
        WHERE u.business_id = b.id
        ORDER BY
          CASE
            WHEN u.role = 'tenant_admin' THEN 0
            WHEN u.role = 'admin' THEN 1
            ELSE 2
          END,
          u.created_at ASC
        LIMIT 1
      ) owner_user ON true
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM businesses b
      ${whereSql}
    `;

    const [dataResult, countResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(dataQuery, ...params, limitNum, offset),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(countQuery, ...params),
    ]);

    const total = (countResult[0] as Record<string, unknown>)?.['total'] as number || 0;

    return {
      data: dataResult,
      meta: buildPaginationMeta({ total, page: pageNum, limit: limitNum }),
    };
  },

  async getClient(): Promise<unknown> {
    return null;
  },
};
