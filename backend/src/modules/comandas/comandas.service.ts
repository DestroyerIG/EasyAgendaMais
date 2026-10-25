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
import { automacoesGatilhos } from '../whatsappAutomacoes/gatilhos.service.js';
import { clubeService } from '../clube/clube.service.js';
import type { CoberturaComandaDto, ComandaDetailDto, NewExtraItem, SaveComandaInput, PaymentMethod } from './comandas.types.js';

type ComandaRow = NonNullable<Awaited<ReturnType<typeof comandasRepository.findComandaById>>>;

const num = (v: unknown) => Number(v ?? 0);
/** Quanto o fechamento espera o comprovante antes de responder. */
export const RECEIPT_TIMEOUT_MS = 8000;
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

/** Contrato de clube/pacote que cobre o serviço principal hoje, e o desconto de sócia nos extras. */
async function coberturaDo(c: { businessId: string; appointment: ComandaRow['appointment'] }) {
  return clubeService.cobertura(c.businessId, {
    clientId: c.appointment.client.id, serviceId: c.appointment.service.id,
    professionalId: c.appointment.professional.id, data: isoDate(c.appointment.date),
  });
}

async function montarDto(c: ComandaRow): Promise<ComandaDetailDto> {
  const negocio = await commissionSettings.get(c.businessId);
  const commission = resolveCommission(c.appointment.professional, negocio);
  const fechada = c.status === 'fechada';
  const principal = c.items.find((i) => i.isMain);
  let cobertura: CoberturaComandaDto;
  let cobertoId: string | null = null;
  if (fechada) {
    cobertoId = principal?.coberturaContratoId ?? null;
    const k = principal?.coberturaContrato;
    cobertura = {
      disponivel: cobertoId && k ? {
        contratoId: cobertoId, nome: k.oferta.nome, tipo: k.tipo as 'clube' | 'pacote', sessao: null,
        de: k.tipo === 'clube' ? k.sessoesPorCiclo : k.totalSessoes, valorSessao: num(principal?.valorCoberto),
      } : null,
      bloqueio: null, usando: !!cobertoId, descontoSociaPct: 0,
    };
  } else {
    const { escolhida, descontoPct } = await coberturaDo(c);
    const ok = escolhida?.ok ? escolhida : null;
    // Só vale a cobertura gravada se o contrato ainda cobre hoje; o próximo salvamento corrige o item.
    cobertoId = ok && principal?.coberturaContratoId === ok.contratoId ? ok.contratoId : null;
    cobertura = {
      disponivel: ok ? { contratoId: ok.contratoId, nome: ok.nome, tipo: ok.tipo, sessao: ok.sessao, de: ok.de, valorSessao: ok.valorSessao } : null,
      bloqueio: escolhida && !escolhida.ok ? { nome: escolhida.nome, motivo: escolhida.motivo } : null,
      usando: !!cobertoId, descontoSociaPct: descontoPct,
    };
  }
  const items = c.items.map((i) => ({
    id: i.id, kind: i.kind as 'servico' | 'produto', refId: i.serviceId ?? i.productId, name: i.name,
    unitPrice: num(i.unitPrice), quantity: i.quantity, durationMinutes: i.durationMinutes, isMain: i.isMain,
    coveredValue: i.isMain && cobertoId ? num(i.valorCoberto) : null,
  }));
  const pctGravado = (kind: 'servico' | 'produto') =>
    c.items.find((i) => i.kind === kind && i.commissionPct != null)?.commissionPct;
  // Comanda fechada mostra o que foi gravado, não o que as configurações dizem hoje.
  if (fechada) {
    commission.servicePct = num(pctGravado('servico') ?? commission.servicePct);
    commission.productPct = num(pctGravado('produto') ?? commission.productPct);
  }
  const depositAvailable = fechada && c.depositApplied != null ? num(c.depositApplied) : num(c.appointment.depositAmount);
  // discount_amount guarda o desconto total (manual + sócia); a tela edita só o manual.
  const descontoManual = Math.max(0, Math.round((num(c.discountAmount) - num(c.descontoClube)) * 100) / 100);
  const calc = calcularComanda({
    items, depositAvailable, discount: fechada ? num(c.discountAmount) : descontoManual, tip: num(c.tipAmount),
    serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
    memberDiscountPct: cobertura.descontoSociaPct,
  });
  if (fechada) {
    calc.memberDiscount = num(c.descontoClube);
    if (c.servicesTotal != null) calc.servicesTotal = num(c.servicesTotal);
    if (c.productsTotal != null) calc.productsTotal = num(c.productsTotal);
    if (c.depositApplied != null) calc.depositApplied = num(c.depositApplied);
    if (c.totalCharged != null) calc.totalCharged = num(c.totalCharged);
    if (c.commissionTotal != null) calc.commissionTotal = num(c.commissionTotal);
  }
  return {
    id: c.id, number: c.number, status: c.status as 'rascunho' | 'fechada',
    appointment: {
      id: c.appointment.id, date: isoDate(c.appointment.date), time: hhmm(c.appointment.time),
      status: c.appointment.status, source: c.appointment.source,
    },
    client: c.appointment.client,
    professional: { id: c.appointment.professional.id, name: c.appointment.professional.name },
    items, depositAvailable,
    discount: descontoManual, tip: calc.tip, paymentMethod: (c.paymentMethod as PaymentMethod | null) ?? null,
    commission, cobertura, calc,
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
    const nova = await carregar(criada.id, businessId);
    const { escolhida } = await coberturaDo(nova);
    if (escolhida?.ok && !nova.items.find((i) => i.isMain)?.coberturaContratoId) {
      await comandasRepository.definirCobertura(nova.id, { coberturaContratoId: escolhida.contratoId, valorCoberto: escolhida.valorSessao });
      return montarDto(await carregar(criada.id, businessId));
    }
    return montarDto(nova);
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
    const { escolhida, descontoPct } = await coberturaDo(c);
    const cobre = (input.usarCobertura ?? true) && escolhida?.ok ? escolhida : null;
    const principal = c.items.filter((i) => i.isMain).map((i) => ({
      kind: 'servico' as const, unitPrice: num(i.unitPrice), quantity: i.quantity, coveredValue: cobre ? cobre.valorSessao : null,
    }));
    const calc = calcularComanda({
      items: [...principal, ...extras.map((e) => ({ kind: e.kind, unitPrice: e.unitPrice, quantity: e.quantity }))],
      depositAvailable: num(c.appointment.depositAmount), discount: input.discount, tip: input.tip,
      serviceCommissionPct: commission.servicePct, productCommissionPct: commission.productPct,
      memberDiscountPct: descontoPct,
    });
    const gravou = await comandasRepository.saveDraft(id, businessId, extras, {
      servicesTotal: calc.servicesTotal, productsTotal: calc.productsTotal, depositApplied: calc.depositApplied,
      discountAmount: calc.discount, tipAmount: calc.tip, totalCharged: calc.totalCharged,
      commissionTotal: calc.commissionTotal, paymentMethod: input.paymentMethod, descontoClube: calc.memberDiscount,
    }, { coberturaContratoId: cobre?.contratoId ?? null, valorCoberto: cobre?.valorSessao ?? 0 });
    if (!gravou) throw new ConflictError('Esta comanda já foi fechada');
    return montarDto(await carregar(id, businessId));
  },

  async close(id: string, businessId: string, userId: string, input: SaveComandaInput): Promise<ComandaDetailDto> {
    const salvo = await comandasService.save(id, businessId, input);
    if (salvo.calc.totalCharged > 0 && !input.paymentMethod) {
      throw new ValidationError('Escolha a forma de pagamento');
    }
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const caixa = await comandasRepository.findCashSession(businessId, todayInTimezone(timezone));
    if (!caixa) throw new AppError('Abra o caixa de hoje para fechar a comanda', 409, 'CASH_CLOSED');
    if (caixa.closedAt) throw new AppError('O caixa de hoje já foi fechado', 409, 'CASH_ALREADY_CLOSED');

    const c = await carregar(id, businessId);
    if (!['confirmado', 'em_atendimento'].includes(c.appointment.status)) {
      throw new ConflictError('Este agendamento não pode mais ser concluído');
    }
    // Totais calculados direto da entrada validada (não do que foi relido), para o fechamento gravar exatamente o que foi confirmado.
    const principal = c.items.find((i) => i.isMain);
    const contratoId = principal?.coberturaContratoId ?? null;
    const calc = calcularComanda({
      items: c.items.map((i) => ({
        kind: i.kind as 'servico' | 'produto', unitPrice: num(i.unitPrice), quantity: i.quantity,
        coveredValue: i.coberturaContratoId ? num(i.valorCoberto) : null,
      })),
      depositAvailable: num(c.appointment.depositAmount), discount: input.discount, tip: input.tip,
      serviceCommissionPct: salvo.commission.servicePct, productCommissionPct: salvo.commission.productPct,
      memberDiscountPct: salvo.cobertura.descontoSociaPct,
    });
    const ok = await comandasRepository.closeComandaTx({
      comandaId: id, businessId, userId, cashSessionId: caixa.id,
      appointmentId: c.appointment.id, appointmentDate: c.appointment.date,
      paymentMethod: input.paymentMethod,
      servicePct: salvo.commission.servicePct, productPct: salvo.commission.productPct, calc,
      cobertura: contratoId && principal ? {
        contratoId, comandaItemId: principal.id, clientId: c.appointment.client.id, serviceId: c.appointment.service.id,
        professionalId: c.appointment.professional.id, data: isoDate(c.appointment.date),
      } : null,
    });
    if (!ok) throw new ConflictError('Esta comanda já foi fechada');

    void automacoesGatilhos.aoFecharComanda(businessId, c.appointment.id, new Date())
      .catch((err) => logger.warn({ err, comandaId: id }, 'Gatilho da avaliação falhou'));

    if (salvo.whatsappConnected) {
      // O fechamento já foi gravado: um WhatsApp lento não pode virar "erro ao fechar".
      // Se passar do prazo, o envio segue em segundo plano e marca receipt_sent_at quando concluir.
      const envio = enviarComprovante(businessId, id, { ...salvo, calc }, input.paymentMethod)
        .catch((error) => { logger.warn({ err: error, comandaId: id }, 'Comprovante da comanda não enviado'); });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const prazo = new Promise<'prazo'>((resolve) => { timer = setTimeout(() => resolve('prazo'), RECEIPT_TIMEOUT_MS); });
      const r = await Promise.race([envio, prazo]);
      if (timer) clearTimeout(timer);
      if (r === 'prazo') logger.warn({ comandaId: id }, 'Comprovante da comanda ainda enviando; fechamento respondido sem esperar');
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
