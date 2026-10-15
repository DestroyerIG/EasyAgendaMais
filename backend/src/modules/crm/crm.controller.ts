import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { crmService } from './crm.service.js';
import { InsightsQuerySchema } from './crm.types.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const getInsights: H = async (req, res, next) => {
  try {
    const q = InsightsQuerySchema.parse(req.query);
    const r = await crmService.insights(req.user.businessId!, q);
    sendSuccess(res, r, 200, { total: r.total, page: q.page, limit: q.pageSize });
  } catch (e) { next(e); }
};
export const getPhases: H = async (req, res, next) => {
  try { sendSuccess(res, await crmService.fases(req.user.businessId!)); } catch (e) { next(e); }
};
export const exportClientsCsv: H = async (req, res, next) => {
  try {
    const csv = await crmService.exportCsv(req.user.businessId!);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
    res.send(csv);
  } catch (e) { next(e); }
};
