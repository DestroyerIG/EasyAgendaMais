import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { crmService } from './crm.service.js';
import { InsightsQuerySchema, TimelineQuerySchema, FichaInputSchema, ConsentInputSchema, CrmSettingsSchema } from './crm.types.js';

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

export const getProfile: H = async (req, res, next) => {
  try { sendSuccess(res, await crmService.profile(req.user.businessId!, req.params.id)); } catch (e) { next(e); }
};
export const getTimeline: H = async (req, res, next) => {
  try {
    const q = TimelineQuerySchema.parse(req.query);
    sendSuccess(res, await crmService.timeline(req.user.businessId!, req.params.id, q.filtro));
  } catch (e) { next(e); }
};
export const putTechnicalSheet: H = async (req, res, next) => {
  try {
    const body = FichaInputSchema.parse(req.body);
    sendSuccess(res, await crmService.saveTechnicalSheet(req.user.businessId!, req.user.userId, req.params.id, body));
  } catch (e) { next(e); }
};
export const postConsent: H = async (req, res, next) => {
  try {
    const { granted } = ConsentInputSchema.parse(req.body);
    sendSuccess(res, await crmService.setConsent(req.user.businessId!, req.user.userId, req.params.id, granted));
  } catch (e) { next(e); }
};
export const getCrmSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await crmService.getSettings(req.user.businessId!)); } catch (e) { next(e); }
};
export const putCrmSettings: H = async (req, res, next) => {
  try { sendSuccess(res, await crmService.saveSettings(req.user.businessId!, CrmSettingsSchema.parse(req.body))); } catch (e) { next(e); }
};
