import logger from '../../utils/logger.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { appointmentsService } from '../appointments/appointments.service.js';
import { automacoes } from './automacoes.service.js';
import { notaAvaliacao, respostaConfirmacao, TEXTO_REAGENDAR } from './automacoes.rules.js';
import { respostasRepository, type RespostaPendente } from './respostas.repository.js';

export const TEXTO_CONFIRMADO = 'Obrigada! Seu horário está confirmado ✨';
export const TEXTO_CANCELADO = 'Tudo bem! Liberamos seu horário e a equipe já vai falar com você para remarcar.';
export const TEXTO_NOTA = 'Obrigada pela nota!';
export const TEXTO_GOOGLE = (link: string) => `Que bom que gostou! Se puder, deixe sua avaliação no Google: ${link}`;

interface Entrada {
  businessId: string; phone: string; texto: string | null; instanceName?: string;
  /** Conversa está com a equipe: a mensagem é para ela, não para a automação. */
  atendimentoHumano?: boolean;
  /** Última atividade da sessão ativa do robô (null/ausente = sem sessão ativa). */
  sessaoRoboDesde?: Date | null;
}

const enviar = (i: Entrada, texto: string) =>
  sendWhatsAppMessage(i.phone, texto, { businessId: i.businessId, instanceName: i.instanceName, origin: 'sistema' });

async function tratarConfirmacao(i: Entrada, espera: RespostaPendente, agora: Date): Promise<boolean> {
  const r = respostaConfirmacao(i.texto ?? '');
  if (!r) return false;
  const status = await respostasRepository.statusDoAgendamento(espera.appointmentId, i.businessId);
  if (status !== 'confirmado') {
    await respostasRepository.apagar(espera.id);
    return false;
  }
  if (r === 'sim') {
    const marcou = await respostasRepository.marcarConfirmadoPeloCliente(espera.appointmentId, i.businessId, agora);
    await respostasRepository.apagar(espera.id);
    if (!marcou) return false;
    await enviar(i, TEXTO_CONFIRMADO);
    return true;
  } else {
    await appointmentsService.updateStatus(espera.appointmentId, i.businessId, 'cancelado');
    await respostasRepository.apagar(espera.id);
    await inboxRecorder.pedirAtendimentoHumano(i.businessId, i.phone);
    await inboxRecorder.avisoDoSistema(i.businessId, i.phone, TEXTO_REAGENDAR);
    await enviar(i, TEXTO_CANCELADO);
  }
  return true;
}

async function tratarAvaliacao(i: Entrada, espera: RespostaPendente): Promise<boolean> {
  const nota = notaAvaliacao(i.texto ?? '');
  if (!nota) return false;
  await respostasRepository.salvarNota({ businessId: i.businessId, appointmentId: espera.appointmentId, rating: nota });
  // A nota já está gravada: apagar a espera antes dos envios evita repetir o agradecimento numa nova resposta.
  await respostasRepository.apagar(espera.id);
  const link = nota === 5
    ? await automacoes.obter(i.businessId, 'avaliacao').then((r) => r.config.linkGoogle).catch(() => null)
    : null;
  await enviar(i, TEXTO_NOTA);
  if (link) await enviar(i, TEXTO_GOOGLE(link));
  if (nota <= 2) {
    await inboxRecorder.pedirAtendimentoHumano(i.businessId, i.phone);
    await inboxRecorder.avisoDoSistema(i.businessId, i.phone, `Avaliação baixa (${nota}) — vale falar com ela`);
  }
  return true;
}

/**
 * A espera só vale se a última saída para o número foi a própria automação: robô, equipe
 * ou outra automação falando depois dela invalidam a espera (o "1"/"2" passa a ser para eles).
 */
async function esperasValidas(i: Entrada, chave: string, agora: Date): Promise<RespostaPendente[]> {
  const validas: RespostaPendente[] = [];
  for (const e of await respostasRepository.pendentes(i.businessId, chave, agora)) {
    if (i.sessaoRoboDesde && i.sessaoRoboDesde > e.createdAt) continue;
    if (await respostasRepository.houveSaidaDepois(i.businessId, chave, e.createdAt)) {
      await respostasRepository.apagar(e.id);
      continue;
    }
    validas.push(e);
  }
  return validas;
}

export const respostas = {
  /** true quando a mensagem foi consumida como resposta de uma automação. */
  async tratar(i: Entrada): Promise<boolean> {
    try {
      if (i.atendimentoHumano) return false;
      const chave = canonicalizePhone(i.phone);
      if (!chave) return false;
      const agora = new Date();
      const esperas = await esperasValidas(i, chave, agora);
      // Confirmação pendente tem prioridade: "1"/"2" é a resposta dela, nunca uma nota.
      const confirmacao = esperas.find((e) => e.tipo === 'confirmacao');
      if (confirmacao && respostaConfirmacao(i.texto ?? '')) return await tratarConfirmacao(i, confirmacao, agora);
      const avaliacao = esperas.find((e) => e.tipo === 'avaliacao');
      if (avaliacao) return await tratarAvaliacao(i, avaliacao);
      return false;
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'automacoes: tratar resposta falhou');
      return false;
    }
  },
};
