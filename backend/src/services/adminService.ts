import logger from '../utils/logger.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { adminRepository } from '../repositories/adminRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { auditLogService } from './auditLogService.js';
import { subscriptionService } from './subscriptionService.js';
import { billingService } from './billingService.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { painelRepository } from '../modules/admin/painel.repository.js';
import { estadoContaService } from '../modules/conta/estadoConta.service.js';
import { normalizeInternalSubscriptionStatus } from './billing/statusMapper.js';
import type { Request } from 'express';

interface AuthUser {
  userId?: string | null;
  businessId?: string | null;
  role?: string | null;
}

interface TenantActionBody {
  confirmation?: string;
  reason?: string;
}

interface UserActionBody {
  confirmation?: string;
  reason?: string;
}

interface ResyncBody {
  confirmation?: string;
}

const ensureConfirmed = (confirmation: unknown): void => {
  if (confirmation !== 'CONFIRM') {
    throw new ValidationError('Confirmação inválida', ['Use confirmation=CONFIRM para executar esta ação']);
  }
};

const actorPayload = (authUser: AuthUser | null | undefined): { actorUserId: string | null; actorBusinessId: string | null } => ({
  actorUserId: authUser?.userId || null,
  actorBusinessId: authUser?.businessId || null,
});

export const adminService = {
  async listSubscriptions(query: Record<string, unknown> = {}): Promise<unknown> {
    return adminRepository.listSubscriptions(query);
  },

  async listAuditLogs(query: Record<string, unknown> = {}): Promise<unknown> {
    return auditRepository.listLogs(query);
  },

  async blockTenant(authUser: AuthUser | null, tenantId: string, body: TenantActionBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      const tenant = await adminRepository.updateTenantAccessStatus(client, tenantId, {
        active: false,
        reason: body.reason || 'Conta bloqueada por administrador',
      });

      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      const tenantRecord = tenant as Record<string, unknown>;
      await adminRepository.revokeTenantRefreshTokens(client, tenantRecord.id as string);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_BLOCKED',
        ...actorPayload(authUser),
        targetBusinessId: tenantRecord.id as string,
        resourceType: 'business',
        resourceId: tenantRecord.id as string,
        details: {
          reason: body.reason || null,
        },
      });

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }
      return tenant;
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_BLOCKED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'business',
        resourceId: tenantId,
        details: { reason: body.reason || null },
        errorMessage: (error as Error).message,
      });

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async unblockTenant(authUser: AuthUser | null, tenantId: string, body: TenantActionBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      const tenant = await adminRepository.updateTenantAccessStatus(client, tenantId, {
        active: true,
      });

      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      const tenantRecord = tenant as Record<string, unknown>;
      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_UNBLOCKED',
        ...actorPayload(authUser),
        targetBusinessId: tenantRecord.id as string,
        resourceType: 'business',
        resourceId: tenantRecord.id as string,
      });

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }
      return tenant;
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_UNBLOCKED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'business',
        resourceId: tenantId,
        errorMessage: (error as Error).message,
      });

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async softDeleteTenant(authUser: AuthUser | null, tenantId: string, body: TenantActionBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      const tenant = await adminRepository.softDeleteTenant(client, tenantId, body.reason);
      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      const tenantRecord = tenant as Record<string, unknown>;
      await adminRepository.revokeTenantRefreshTokens(client, tenantRecord.id as string);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_SOFT_DELETED',
        ...actorPayload(authUser),
        targetBusinessId: tenantRecord.id as string,
        resourceType: 'business',
        resourceId: tenantRecord.id as string,
        details: {
          reason: body.reason || null,
        },
      });

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }
      return tenant;
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_SOFT_DELETED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'business',
        resourceId: tenantId,
        details: { reason: body.reason || null },
        errorMessage: (error as Error).message,
      });

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async blockUser(authUser: AuthUser | null, userId: string, body: UserActionBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const targetUser = await adminRepository.getUserContext(userId);
    if (!targetUser) {
      throw new NotFoundError('Usuário');
    }

    const targetUserRecord = targetUser as Record<string, unknown>;
    if (targetUserRecord.role === 'platform_admin') {
      throw new ForbiddenError('Não é permitido bloquear usuários platform_admin');
    }

    const client = await adminRepository.getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      const updatedUser = await adminRepository.setUserBlockedStatus(client, userId, {
        blocked: true,
        reason: body.reason || 'Usuário bloqueado por administrador',
      });

      if (!updatedUser) {
        throw new NotFoundError('Usuário');
      }

      const updatedUserRecord = updatedUser as Record<string, unknown>;
      await adminRepository.revokeUserRefreshTokens(client, userId);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'USER_BLOCKED',
        ...actorPayload(authUser),
        targetUserId: updatedUserRecord.id as string,
        targetBusinessId: updatedUserRecord.business_id as string,
        resourceType: 'user',
        resourceId: updatedUserRecord.id as string,
        details: {
          reason: body.reason || null,
          email: updatedUserRecord.email as string,
        },
      });

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }
      return updatedUser;
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }

      await auditLogService.safeLogFailure({
        req,
        actionType: 'USER_BLOCKED',
        ...actorPayload(authUser),
        targetUserId: userId,
        targetBusinessId: (targetUserRecord?.business_id as string) || null,
        resourceType: 'user',
        resourceId: userId,
        details: { reason: body.reason || null },
        errorMessage: (error as Error).message,
      });

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async unblockUser(authUser: AuthUser | null, userId: string, body: UserActionBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const targetUser = await adminRepository.getUserContext(userId);
    if (!targetUser) {
      throw new NotFoundError('Usuário');
    }

    const targetUserRecord = targetUser as Record<string, unknown>;
    const client = await adminRepository.getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      const updatedUser = await adminRepository.setUserBlockedStatus(client, userId, {
        blocked: false,
      });

      if (!updatedUser) {
        throw new NotFoundError('Usuário');
      }

      const updatedUserRecord = updatedUser as Record<string, unknown>;
      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'USER_UNBLOCKED',
        ...actorPayload(authUser),
        targetUserId: updatedUserRecord.id as string,
        targetBusinessId: updatedUserRecord.business_id as string,
        resourceType: 'user',
        resourceId: updatedUserRecord.id as string,
        details: {
          email: updatedUserRecord.email as string,
        },
      });

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }
      return updatedUser;
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }

      await auditLogService.safeLogFailure({
        req,
        actionType: 'USER_UNBLOCKED',
        ...actorPayload(authUser),
        targetUserId: userId,
        targetBusinessId: (targetUserRecord?.business_id as string) || null,
        resourceType: 'user',
        resourceId: userId,
        errorMessage: (error as Error).message,
      });

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async resyncSubscription(authUser: AuthUser | null, tenantId: string, body: ResyncBody, req: Request): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    try {
      const result = await subscriptionService.resyncBusinessSubscription(tenantId);
      const resultRecord = result as Record<string, unknown>;

      await auditLogService.logAdminAction({
        req,
        actionType: 'SUBSCRIPTION_RESYNC_TRIGGERED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        details: {
          subscriptionStatus: resultRecord.subscriptionStatus,
          plan: resultRecord.plan,
        },
      });

      return result;
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Falha no re-sync manual de assinatura');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'SUBSCRIPTION_RESYNC_TRIGGERED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        errorMessage: (error as Error).message,
      });

      throw error;
    }
  },

  async overridePlan(
    authUser: AuthUser | null,
    tenantId: string,
    body: { confirmation?: string; plan: string; reason?: string },
    req: Request
  ): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const VALID_PLANS = new Set(['basico', 'profissional', 'premium']);
    if (!VALID_PLANS.has(body.plan)) {
      throw new ValidationError('Plano inválido', [`plan deve ser um de: ${[...VALID_PLANS].join(', ')}`]);
    }

    const context = await subscriptionRepository.getBusinessBillingContext(tenantId);
    if (!context) throw new NotFoundError('Negócio');

    await subscriptionRepository.updateSubscriptionState(tenantId, { plan: body.plan });
    await subscriptionRepository.setDesiredPlan(tenantId, body.plan);

    await auditLogService.logAdminAction({
      req,
      actionType: 'SUBSCRIPTION_PLAN_OVERRIDE',
      ...actorPayload(authUser),
      targetBusinessId: tenantId,
      resourceType: 'subscription',
      resourceId: tenantId,
      details: {
        previousPlan: context.plan,
        newPlan: body.plan,
        reason: body.reason || null,
      },
    });

    logger.info({ tenantId, previousPlan: context.plan, newPlan: body.plan }, 'Admin: plano sobrescrito manualmente');
    return { tenantId, plan: body.plan };
  },

  async overrideStatus(
    authUser: AuthUser | null,
    tenantId: string,
    body: { confirmation?: string; status: string; reason?: string },
    req: Request
  ): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const VALID_STATUSES = new Set(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']);
    if (!VALID_STATUSES.has(body.status)) {
      throw new ValidationError('Status inválido', [`status deve ser um de: ${[...VALID_STATUSES].join(', ')}`]);
    }

    const context = await subscriptionRepository.getBusinessBillingContext(tenantId);
    if (!context) throw new NotFoundError('Negócio');

    await subscriptionRepository.updateSubscriptionState(tenantId, {
      subscriptionStatus: body.status as 'active' | 'trialing' | 'pending' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete',
    });

    await auditLogService.logAdminAction({
      req,
      actionType: 'SUBSCRIPTION_STATUS_OVERRIDE',
      ...actorPayload(authUser),
      targetBusinessId: tenantId,
      resourceType: 'subscription',
      resourceId: tenantId,
      details: {
        previousStatus: context.subscription_status,
        newStatus: body.status,
        reason: body.reason || null,
      },
    });

    logger.info({ tenantId, previousStatus: context.subscription_status, newStatus: body.status }, 'Admin: status sobrescrito manualmente');
    return { tenantId, subscriptionStatus: body.status };
  },

  async estenderTeste(
    authUser: AuthUser | null,
    tenantId: string,
    body: { confirmation?: string; dias: number; reason: string },
    req: Request
  ): Promise<{ tenantId: string; fimDoTeste: string }> {
    ensureConfirmed(body.confirmation);

    const linha = await painelRepository.linhaNegocio(tenantId);
    if (!linha) throw new NotFoundError('Negócio');

    let fimAnterior: Date | null = null;
    try {
      const status = normalizeInternalSubscriptionStatus(linha.statusAssinatura);
      const emTeste = status === 'trialing' || (status === 'incomplete' && !linha.jaPagou);
      if (!emTeste) {
        throw new ConflictError('O teste só pode ser estendido para quem está em teste ou terminou o teste sem pagar.');
      }

      const extras = await painelRepository.extrasNegocio(tenantId);
      if (extras?.temAssinaturaGateway) {
        throw new ConflictError('Este teste é controlado pelo gateway de pagamento.');
      }

      fimAnterior = linha.fimDoPeriodo ?? null;
      const fimNovo = await adminRepository.estenderTeste(tenantId, body.dias);
      if (!fimNovo) throw new NotFoundError('Negócio');

      estadoContaService.invalidar(tenantId);

      await auditLogService.logAdminAction({
        req,
        actionType: 'TRIAL_EXTENDED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        details: {
          dias: body.dias,
          reason: body.reason,
          fimAnterior: fimAnterior ? fimAnterior.toISOString() : null,
          fimNovo: fimNovo.toISOString(),
        },
      });

      logger.info({ tenantId, dias: body.dias }, 'Admin: teste grátis estendido');
      return { tenantId, fimDoTeste: fimNovo.toISOString() };
    } catch (error) {
      await auditLogService.safeLogFailure({
        req,
        actionType: 'TRIAL_EXTENDED',
        ...actorPayload(authUser),
        targetBusinessId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        details: { dias: body.dias, reason: body.reason },
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  },

  async cancelSubscription(
    authUser: AuthUser | null,
    tenantId: string,
    body: ResyncBody,
    req: Request
  ): Promise<unknown> {
    ensureConfirmed(body.confirmation);

    const context = await subscriptionRepository.getBusinessBillingContext(tenantId);
    if (!context) throw new NotFoundError('Negócio');

    const result = await billingService.cancelSubscription(tenantId);

    await auditLogService.logAdminAction({
      req,
      actionType: 'SUBSCRIPTION_CANCELED',
      ...actorPayload(authUser),
      targetBusinessId: tenantId,
      resourceType: 'subscription',
      resourceId: tenantId,
      details: {
        previousStatus: context.subscription_status,
        plan: context.plan,
      },
    });

    logger.info({ tenantId, previousStatus: context.subscription_status }, 'Admin: assinatura cancelada manualmente');
    return result;
  },
};
