import { prisma } from '../../config/prisma.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { productsRepository } from '../products/products.repository.js';
import { calcularComanda } from './comandaMath.js';
import { commissionSettings, resolveCommission } from './commissionSettings.js';
import { comandasRepository } from './comandas.repository.js';
import { sendComandaReceipt } from './receipt.js';
import type { ComandaDetailDto, NewExtraItem, SaveComandaInput, PaymentMethod } from './comandas.types.js';

type ComandaRow = NonNullable<Awaited<ReturnType<typeof comandasRepository.findComandaById>>>;

const num = (v: unknown) => Number(v ?? 0);
const isoDate = (d: Date) => d.toISOString().substring(0, 10);
const hhmm = (d: Date) => d.toISOString().substring(11, 16);

async function whatsappConectado(businessId: string): Promise<boolean> {
  try {
    return (await whatsappService.getStatus(businessId)).status === 'connected';
  } catch {
    return false;
  }
}

async function nomeDoNegocio(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  return b?.name ?? '';
}

async function montarDto(c: ComandaRow): Promise<ComandaDetailDto> {
  const negocio = await commissionSettings.get(c.businessId);
  const commission = resolveCommission(c.appointment.professional, negocio);
  const items = c.items.map((i) => ({
    id: i.id, kind: i.kind as 'servico' | 'produto', refId: i.serviceId ?? i.productId, name: i.name,
    unitPrice: num(i.unitPrice), quantity: i.quantity, durationMinutes: i.durationMinutes, isMain: i.isMain,
  }));
  const depositAvailable = num(c.appointment.depositAmount);
  const calc = calcularComanda({
    items, depositAvailable, discount: num(c.discountAmount), tip: num(c.tipAmount),
    serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
  });
  return {
    id: c.id, number: c.number, status: c.status as 'rascunho' | 'fechada',
    appointment: {
      id: c.appointment.id, date: isoDate(c.appointment.date), time: hhmm(c.appointment.time),
      status: c.appointment.status, source: c.appointment.source,
    },
    client: c.appointment.client,
    professional: { id: c.appointment.professional.id, name: c.appointment.professional.name },
    items, depositAvailable,
    discount: calc.discount, tip: calc.tip, paymentMethod: (c.paymentMethod as PaymentMethod | null) ?? null,
    commission, calc,
    whatsappConnected: await whatsappConectado(c.businessId),
    closedAt: c.closedAt ? c.closedAt.toISOString() : null,
    receiptSentAt: c.receiptSentAt ? c.receiptSentAt.toISOString() : null,
  };
}

async function carregar(id: string, businessId: string): Promise<ComandaRow> {
  const c = await comandasRepository.findComandaById(id, businessId);
  if (!c) throw new NotFoundError('Comanda');
  return c;
}

async function resolverExtras(businessId: string, extras: SaveComandaInput['extras']): Promise<NewExtraItem[]> {
  const idsServ = extras.filter((e) => e.kind === 'servico').map((e) => e.id);
  const idsProd = extras.filter((e) => e.kind === 'produto').map((e) => e.id);
  const [servicos, produtos] = await Promise.all([
    comandasRepository.findActiveServicesByIds(businessId, idsServ),
    idsProd.length ? productsRepository.findActiveByIds(businessId, idsProd) : Promise.resolve([]),
  ]);
  return extras.map((e): NewExtraItem => {
    if (e.kind === 'servico') {
      const s = servicos.find((x) => x.id === e.id);
      if (!s) throw new ValidationError('Item não encontrado', [`Serviço ${e.id} não existe ou está inativo`]);
      return { kind: 'servico', serviceId: s.id, productId: null, name: s.name, unitPrice: num(s.price), quantity: e.quantity, durationMinutes: s.durationMinutes };
    }
    const p = produtos.find((x) => x.id === e.id);
    if (!p) throw new ValidationError('Item não encontrado', [`Produto ${e.id} não existe ou está inativo`]);
    return { kind: 'produto', serviceId: null, productId: p.id, name: p.name, unitPrice: num(p.price), quantity: e.quantity, durationMinutes: null };
  });
}

async function enviarComprovante(businessId: string, comandaId: string, dto: ComandaDetailDto, paymentMethod: PaymentMethod | null) {
  const enviado = await sendComandaReceipt(businessId, dto.client.phone, {
    negocio: await nomeDoNegocio(businessId), numero: dto.number, cliente: dto.client.name,
    profissional: dto.professional.name, itens: dto.items, calc: dto.calc, paymentMethod,
  });
  if (enviado) await comandasRepository.markReceiptSent(comandaId);
  return enviado;
}

