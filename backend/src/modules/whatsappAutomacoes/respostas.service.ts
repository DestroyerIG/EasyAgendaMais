import logger from '../../utils/logger.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { appointmentsService } from '../appointments/appointments.service.js';
import { automacoes } from './automacoes.service.js';
import { notaAvaliacao, renderizarTexto, respostaConfirmacao, TEXTO_REAGENDAR } from './automacoes.rules.js';
import { respostasRepository, type RespostaPendente } from './respostas.repository.js';

export const TEXTO_CONFIRMADO = 'Agradecemos! Seu horário está confirmado ✨';
export const TEXTO_CANCELADO = 'Tudo bem! Liberamos seu horário e a equipe já vai falar com você para remarcar.';
export const TEXTO_NOTA = 'Agradecemos pela nota!';
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

/** Lê a regra uma vez por resposta; falha na leitura cai nos textos padrão. */
const lerRegra = <R extends 'confirmacao' | 'avaliacao'>(i: Entrada, regra: R) =>
  automacoes.obter(i.businessId, regra).then((r) => r.config).catch(() => null);

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
    const config = await lerRegra(i, 'confirmacao');
    await enviar(i, config?.textoConfirmado ?? TEXTO_CONFIRMADO);
    return true;
  } else {
    await appointmentsService.updateStatus(espera.appointmentId, i.businessId, 'cancelado');
    await respostasRepository.apagar(espera.id);
    await inboxRecorder.pedirAtendimentoHumano(i.businessId, i.phone);
    await inboxRecorder.avisoDoSistema(i.businessId, i.phone, TEXTO_REAGENDAR);
    const config = await lerRegra(i, 'confirmacao');
    await enviar(i, config?.textoCancelado ?? TEXTO_CANCELADO);
  }
  return true;
}

async function tratarAvaliacao(i: Entrada, espera: RespostaPendente): Promise<boolean> {
  const nota = notaAvaliacao(i.texto ?? '');
  if (!nota) return false;
  const gravou = await respostasRepository.salvarNota({ businessId: i.businessId, appointmentId: espera.appointmentId, rating: nota });
  // A nota já está gravada: apagar a espera antes dos envios evita repetir o agradecimento numa nova resposta.
  await respostasRepository.apagar(espera.id);
  // Nota descartada (já havia uma): nada de agradecimento, Google nem alerta de nota baixa.
  if (!gravou) return true;
  const config = await lerRegra(i, 'avaliacao');
  await enviar(i, config?.textoNota ?? TEXTO_NOTA);
  // Sem link do Google o convite não sai, nem com texto personalizado.
  const link = nota === 5 ? config?.linkGoogle : null;
  if (link) await enviar(i, config?.textoGoogle ? renderizarTexto(config.textoGoogle, { link }) : TEXTO_GOOGLE(link));
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
