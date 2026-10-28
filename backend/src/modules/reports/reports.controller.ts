import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { ValidationError } from '../../utils/errors.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { type Periodo, quinzenaDe, ultimos30 } from './periodo.js';
import { PeriodoQuerySchema } from './reports.types.js';
import { comissoesService } from './comissoes.service.js';
import { relatoriosService } from './relatorios.service.js';
import { comissoesCsv } from './comissoes.csv.js';
import { avaliacoesService } from '../avaliacoes/avaliacoes.service.js';
import { statusEfetivoDaAssinatura } from '../conta/statusEfetivo.js';

type H = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Sem `inicio`/`fim`, usa o período padrão da tela (quinzena nas comissões, 30 dias nos relatórios).
async function periodoDe(req: Request, padrao: (hoje: string) => Periodo): Promise<Periodo> {
  const { inicio, fim } = req.query as { inicio?: string; fim?: string };
  if (!inicio && !fim) {
    const { timezone } = await getBusinessScheduleSettings(req.user.businessId!);
    return padrao(todayInTimezone(timezone));
  }
  const r = PeriodoQuerySchema.safeParse({ inicio, fim });
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Período inválido');
  return r.data;
}

const ctx = (req: Request) => ({ plan: req.user.plan, subscriptionStatus: statusEfetivoDaAssinatura(req) });

export const getOverview: H = async (req, res, next) => {
  try { sendSuccess(res, await relatoriosService.visaoGeral(req.user.businessId!, await periodoDe(req, ultimos30))); } catch (e) { next(e); }
};
export const getOccupancy: H = async (req, res, next) => {
  try { sendSuccess(res, await relatoriosService.ocupacao(req.user.businessId!, await periodoDe(req, ultimos30))); } catch (e) { next(e); }
};
export const getEvolution: H = async (req, res, next) => {
  try { sendSuccess(res, await relatoriosService.evolucao(req.user.businessId!)); } catch (e) { next(e); }
};
export const getCommissions: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.apuracao(req.user.businessId!, await periodoDe(req, quinzenaDe), ctx(req))); } catch (e) { next(e); }
};
export const exportCommissionsCsv: H = async (req, res, next) => {
  try {
    const p = await periodoDe(req, quinzenaDe);
    const apuracao = await comissoesService.apuracao(req.user.businessId!, p, ctx(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="comissoes-${p.inicio}-a-${p.fim}.csv"`);
    res.send(comissoesCsv(apuracao));
  } catch (e) { next(e); }
};
export const payCommission: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.pagar(req.user.businessId!, req.user.userId, ctx(req), req.body)); } catch (e) { next(e); }
};
export const undoCommissionPayment: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.desfazer(req.user.businessId!, req.params['id'] as string)); } catch (e) { next(e); }
};
export const listAdvances: H = async (req, res, next) => {
  try {
    const q = req.query as { professionalId?: string; abertos?: string };
    sendSuccess(res, await comissoesService.listarAdiantamentos(req.user.businessId!, { professionalId: q.professionalId, abertos: q.abertos === 'true' }));
  } catch (e) { next(e); }
};
export const createAdvance: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.lancarAdiantamento(req.user.businessId!, req.user.userId, req.body), 201); } catch (e) { next(e); }
};
export const deleteAdvance: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.excluirAdiantamento(req.user.businessId!, req.params['id'] as string)); } catch (e) { next(e); }
};
export const savePayoutModel: H = async (req, res, next) => {
  try { sendSuccess(res, await comissoesService.salvarModelo(req.user.businessId!, ctx(req), req.body.modelo)); } catch (e) { next(e); }
};

export const getRatings: H = async (req, res, next) => {
  try { sendSuccess(res, await avaliacoesService.porProfissional(req.user.businessId!, await periodoDe(req, ultimos30))); } catch (e) { next(e); }
};
