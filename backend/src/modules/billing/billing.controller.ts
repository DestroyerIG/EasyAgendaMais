import { valorMensalOuErro } from '../../config/valorPlano.js';
import { subscriptionRepository } from '../../repositories/subscriptionRepository.js';
import type { PlanId } from '../../types/domain.js';
import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { billingService } from '../../services/billingService.js';
import { couponService } from '../../services/couponService.js';
import { AppError } from '../../utils/errors.js';
import type { WebhookResult } from './billing.types.js';
import { PLAN_PRICES, getPlanCatalog } from '../../config/planCatalog.js';
import { planChangeService } from './planChange.service.js';
import { billingInfoService } from './billingInfo.service.js';
import logger from '../../utils/logger.js';

const PLAN_BASE_AMOUNTS: Record<string, number> = PLAN_PRICES;

export const createCheckoutSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.createCheckoutSession(
      req.user.businessId!,
      req.body.plan,
      req.body.paymentMethod,
      req.body.couponCode
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBillingStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.getStatus(req.user.businessId!);
    let complemento: Record<string, unknown> = {};
    try {
      complemento = await billingInfoService.complementoStatus(req.user.businessId!);
    } catch (error) {
      logger.warn({ err: error, businessId: req.user.businessId }, 'Complemento do status de billing indisponível');
    }
    sendSuccess(res, { ...data, ...complemento });
  } catch (error) {
    next(error);
  }
};

export const cancelBillingSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.cancelSubscription(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const reactivateBillingSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.reactivateSubscription(req.user.businessId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getPixPaymentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.getPixPaymentStatus(
      req.user.businessId!,
      req.params['paymentId'] as string
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const handleAsaasWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await billingService.handleAsaasWebhook(req.body, req.headers as Record<string, string>) as {
      processed: boolean;
      duplicate?: boolean;
      eventType?: string;
    };
    const payload: WebhookResult = {
      received: true,
      processed: result.processed,
      duplicate: Boolean(result.duplicate),
      eventType: result.eventType ?? null,
    };
    sendSuccess(res, payload);
  } catch (error) {
    next(error);
  }
};

export const validateCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, plan } = req.body as { code: string; plan: string };
    const normalizedPlan = plan.trim().toLowerCase();
    if (!PLAN_BASE_AMOUNTS[normalizedPlan]) {
      throw new AppError('Plano inválido', 400, 'INVALID_PLAN');
    }
    // O Salão é sob consulta: a prévia usa o valor combinado com o negócio, como o checkout.
    const negocio = req.user?.businessId
      ? ((await subscriptionRepository.getBusinessBillingContext(req.user.businessId)) as Record<string, unknown> | null)
      : null;
    const baseAmount = valorMensalOuErro(negocio ?? {}, normalizedPlan as PlanId);

    const { finalAmount } = await couponService.validate(code, baseAmount) as {
      finalAmount: number;
    };

    const adjustedFinalAmount = finalAmount > 0 && finalAmount < 5 ? 5 : finalAmount;
    const adjustedDiscount = Number((baseAmount - adjustedFinalAmount).toFixed(2));

    res.json({
      valid: true,
      discount: adjustedDiscount,
      finalAmount: adjustedFinalAmount,
      originalAmount: baseAmount,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Plano e cobrança (2D) ────────────────────────────────────────────────────

export const getPlans = (_req: Request, res: Response): void => {
  sendSuccess(res, getPlanCatalog());
};

export const previewPlanChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await planChangeService.previa(req.user.businessId!, req.body.plan));
  } catch (error) {
    next(error);
  }
};

export const changePlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await planChangeService.trocar(req.user.businessId!, req.body.plan));
  } catch (error) {
    next(error);
  }
};

export const cancelPlanChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await planChangeService.cancelar(req.user.businessId!));
  } catch (error) {
    next(error);
  }
};

export const getInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ano = req.query.ano ? Number(req.query.ano) : null;
    sendSuccess(res, await billingInfoService.faturas(req.user.businessId!, ano));
  } catch (error) {
    next(error);
  }
};

export const getPaymentMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    sendSuccess(res, await billingInfoService.formaPagamento(req.user.businessId!));
  } catch (error) {
    next(error);
  }
};