export const comandasService = {
  async open(appointmentId: string, businessId: string): Promise<ComandaDetailDto> {
    const appt = await comandasRepository.findAppointmentForComanda(appointmentId, businessId);
    if (!appt) throw new NotFoundError('Agendamento');
    const existente = await comandasRepository.findComandaByAppointment(appointmentId, businessId);
    if (existente) return montarDto(await carregar(existente.id, businessId));
    if (!['confirmado', 'em_atendimento'].includes(appt.status)) {
      throw new ConflictError('Este agendamento não pode receber comanda');
    }
    const criada = await comandasRepository.createComanda(businessId, appt, { startAppointment: appt.status === 'confirmado' });
    return montarDto(await carregar(criada.id, businessId));
  },

  async get(id: string, businessId: string): Promise<ComandaDetailDto> {
    return montarDto(await carregar(id, businessId));
  },

  async save(id: string, businessId: string, input: SaveComandaInput): Promise<ComandaDetailDto> {
    const c = await carregar(id, businessId);
    if (c.status !== 'rascunho') throw new ConflictError('Esta comanda já foi fechada');
    const extras = await resolverExtras(businessId, input.extras);
    const negocio = await commissionSettings.get(businessId);
    const commission = resolveCommission(c.appointment.professional, negocio);
    const principal = c.items.filter((i) => i.isMain).map((i) => ({ kind: 'servico' as const, unitPrice: num(i.unitPrice), quantity: i.quantity }));
    const calc = calcularComanda({
      items: [...principal, ...extras.map((e) => ({ kind: e.kind, unitPrice: e.unitPrice, quantity: e.quantity }))],
      depositAvailable: num(c.appointment.depositAmount), discount: input.discount, tip: input.tip,
      serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
    });
    await comandasRepository.replaceExtras(id, extras);
    await comandasRepository.updateDraftTotals(id, {
      servicesTotal: calc.servicesTotal, productsTotal: calc.productsTotal, depositApplied: calc.depositApplied,
      discountAmount: calc.discount, tipAmount: calc.tip, totalCharged: calc.totalCharged,
      commissionTotal: calc.commissionTotal, paymentMethod: input.paymentMethod,
    });
    return montarDto(await carregar(id, businessId));
  },

  async close(id: string, businessId: string, userId: string, input: SaveComandaInput): Promise<ComandaDetailDto> {
    const salvo = await comandasService.save(id, businessId, input);
    if (salvo.calc.totalCharged > 0 && !input.paymentMethod) {
      throw new ValidationError('Escolha a forma de pagamento');
    }
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const caixa = await comandasRepository.findOpenCashSession(businessId, todayInTimezone(timezone));
    if (!caixa) throw new AppError('Abra o caixa de hoje para fechar a comanda', 409, 'CASH_CLOSED');

    const c = await carregar(id, businessId);
    // Totais calculados direto da entrada validada (não do que foi relido), para o fechamento gravar exatamente o que foi confirmado.
    const calc = calcularComanda({
      items: c.items.map((i) => ({ kind: i.kind as 'servico' | 'produto', unitPrice: num(i.unitPrice), quantity: i.quantity })),
      depositAvailable: num(c.appointment.depositAmount), discount: input.discount, tip: input.tip,
      serviceCommissionPct: salvo.commission.servicePct, productCommissionPct: salvo.commission.productPct,
    });
    const ok = await comandasRepository.closeComandaTx({
      comandaId: id, businessId, userId, cashSessionId: caixa.id,
      appointmentId: c.appointment.id, appointmentDate: c.appointment.date,
      paymentMethod: input.paymentMethod,
      servicePct: salvo.commission.servicePct, productPct: salvo.commission.productPct, calc,
      items: c.items.map((i) => ({ id: i.id, kind: i.kind as 'servico' | 'produto', lineTotal: num(i.unitPrice) * i.quantity })),
    });
    if (!ok) throw new ConflictError('Esta comanda já foi fechada');

    if (salvo.whatsappConnected) {
      try {
        await enviarComprovante(businessId, id, { ...salvo, calc }, input.paymentMethod);
      } catch (error) {
        logger.warn({ err: error, comandaId: id }, 'Comprovante da comanda não enviado');
      }
    }
    return montarDto(await carregar(id, businessId));
  },

  async resendReceipt(id: string, businessId: string): Promise<{ sent: boolean }> {
    const dto = await montarDto(await carregar(id, businessId));
    if (dto.status !== 'fechada') throw new ConflictError('Feche a comanda antes de enviar o comprovante');
    return { sent: await enviarComprovante(businessId, id, dto, dto.paymentMethod) };
  },

  async shortcuts(businessId: string) {
    return (await comandasRepository.topExtras(businessId, 90, 3)).map((r) => ({ kind: r.kind, id: r.id, name: r.name, price: num(r.price) }));
  },
};
