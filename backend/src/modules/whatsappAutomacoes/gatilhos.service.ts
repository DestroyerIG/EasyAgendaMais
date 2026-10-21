import logger from '../../utils/logger.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { filaEnvios } from '../whatsappFila/fila.service.js';
import { PRIORIDADE_NORMAL } from '../whatsappFila/fila.rules.js';
import { automacoes } from './automacoes.service.js';
import { entradaCompativel, renderizarTexto } from './automacoes.rules.js';
import { gatilhosRepository as repo } from './gatilhos.repository.js';

const ANTECEDENCIA_MIN = 60;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "hoje", "amanhã" ou "qui, 23/10". */
function dataAmigavel(ymd: string, hoje: string): string {
  if (ymd === hoje) return 'hoje';
  if (ymd === somarDias(hoje, 1)) return 'amanhã';
  const [, m, d] = ymd.split('-');
  return `${SEMANA[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]}, ${d}/${m}`;
}

export const automacoesGatilhos = {
  async aoCancelar(businessId: string, appointmentId: string, agora: Date = new Date()): Promise<number> {
    const regra = await automacoes.obter(businessId, 'lista_espera');
    if (!regra.ativa) return 0;
    const vaga = await repo.vaga(businessId, appointmentId);
    if (!vaga) return 0;
    const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
    const inicio = zonedToUtc(vaga.data, vaga.hora, tz);
    if (inicio.getTime() - agora.getTime() < ANTECEDENCIA_MIN * 60_000) return 0;

    const entradas = (await repo.entradasAguardando(businessId))
      .filter((e) => entradaCompativel(e, vaga))
      .slice(0, regra.config.quantas);
    if (entradas.length === 0) return 0;

    const [negocio, servico] = await Promise.all([repo.negocio(businessId), repo.nomeServico(businessId, vaga.serviceId)]);
    const base = process.env.FRONTEND_URL;
    const link = negocio.slug && base ? `${base}/agendar/${negocio.slug}` : null;
    const data = dataAmigavel(vaga.data, todayInTimezone(tz, agora));

    let avisadas = 0;
    for (const e of entradas) {
      try {
        if (await inboxRecorder.estaEmOptOut(businessId, e.phone)) continue;
        // Reserva a entrada antes de enviar: dois cancelamentos ao mesmo tempo não avisam a mesma pessoa duas vezes.
        if (!(await repo.marcarOferecida(e.id, businessId, agora))) continue;
        const texto = renderizarTexto(regra.texto, {
          primeiro_nome: primeiroNome(e.nome), data, horario: vaga.hora, profissional: vaga.profissional, servico, link,
        });
        const ok = await sendWhatsAppMessage(e.phone, texto, { businessId, origin: 'lista_espera' });
        if (!ok) { await repo.desfazerOferta(e.id, businessId); continue; }
        avisadas += 1;
      } catch (err) {
        logger.warn({ err, businessId, entradaId: e.id }, 'automacoes: aviso da lista de espera falhou');
      }
    }
    return avisadas;
  },

  async aoCriarReservaComSinal(
    businessId: string,
    _appointmentId: string,
    d: { phone: string; nome: string; servico: string; valorSinal: number; pixPayload: string; data: string; horario: string; toleranciaMin: number },
  ): Promise<boolean> {
    const regra = await automacoes.obter(businessId, 'sinal_pix');
    if (!regra.ativa) return false;
    if ((await whatsappService.getStatus(businessId))?.status !== 'connected') return false;
    const texto = renderizarTexto(regra.texto, {
      nome: d.nome, servico: d.servico, valor_sinal: d.valorSinal.toFixed(2).replace('.', ','),
      pix_copia_e_cola: d.pixPayload, prazo: String(d.toleranciaMin), horario: d.horario, data: d.data,
    });
    return sendWhatsAppMessage(d.phone, texto, { businessId, origin: 'sinal_pix' });
  },

  async toleranciaSinal(businessId: string): Promise<number> {
    try {
      return (await automacoes.obter(businessId, 'sinal_pix')).config.toleranciaMin;
    } catch (err) {
      logger.warn({ err, businessId }, 'gatilhos: toleranciaSinal falhou; usando 15 min');
      return 15;
    }
  },

  async aoFecharComanda(businessId: string, appointmentId: string, fechadaEm: Date): Promise<void> {
    const regra = await automacoes.obter(businessId, 'avaliacao');
    if (!regra.ativa) return;
    if (await repo.temAvaliacao(appointmentId)) return;
    const ag = await repo.agendamentoParaAvaliacao(businessId, appointmentId);
    if (!ag) return;
    const negocio = await repo.negocio(businessId);
    const texto = renderizarTexto(regra.texto, {
      primeiro_nome: primeiroNome(ag.nome), negocio: negocio.nome, servico: ag.servico, link_avaliacao: regra.config.linkGoogle,
    });
    await filaEnvios.enfileirar([{
      businessId, clientId: ag.clientId, phone: ag.phone, body: texto, origin: 'avaliacao',
      agendadoPara: new Date(fechadaEm.getTime() + regra.config.horas * 3_600_000),
      prioridade: PRIORIDADE_NORMAL, appointmentId,
    }]);
  },
};
