import logger from '../../utils/logger.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { todayRepository } from '../dashboard/today.repository.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import type { Origem } from '../whatsappInbox/inbox.types.js';
import { filaRepository as repo, type EnvioRow, type NovoEnvio } from './fila.repository.js';
import { respostasRepository } from '../whatsappAutomacoes/respostas.repository.js';
import { estadoContaService } from '../conta/estadoConta.service.js';
import { ORIGENS_NA_CARENCIA } from '../../config/contingencia.js';
import {
  LIMITE_POR_HORA, PRIORIDADE_NORMAL, intervaloCampanha, limiteDoNegocio, podeEnviarAgora, previsaoDeEnvio, sortearIntervalo,
} from './fila.rules.js';

export interface EnfileirarInput {
  businessId: string; clientId: string | null; phone: string; body: string; origin: Origem;
  agendadoPara?: Date; loteId?: string | null;
  prioridade?: number; appointmentId?: string | null;
}
/** Um lote (campanha) de uma vez: mesmo negócio, origem, lote, início e prioridade para todos os itens. */
export interface LoteInput {
  businessId: string; loteId: string; origin: Origem; agendadoPara: Date; prioridade: number;
}
export interface ItemDoLote { clientId: string; phone: string; body: string }
export interface EnvioDto {
  id: string; clientId: string | null; appointmentId: string | null; loteId: string | null;
  status: 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'pulado' | 'cancelado';
  motivo: string | null; agendadoPara: string; enviadoEm: string | null;
  /** "HH:MM" no fuso do negócio; só preenchido pela listagem da Hora de voltar. */
  previstoHora: string | null;
}

export const MOTIVO_OPT_OUT = 'Pediu para não receber mensagens';
export const MOTIVO_REVOGADO = 'Consentimento revogado';
export const MOTIVO_TELEFONE = 'Telefone inválido';
export const MOTIVO_INTERROMPIDO = 'Envio interrompido; confira na conversa antes de reenviar';
export const MOTIVO_VENCIDO = 'Convite vencido';
export const MOTIVO_JA_AGENDOU = 'Cliente já agendou';
export const MOTIVO_HORARIO_PASSOU = 'Horário já passou';
export const MOTIVO_NAO_CONFIRMADO = 'Agendamento não está mais confirmado';
export const MOTIVO_JA_AVALIOU = 'Já avaliou';
export const MOTIVO_SEM_AGENDAMENTO = 'Agendamento não encontrado';
export const MOTIVO_CONFIRMACAO_FORA_VESPERA = 'Confirmação fora da véspera';
export const MOTIVO_LEMBRETE_FORA_VESPERA = 'Lembrete fora da véspera';
export const MOTIVO_FALHA = 'O WhatsApp não aceitou o envio';
export const MOTIVO_CAMPANHA_CANCELADA = 'Campanha cancelada';

const HORA_MS = 3_600_000;
const RESERVA_MAX_MS = 10 * 60_000;
const ESPERA_RESPOSTA_MS = 24 * HORA_MS;

const hhmmUtc = (d: Date) => d.toISOString().slice(11, 16);

/** O texto diz "amanhã": só vale se hoje (fuso do negócio) é a véspera do agendamento. */
function ehVespera(dataAgendamento: Date, tz: string, agora: Date): boolean {
  const vespera = new Date(dataAgendamento.getTime());
  vespera.setUTCDate(vespera.getUTCDate() - 1);
  return todayInTimezone(tz, agora) === vespera.toISOString().slice(0, 10);
}

const paraDto = (r: EnvioRow): EnvioDto => ({
  id: r.id,
  clientId: r.clientId,
  appointmentId: r.appointmentId,
  loteId: r.batchId,
  status: r.status as EnvioDto['status'],
  motivo: r.reason,
  agendadoPara: r.scheduledFor.toISOString(),
  enviadoEm: r.sentAt ? r.sentAt.toISOString() : null,
  previstoHora: null,
});

type Resultado = 'enviado' | 'pulado' | 'falhou' | 'nada';

