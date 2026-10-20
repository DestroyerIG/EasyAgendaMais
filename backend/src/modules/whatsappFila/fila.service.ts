import logger from '../../utils/logger.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import type { Origem } from '../whatsappInbox/inbox.types.js';
import { filaRepository as repo, type EnvioRow } from './fila.repository.js';
import { podeEnviarAgora, sortearIntervalo } from './fila.rules.js';

export interface EnfileirarInput {
  businessId: string; clientId: string | null; phone: string; body: string; origin: Origem;
  agendadoPara?: Date; loteId?: string | null;
}
export interface EnvioDto {
  id: string; clientId: string | null;
  status: 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'pulado' | 'cancelado';
  motivo: string | null; agendadoPara: string; enviadoEm: string | null;
}

export const MOTIVO_OPT_OUT = 'Pediu para não receber mensagens';
export const MOTIVO_REVOGADO = 'Consentimento revogado';
export const MOTIVO_TELEFONE = 'Telefone inválido';
export const MOTIVO_INTERROMPIDO = 'Envio interrompido; confira na conversa antes de reenviar';
export const MOTIVO_FALHA = 'O WhatsApp não aceitou o envio';

const HORA_MS = 3_600_000;
const RESERVA_MAX_MS = 10 * 60_000;

const paraDto = (r: EnvioRow): EnvioDto => ({
  id: r.id,
  clientId: r.clientId,
  status: r.status as EnvioDto['status'],
  motivo: r.reason,
  agendadoPara: r.scheduledFor.toISOString(),
  enviadoEm: r.sentAt ? r.sentAt.toISOString() : null,
});

type Resultado = 'enviado' | 'pulado' | 'falhou' | 'nada';

async function processarNegocio(businessId: string, agora: Date): Promise<Resultado> {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const [ultimo, enviadosUltimaHora] = await Promise.all([
    repo.ultimoEnviado(businessId),
    repo.contarEnviadosDesde(businessId, new Date(agora.getTime() - HORA_MS)),
  ]);
  const pode = podeEnviarAgora({
    agora, tz: timezone, enviadosUltimaHora,
    ultimo: ultimo ? { em: ultimo.sentAt, intervaloS: ultimo.intervalAfterS } : null,
  });
  if (!pode) return 'nada';

  // Desconectado: os itens continuam na fila, sem motivo.
  const conexao = await whatsappService.getStatus(businessId);
  if (conexao?.status !== 'connected') return 'nada';

  const item = await repo.proximoVencido(businessId, agora);
  if (!item) return 'nada';
  if (!(await repo.reservar(businessId, item.id, agora))) return 'nada';

  const pular = async (motivo: string): Promise<Resultado> => {
    await repo.atualizar(businessId, item.id, { status: 'pulado', reason: motivo, sentAt: null });
    return 'pulado';
  };

  // Nada foi enviado ainda: se uma checagem lançar, devolve a linha para a fila.
  let decisao: Resultado | null = null;
  try {
    if (!canonicalizePhone(item.phone)) decisao = await pular(MOTIVO_TELEFONE);
    else if (await inboxRecorder.estaEmOptOut(businessId, item.phone)) decisao = await pular(MOTIVO_OPT_OUT);
    else if (item.clientId && await repo.consentimentoRevogado(businessId, item.clientId)) decisao = await pular(MOTIVO_REVOGADO);
  } catch (err) {
    logger.warn({ err, businessId, envioId: item.id }, 'fila: checagem pré-envio falhou; item volta para a fila');
    try {
      await repo.atualizar(businessId, item.id, { status: 'na_fila', reason: null, sentAt: null });
    } catch (err2) {
      logger.warn({ err: err2, businessId, envioId: item.id }, 'fila: não consegui devolver o item para a fila');
    }
    return 'nada';
  }
  if (decisao) return decisao;

  let enviou = false;
  try {
    enviou = await sendWhatsAppMessage(item.phone, item.body, { businessId, origin: item.origin as Origem });
  } catch (err) {
    logger.warn({ err, businessId, envioId: item.id }, 'fila: erro ao enviar');
  }
  if (!enviou) {
    await repo.atualizar(businessId, item.id, { status: 'falhou', reason: MOTIVO_FALHA });
    return 'falhou';
  }
  await repo.atualizar(businessId, item.id, { status: 'enviado', sentAt: agora, intervalAfterS: sortearIntervalo() });
  return 'enviado';
}

export const filaEnvios = {
  async enfileirar(itens: EnfileirarInput[]): Promise<EnvioDto[]> {
    const saida: EnvioDto[] = [];
    for (const i of itens) {
      if (i.clientId) {
        const existente = await repo.naFilaDoCliente(i.businessId, i.clientId, i.origin);
        if (existente) { saida.push(paraDto(existente)); continue; }
      }
      const criado = await repo.criar({
        businessId: i.businessId, clientId: i.clientId, phone: i.phone, phoneKey: canonicalizePhone(i.phone),
        body: i.body, origin: i.origin, scheduledFor: i.agendadoPara ?? new Date(), batchId: i.loteId ?? null,
      });
      saida.push(paraDto(criado));
    }
    return saida;
  },

  /** Um envio por negócio a cada chamada (a rotina roda a cada minuto). */
  async processar(agora: Date = new Date()): Promise<{ enviados: number; pulados: number; falhas: number }> {
    const total = { enviados: 0, pulados: 0, falhas: 0 };
    try {
      const n = await repo.interromper(new Date(agora.getTime() - RESERVA_MAX_MS), MOTIVO_INTERROMPIDO);
      if (n > 0) logger.warn({ n }, 'fila: envios interrompidos marcados como falhou');
    } catch (err) {
      logger.warn({ err }, 'fila: reaper falhou');
    }
    const negocios = await repo.negociosComVencidos(agora);
    for (const businessId of negocios) {
      try {
        const r = await processarNegocio(businessId, agora);
        if (r === 'enviado') total.enviados++;
        else if (r === 'pulado') total.pulados++;
        else if (r === 'falhou') total.falhas++;
      } catch (err) {
        logger.warn({ err, businessId }, 'fila: falha ao processar o negócio');
      }
    }
    return total;
  },

  async ultimosPorCliente(businessId: string, origin: Origem, clientIds: string[]): Promise<Map<string, EnvioDto>> {
    const rows = await repo.recentesPorCliente(businessId, origin, clientIds);
    const mapa = new Map<string, EnvioDto>();
    for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
      if (r.clientId && !mapa.has(r.clientId)) mapa.set(r.clientId, paraDto(r));
    }
    return mapa;
  },
};
