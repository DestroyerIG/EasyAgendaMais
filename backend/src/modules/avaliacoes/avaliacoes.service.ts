import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { emailService } from '../../services/emailService.js';
import { AppError, ConflictError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { pushService } from '../push/push.service.js';
import { intervaloUtc, type Periodo } from '../reports/periodo.js';

// Avaliação da cliente por link no comprovante (fase 5). Grava na mesma `whatsapp_ratings` da
// automação de avaliação: uma nota por atendimento, venha do link ou da resposta no WhatsApp.

export const AVALIACAO_DIAS = 14;
export const NOTA_BAIXA = 3;

export const AvaliarSchema = z.object({
  nota: z.number().int().min(1, 'Escolha de 1 a 5 estrelas').max(5, 'Escolha de 1 a 5 estrelas'),
  comentario: z.string().trim().max(500).nullable().optional(),
});
export type AvaliarInput = z.infer<typeof AvaliarSchema>;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const primeiro = (nome: string) => nome.split(' ')[0] || nome;

class LinkInvalidoError extends AppError {
  constructor(message: string) { super(message, 410, 'AVALIACAO_INDISPONIVEL'); }
}

export function situacaoLink(c: { closedAt: Date | null; jaAvaliada: boolean }, agora: Date): 'ok' | 'avaliada' | 'vencido' {
  if (c.jaAvaliada) return 'avaliada';
  if (!c.closedAt || agora.getTime() - c.closedAt.getTime() > AVALIACAO_DIAS * 24 * 60 * 60 * 1000) return 'vencido';
  return 'ok';
}

async function comandaDoToken(token: string) {
  return prisma.comanda.findUnique({
    where: { avaliacaoTokenHash: hash(token) },
    select: {
      id: true, businessId: true, professionalId: true, closedAt: true, appointmentId: true,
      business: { select: { name: true } },
      professional: { select: { name: true } },
      client: { select: { name: true } },
      appointment: { select: { date: true, service: { select: { name: true } }, whatsappRating: { select: { id: true } } } },
    },
  });
}

async function comandaValida(token: string) {
  const c = await comandaDoToken(token);
  if (!c) throw new LinkInvalidoError('Este link de avaliação não existe.');
  const s = situacaoLink({ closedAt: c.closedAt, jaAvaliada: Boolean(c.appointment.whatsappRating) }, new Date());
  if (s === 'avaliada') throw new LinkInvalidoError('Obrigada! Esta avaliação já foi registrada.');
  if (s === 'vencido') throw new LinkInvalidoError('Este link de avaliação expirou.');
  return c;
}

export const avaliacoesService = {
  /**
   * Gera o link do comprovante. Cada envio troca o token (o texto puro não é guardado),
   * então o link do envio anterior deixa de valer.
   */
  async novoLink(comandaId: string): Promise<string> {
    const token = crypto.randomBytes(24).toString('base64url');
    await prisma.comanda.update({ where: { id: comandaId }, data: { avaliacaoTokenHash: hash(token) } });
    return `${emailService.getFrontendBaseUrl()}/avaliar/${token}`;
  },

  async ver(token: string) {
    const c = await comandaValida(token);
    return {
      negocio: c.business.name, profissional: primeiro(c.professional.name), cliente: primeiro(c.client.name),
      servico: c.appointment.service.name, data: ymd(c.appointment.date),
    };
  },

  async avaliar(token: string, input: AvaliarInput) {
    const c = await comandaValida(token);
    const comentario = input.comentario?.trim() ? input.comentario.trim() : null;
    try {
      await prisma.whatsappRating.create({
        data: { businessId: c.businessId, appointmentId: c.appointmentId, rating: input.nota, comment: comentario, origem: 'link' },
      });
    } catch (e) {
      // Índice único por agendamento: a nota pela automação (ou outra aba) chegou antes.
      if ((e as { code?: string }).code === 'P2002') throw new ConflictError('Esta avaliação já foi registrada.');
      throw e;
    }
    const estrelas = '★'.repeat(input.nota) + '☆'.repeat(5 - input.nota);
    void pushService.paraProfissional(c.businessId, c.professionalId, {
      titulo: `Nova avaliação ${estrelas}`, corpo: comentario ? `${primeiro(c.client.name)}: ${comentario}` : primeiro(c.client.name),
      link: '/bancada/numeros', tag: `avaliacao-${c.id}`,
    });
    if (input.nota <= NOTA_BAIXA) {
      await notificationsService.notify(c.businessId, {
        type: 'avaliacao_baixa',
        title: `Avaliação ${input.nota} de 5 de ${primeiro(c.client.name)}`,
        description: `${c.appointment.service.name} com ${primeiro(c.professional.name)}${comentario ? ` · "${comentario.slice(0, 80)}"` : ''}`,
        link: '/relatorios',
      });
    }
    logger.info({ comandaId: c.id, nota: input.nota }, 'Avaliação pelo link registrada');
    return { registrada: true };
  },

  /** Relatórios: média, quantidade e lista por profissional (link e WhatsApp juntos). */
  async porProfissional(businessId: string, periodo: Periodo) {
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const notas = await prisma.whatsappRating.findMany({
      where: { businessId, createdAt: intervaloUtc(periodo, timezone) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, rating: true, comment: true, createdAt: true, origem: true,
        appointment: {
          select: { date: true, professional: { select: { id: true, name: true } }, client: { select: { name: true } }, service: { select: { name: true } } },
        },
      },
    });
    const grupos = new Map<string, { professional: { id: string; nome: string }; soma: number; itens: unknown[] }>();
    for (const r of notas) {
      const p = r.appointment.professional;
      const g = grupos.get(p.id) ?? { professional: { id: p.id, nome: p.name }, soma: 0, itens: [] };
      g.soma += r.rating;
      g.itens.push({
        id: r.id, nota: r.rating, comentario: r.comment, criadaEm: r.createdAt.toISOString(), origem: r.origem,
        cliente: r.appointment.client.name, servico: r.appointment.service.name, data: ymd(r.appointment.date),
      });
      grupos.set(p.id, g);
    }
    const profissionais = [...grupos.values()]
      .map((g) => ({ professional: g.professional, media: Math.round((g.soma / g.itens.length) * 10) / 10, quantidade: g.itens.length, itens: g.itens }))
      .sort((a, b) => a.professional.nome.localeCompare(b.professional.nome, 'pt-BR'));
    const total = notas.length;
    return {
      periodo,
      media: total ? Math.round((notas.reduce((t, r) => t + r.rating, 0) / total) * 10) / 10 : null,
      quantidade: total,
      profissionais,
    };
  },
};
