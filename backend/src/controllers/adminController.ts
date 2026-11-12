import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.js';
import { adminService } from '../services/adminService.js';
import { painelService } from '../modules/admin/painel.service.js';
import type {
  AdminMetricsQuery,
  AdminTenantListQuery,
  AdminTenantFiltros,
  AdminTenantAuditQuery,
} from '../validators/schemas/adminSchemas.js';
import {
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminTenantFiltrosSchema,
  adminTenantAuditQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
  adminProfessionalParamsSchema,
  adminProfessionalAvailabilityBodySchema,
} from '../validators/schemas/index.js';

export {
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminTenantFiltrosSchema,
  adminTenantAuditQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
  adminProfessionalParamsSchema,
  adminProfessionalAvailabilityBodySchema,
};

export const getAdminMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { periodDays } = req.query as unknown as AdminMetricsQuery;
    const data = await painelService.visaoGeral(periodDays);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, meta, cartoes, segmentos } = await painelService.listar(req.query as unknown as AdminTenantListQuery);
    // Mesmo envelope de sendSuccess, com os cartões e a contagem por segmento ao lado de data e meta.
    res.status(200).json({ success: true, data, meta, cartoes, segmentos });
  } catch (error) {
    next(error);
  }
};

export const exportAdminTenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const csv = await painelService.exportarCsv(req.query as unknown as AdminTenantFiltros);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="negocios.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenantDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await painelService.detalhe(req.params['id'] as string);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenantAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, meta } = await painelService.auditoria(
      req.params['id'] as string,
      req.query as unknown as AdminTenantAuditQuery,
    );
    sendSuccess(res, data, 200, meta);
  } catch (error) {
    next(error);
  }
};

export const exportAdminTenantAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { categoria } = req.query as unknown as AdminTenantAuditQuery;
    const csv = await painelService.exportarAuditoriaCsv(req.params['id'] as string, categoria);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};

export const blockTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.blockTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.unblockTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const softDeleteTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.softDeleteTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.blockUser(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.unblockUser(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await adminService.listSubscriptions(req.query) as { data: unknown[]; meta: import('../utils/response.js').PaginationMeta };
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const resyncSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.resyncSubscription(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const overridePlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.overridePlan(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const definirValorSalao = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.definirValorSalao(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const overrideStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.overrideStatus(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const estenderTeste = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.estenderTeste(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const cancelSubscriptionAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.cancelSubscription(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await adminService.listAuditLogs(req.query) as { data: unknown[]; meta: import('../utils/response.js').PaginationMeta };
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenantProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await adminService.listarProfissionais(req.params['id'] as string));
  } catch (error) {
    next(error);
  }
};

export const setAdminProfessionalAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.definirDisponibilidade(
      req.user, req.params['id'] as string, req.params['professionalId'] as string, req.body.available, req,
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
