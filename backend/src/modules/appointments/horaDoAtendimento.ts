import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { horaNoFuso } from '../bancada/bancada.rules.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { pushService } from '../push/push.service.js';

// Aviso "hora de atender": quando chega o horário de um agendamento confirmado, o sino avisa a
// equipe (sem push) e o barbeiro daquele agendamento recebe push. Uma vez só por agendamento.

// Mesmo fuso da rotina de lembretes: Render roda em UTC e os agendamentos gravam o relógio do negócio.
const TIMEZONE = process.env.BUSINESS_TIMEZONE || process.env.APP_TIMEZONE || 'America/Sao_Paulo';

/** Quanto o aviso "espera" por uma rodada perdida (reinício do servidor, atraso do cron). */
const JANELA_MINUTOS = 15;

const primeiroNome = (nome: string) => nome.split(' ')[0] || nome;
const comoHora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function janela(agora: Date): { de: Date; ate: Date } {
  const relogio = horaNoFuso(agora, TIMEZONE).replace(/^24/, '00');
  const minutos = Number(relogio.slice(0, 2)) * 60 + Number(relogio.slice(3, 5));
  const inicio = Math.max(0, minutos - JANELA_MINUTOS);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { de: comoHora(hhmm(inicio)), ate: comoHora(hhmm(minutos)) };
}

/** Nunca lança: é aviso, não pode derrubar o cron. */
export async function avisarHoraDoAtendimento(agora: Date = new Date()): Promise<void> {
  try {
    const hoje = todayInTimezone(TIMEZONE, agora);
    const { de, ate } = janela(agora);

    const agendamentos = await prisma.appointment.findMany({
      where: { date: new Date(hoje), time: { gte: de, lte: ate }, status: 'confirmado', horaAvisadaEm: null },
      include: { client: { select: { name: true } }, service: { select: { name: true } }, professional: { select: { name: true } } },
    });

    for (const a of agendamentos) {
      try {
        // Marca antes de avisar: se duas rodadas se encontrarem, só a primeira avisa.
        const { count } = await prisma.appointment.updateMany({
          where: { id: a.id, status: 'confirmado', horaAvisadaEm: null },
          data: { horaAvisadaEm: agora },
        });
        if (count === 0) continue;

        const hora = a.time.toISOString().slice(11, 16);
        const titulo = `Hora de atender ${primeiroNome(a.client.name)}`;
        await notificationsService.notify(
          a.businessId,
          { type: 'hora_atendimento', title: titulo, description: `${a.service.name} · ${hora} · ${a.professional.name}`, link: `/agendamentos?data=${hoje}` },
          { semPush: true },
        );
        void pushService.paraProfissional(a.businessId, a.professionalId, {
          titulo, corpo: `${a.service.name} · ${hora}`, link: '/bancada', tag: `hora-${a.id}`,
        });
      } catch (err) {
        logger.warn({ err, appointmentId: a.id }, 'Aviso de hora de atender não enviado');
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Falha na rotina de aviso de hora de atender');
  }
}