async function processarNegocio(businessId: string, agora: Date): Promise<Resultado> {
  // Contingência: conta bloqueada não envia nada; na carência só saem as origens que cobram compromissos
  // que já existiam. Os itens não mudam de status: ficam na fila e voltam a sair quando a conta regulariza.
  // Sem conseguir ler o estado, o negócio fica de fora nesta rodada (nunca envia às cegas).
  let estado;
  try {
    estado = await estadoContaService.doNegocio(businessId, agora);
  } catch (err) {
    logger.warn({ err, businessId }, 'fila: estado da conta ilegível; negócio fica de fora nesta rodada');
    return 'nada';
  }
  if (estado.tipo === 'bloqueada') return 'nada';
  const apenasOrigens = estado.tipo === 'carencia' ? { apenasOrigens: [...ORIGENS_NA_CARENCIA] } : {};

  const { timezone } = await getBusinessScheduleSettings(businessId);
  const umaHoraAtras = new Date(agora.getTime() - HORA_MS);
  // Falha nas consultas das campanhas (inclusive tabela ainda sem migração) não para a fila:
  // as campanhas ficam de fora nesta rodada e o resto segue com o limite padrão.
  let semCampanhas = false;
  const falhaCampanhas = (err: unknown) => {
    semCampanhas = true;
    logger.warn({ err, businessId }, 'fila: consulta das campanhas falhou; campanhas ficam de fora nesta rodada');
  };
  const [ultimo, enviadosUltimaHora, emEnvioLido] = await Promise.all([
    repo.ultimoEnviado(businessId),
    repo.contarEnviadosDesde(businessId, umaHoraAtras),
    repo.cadenciasEmEnvio(businessId, agora).catch((err: unknown) => { falhaCampanhas(err); return []; }),
  ]);
  let emEnvio = emEnvioLido;

  // Lotes (campanhas) que já bateram a própria cadência na última hora esperam; o resto da fila segue.
  const excluirLotes: string[] = [];
  if (emEnvio.length) {
    try {
      const porLote = await repo.contarEnviadosDoLoteDesde(businessId, emEnvio.map((c) => c.id), umaHoraAtras);
      for (const c of emEnvio) if ((porLote.get(c.id) ?? 0) >= c.cadencia) excluirLotes.push(c.id);
    } catch (err) {
      falhaCampanhas(err);
      emEnvio = [];
    }
  }

  const pode = podeEnviarAgora({
    agora, tz: timezone, enviadosUltimaHora,
    limitePorHora: semCampanhas ? LIMITE_POR_HORA : limiteDoNegocio(emEnvio.map((c) => c.cadencia)),
    ultimo: ultimo ? { em: ultimo.sentAt, intervaloS: ultimo.intervalAfterS } : null,
  });
  if (!pode) return 'nada';

  // Desconectado: os itens continuam na fila, sem motivo.
  const conexao = await whatsappService.getStatus(businessId);
  if (conexao?.status !== 'connected') return 'nada';

  const cadenciaDoLote = new Map(emEnvio.map((c) => [c.id, c.cadencia]));
  const item = await repo.proximoVencido(businessId, agora, semCampanhas ? [] : excluirLotes, { semCampanhas, ...apenasOrigens });
  if (!item) return 'nada';
  if (!(await repo.reservar(businessId, item.id, agora))) return 'nada';

  const pular = async (motivo: string): Promise<Resultado> => {
    await repo.atualizar(businessId, item.id, { status: 'pulado', reason: motivo, sentAt: null });
    return 'pulado';
  };

  // Nada foi enviado ainda: se uma checagem lançar, devolve a linha para a fila.
  let decisao: Resultado | null = null;
  try {
    // Item de campanha cujo lote não está em envio: a campanha foi cancelada (ou voltou a rascunho) depois
    // que o item entrou. Item vencido e pendente de campanha agendada já iniciada sempre aparece em emEnvio.
    if (item.origin === 'campanha' && item.batchId && !cadenciaDoLote.has(item.batchId)) decisao = await pular(MOTIVO_CAMPANHA_CANCELADA);
    else if (!canonicalizePhone(item.phone)) decisao = await pular(MOTIVO_TELEFONE);
    // Versão estrita: se não der para ler o SAIR, lança e o item volta para a fila (nunca envia às cegas).
    else if (await inboxRecorder.estaEmOptOutOuFalha(businessId, item.phone)) decisao = await pular(MOTIVO_OPT_OUT);
    else if (item.clientId && await repo.consentimentoRevogado(businessId, item.clientId)) decisao = await pular(MOTIVO_REVOGADO);
    else if (item.origin === 'retorno') {
      const hoje = todayInTimezone(timezone, agora);
      if (todayInTimezone(timezone, item.createdAt) !== hoje) decisao = await pular(MOTIVO_VENCIDO);
      else if (item.clientId && (await todayRepository.clientesComAgendamentoFuturo(businessId, hoje, agora, item.clientId)).has(item.clientId)) {
        decisao = await pular(MOTIVO_JA_AGENDOU);
      }
    } else if ((item.origin === 'confirmacao' || item.origin === 'lembrete' || item.origin === 'avaliacao') && item.appointmentId) {
      const ag = await repo.agendamentoParaEnvio(businessId, item.appointmentId);
      // Confirmação e lembrete na véspera dizem "amanhã": só saem na véspera de um agendamento ainda confirmado.
      if (item.origin === 'confirmacao' || item.origin === 'lembrete') {
        if (!ag || ag.status !== 'confirmado') decisao = await pular(MOTIVO_NAO_CONFIRMADO);
        else if (zonedToUtc(ag.date.toISOString().slice(0, 10), hhmmUtc(ag.time), timezone) <= agora) decisao = await pular(MOTIVO_HORARIO_PASSOU);
        else if (!ehVespera(ag.date, timezone, agora)) {
          decisao = await pular(item.origin === 'confirmacao' ? MOTIVO_CONFIRMACAO_FORA_VESPERA : MOTIVO_LEMBRETE_FORA_VESPERA);
          if (item.origin === 'lembrete') await repo.desmarcarLembrete(businessId, item.appointmentId);
        }
      } else if (!ag) decisao = await pular(MOTIVO_SEM_AGENDAMENTO);
      else if (ag.jaAvaliou) decisao = await pular(MOTIVO_JA_AVALIOU);
    }
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
    // Lembrete na véspera que não saiu: a rotina tenta de novo e os números não contam como lembrado.
    if (item.origin === 'lembrete' && item.appointmentId) {
      try {
        await repo.desmarcarLembrete(businessId, item.appointmentId);
      } catch (err) {
        logger.warn({ err, businessId, envioId: item.id }, 'fila: não consegui desmarcar o lembrete');
      }
    }
    return 'falhou';
  }
  // Item de campanha em envio: o intervalo segue a cadência escolhida; o resto mantém 45–90 s.
  const cadencia = item.origin === 'campanha' && item.batchId ? cadenciaDoLote.get(item.batchId) : undefined;
  const intervalAfterS = cadencia ? intervaloCampanha(cadencia) : sortearIntervalo();
  await repo.atualizar(businessId, item.id, { status: 'enviado', sentAt: new Date(), intervalAfterS });
  if ((item.origin === 'confirmacao' || item.origin === 'avaliacao') && item.appointmentId && item.phoneKey) {
    try {
      await respostasRepository.registrar({
        businessId, phoneKey: item.phoneKey, tipo: item.origin, appointmentId: item.appointmentId,
        expiresAt: new Date(Date.now() + ESPERA_RESPOSTA_MS),
      });
    } catch (err) {
      logger.warn({ err, businessId, envioId: item.id }, 'fila: não consegui registrar a espera de resposta');
    }
  }
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
      try {
        const criado = await repo.criar({
          businessId: i.businessId, clientId: i.clientId, phone: i.phone, phoneKey: canonicalizePhone(i.phone),
          body: i.body, origin: i.origin, scheduledFor: i.agendadoPara ?? new Date(), batchId: i.loteId ?? null,
          priority: i.prioridade ?? PRIORIDADE_NORMAL, appointmentId: i.appointmentId ?? null,
        });
        saida.push(paraDto(criado));
      } catch (err) {
        // Índice único parcial (cliente já ativa na fila): outra requisição criou primeiro.
        const existente = (err as { code?: string }).code === 'P2002' && i.clientId
          ? await repo.naFilaDoCliente(i.businessId, i.clientId, i.origin)
          : null;
        if (!existente) throw err;
        saida.push(paraDto(existente));
      }
    }
    return saida;
  },

  /**
   * Lote de campanha em massa: um prefetch de quem já está ativa na fila com a mesma origem, um createMany
   * (ON CONFLICT DO NOTHING cobre a corrida com o índice único parcial) e uma leitura do lote.
   * Devolve só os itens ativos deste lote; quem ficou de fora já estava na fila de outro.
   */
  async enfileirarLote(lote: LoteInput, itens: ItemDoLote[]): Promise<EnvioDto[]> {
    const ativas = await repo.clientesAtivosDaOrigem(lote.businessId, lote.origin);
    // created_at explícito e crescente: num INSERT só todas teriam o mesmo, e a fila desempata por ele.
    const base = Date.now();
    const vistas = new Set<string>();
    // `createdAt` cresce 1 ms por linha para fixar a ordem de saída; as últimas ficam alguns segundos
    // no futuro, então não filtrar envios por `createdAt <= agora`.
    const linhas: Array<NovoEnvio & { createdAt: Date }> = [];
    for (const i of itens) {
      if (ativas.has(i.clientId) || vistas.has(i.clientId)) continue;
      vistas.add(i.clientId);
      linhas.push({
        businessId: lote.businessId, clientId: i.clientId, phone: i.phone, phoneKey: canonicalizePhone(i.phone),
        body: i.body, origin: lote.origin, scheduledFor: lote.agendadoPara, batchId: lote.loteId,
        priority: lote.prioridade, appointmentId: null, createdAt: new Date(base + linhas.length),
      });
    }
    if (!linhas.length) return [];
    await repo.criarVarios(linhas);
    return (await repo.ativosDoLote(lote.businessId, lote.loteId)).map(paraDto);
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

  /** Previsão de saída de cada item na fila do negócio (posição, último envio e janela no fuso do negócio). */
  async previsoes(businessId: string, tz: string, agora: Date = new Date()): Promise<Map<string, Date>> {
    const [ids, ultimo] = await Promise.all([repo.idsNaFila(businessId), repo.ultimoEnviado(businessId)]);
    const ult = ultimo ? { em: ultimo.sentAt, intervaloS: ultimo.intervalAfterS } : null;
    return new Map(ids.map((id, posicao) => [id, previsaoDeEnvio({ agora, tz, posicao, ultimo: ult })]));
  },

  async ultimosPorCliente(businessId: string, origin: Origem, clientIds: string[]): Promise<Map<string, EnvioDto>> {
    const rows = await repo.recentesPorCliente(businessId, origin, clientIds);
    const mapa = new Map<string, EnvioDto>();
    for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
      if (r.clientId && !mapa.has(r.clientId)) mapa.set(r.clientId, paraDto(r));
    }
    return mapa;
  },

  /** Data do último envio com status `enviado` de cada cliente (ignora falhas e pulos posteriores). */
  async ultimosEnviadosPorCliente(businessId: string, origin: Origem, clientIds: string[]): Promise<Map<string, Date>> {
    const rows = await repo.enviadosPorCliente(businessId, origin, clientIds);
    const mapa = new Map<string, Date>();
    for (const r of rows) {
      if (!r.clientId || !r.sentAt) continue;
      const atual = mapa.get(r.clientId);
      if (!atual || r.sentAt > atual) mapa.set(r.clientId, r.sentAt);
    }
    return mapa;
  },
};
