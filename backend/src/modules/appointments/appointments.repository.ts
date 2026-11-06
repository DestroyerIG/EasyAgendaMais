import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { OCCUPYING_STATUSES } from '../../config/appointmentStatus.js';
import type { AppointmentWithRelations, CreateAppointmentInput } from './appointments.types.js';

const APPOINTMENT_INCLUDE = {
  client: { select: { name: true, phone: true } },
  professional: { select: { name: true } },
  service: { select: { name: true, price: true, durationMinutes: true } },
  comanda: { select: { id: true, status: true, number: true, totalCharged: true, depositApplied: true, enviadaRecepcaoEm: true } },
} as const;

/** Dia como YYYY-MM-DD, de Date válido ou de texto que comece assim; null se não der para ler. */
const diaDe = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  return null;
};

/** Hora como HH:mm, de Date (UTC literal) ou de texto HH:mm / HH:mm:ss; null se não der para ler. */
const horaDe = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(11, 16);
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
  }
  return null;
};

/**
 * Data ou hora informadas diferem das gravadas? Nunca lança: valor ilegível conta como mudança,
 * porque reenviar lembrete é melhor do que deixar um horário remarcado sem aviso.
 */
const mudouDataOuHora = (
  existente: { date?: unknown; time?: unknown } | null,
  data: { date?: string; time?: string },
): boolean => {
  const mudou = (novo: string | null, atual: string | null) => novo === null || atual === null || novo !== atual;
  if (data.date && mudou(diaDe(data.date), diaDe(existente?.date))) return true;
  if (data.time && mudou(horaDe(data.time), horaDe(existente?.time))) return true;
  return false;
};

export const appointmentsPrismaRepository = {
  async findAll(
    businessId: string,
    filters: {
      date?: string;
      status?: string;
      view?: 'day' | 'week';
      professionalId?: string;
    }
  ): Promise<AppointmentWithRelations[]> {
    const where: Record<string, unknown> = { businessId };

    if (filters.professionalId) where['professionalId'] = filters.professionalId;
    if (filters.status) where['status'] = filters.status;

    if (filters.date) {
      const start = new Date(filters.date);
      if (filters.view === 'week') {
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        where['date'] = { gte: start, lt: end };
      } else {
        where['date'] = start;
      }
    }

    return prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    }) as unknown as AppointmentWithRelations[];
  },

  async findById(
    id: string,
    businessId: string
  ): Promise<AppointmentWithRelations | null> {
    return prisma.appointment.findFirst({
      where: { id, businessId },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations | null;
  },

  findClientVisits(clientId: string, businessId: string, before: Date) {
    return prisma.appointment.findMany({
      where: { clientId, businessId, status: 'concluido', date: { lt: before } },
      select: { date: true, professional: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
  },

  async findClientNotes(clientId: string, businessId: string): Promise<string | null> {
    const c = await prisma.client.findFirst({ where: { id: clientId, businessId }, select: { notes: true } });
    return c?.notes ?? null;
  },

  async validateOwnership(
    businessId: string,
    data: { clientId: string; professionalId: string; serviceId: string }
  ): Promise<{ clientOk: boolean; professionalOk: boolean; serviceOk: boolean }> {
    const [client, professional, service] = await Promise.all([
      prisma.client.findFirst({
        where: { id: data.clientId, businessId, active: true },
        select: { id: true },
      }),
      prisma.professional.findFirst({
        where: { id: data.professionalId, businessId, active: true },
        select: { id: true },
      }),
      prisma.service.findFirst({
        where: { id: data.serviceId, businessId, active: true },
        select: { id: true },
      }),
    ]);

    return {
      clientOk: client !== null,
      professionalOk: professional !== null,
      serviceOk: service !== null,
    };
  },

  async hasConflict(
    businessId: string,
    professionalId: string,
    date: string,
    time: string,
    excludeId?: string,
    db: Prisma.TransactionClient = prisma
  ): Promise<boolean> {
    const now = new Date();
    const existing = await db.appointment.findFirst({
      where: {
        businessId,
        professionalId,
        date: new Date(date),
        // `time` é @db.Time (sem fuso) — o "Z" garante que "12:00" grave literalmente
        // 12:00, em vez do meio-dia local do processo Node (achado do usuário: horário
        // criado ia parar em outro horário quando o servidor não roda em UTC).
        time: new Date(`1970-01-01T${time}Z`),
        OR: [
          { status: { in: [...OCCUPYING_STATUSES] } },
          { status: 'aguardando_pagamento', expiresAt: { gt: now } },
        ],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  },

  async create(data: CreateAppointmentInput & { businessId: string; source?: string }): Promise<AppointmentWithRelations> {
    return prisma.appointment.create({
      data: {
        businessId: data.businessId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        date: new Date(data.date),
        time: new Date(`1970-01-01T${data.time}:00Z`),
        status: 'confirmado',
        source: data.source ?? 'painel',
      },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations;
  },

  /**
   * Transição de status condicional e atômica: só altera se o agendamento ainda
   * estiver em `expectedStatus` (compare-and-set num único UPDATE). Ao confirmar o
   * pagamento de uma reserva (`aguardando_pagamento` → `confirmado`), exige também
   * que ela não tenha expirado — senão o horário pode já ter sido liberado e ocupado
   * por outro cliente antes de o cron de limpeza rodar.
   * Retorna null quando nenhuma linha foi alterada (status mudou ou reserva expirou).
   */
  async updateStatus(
    id: string,
    businessId: string,
    status: string,
    expectedStatus: string,
    extra: { startedAt?: Date | null; finishedAt?: Date } = {}
  ): Promise<AppointmentWithRelations | null> {
    const requiresUnexpiredHold = expectedStatus === 'aguardando_pagamento' && status === 'confirmado';
    const result = await prisma.appointment.updateMany({
      where: {
        id,
        businessId,
        status: expectedStatus,
        ...(requiresUnexpiredHold ? { expiresAt: { gt: new Date() } } : {}),
      },
      data: { status, ...extra },
    });
    if (result.count !== 1) return null;

    return prisma.appointment.findFirst({
      where: { id, businessId },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations | null;
  },

  async update(
    id: string,
    businessId: string,
    data: Partial<CreateAppointmentInput>
  ): Promise<AppointmentWithRelations | null> {
    const existing = await prisma.appointment.findFirst({
      where: { id, businessId, status: 'confirmado' },
      select: { id: true, date: true, time: true },
    });
    if (!existing) return null;

    // Remarcar de fato (data ou hora diferentes) recomeça o ciclo de lembrete e confirmação.
    const remarcou = mudouDataOuHora(existing, data);

    return prisma.appointment.update({
      where: { id },
      data: {
        ...(remarcou && { reminderSent: false, confirmationSentAt: null, clientConfirmedAt: null }),
        ...(data.clientId && { clientId: data.clientId }),
        ...(data.professionalId && { professionalId: data.professionalId }),
        ...(data.serviceId && { serviceId: data.serviceId }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.time && { time: new Date(`1970-01-01T${data.time}:00Z`) }),
      },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations;
  },

  async softDelete(id: string, businessId: string): Promise<boolean> {
    const existing = await prisma.appointment.findFirst({
      where: { id, businessId, status: 'confirmado' },
      select: { id: true },
    });
    if (!existing) return false;

    await prisma.appointment.update({
      where: { id },
      data: { status: 'cancelado' },
    });
    return true;
  },

  async getProfessionalBreak(professionalId: string, businessId: string): Promise<{ start: string; end: string } | null> {
    const p = await prisma.professional.findFirst({
      where: { id: professionalId, businessId },
      select: { breakStart: true, breakEnd: true },
    });
    if (!p?.breakStart || !p?.breakEnd) return null;
    return { start: p.breakStart.toISOString().substring(11, 16), end: p.breakEnd.toISOString().substring(11, 16) };
  },

  async getBookedSlots(
    businessId: string,
    professionalId: string,
    date: string
  ): Promise<string[]> {
    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId,
        professionalId,
        date: new Date(date),
        OR: [
          { status: { in: [...OCCUPYING_STATUSES] } },
          { status: 'aguardando_pagamento', expiresAt: { gt: now } },
        ],
      },
      select: { time: true },
    });

    return appointments.map((a) => {
      const t = a.time;
      // UTC, não hora local: `time` é gravado com "Z" (ver `create`/`update`), então o
      // valor literal está nos componentes UTC do Date, não nos locais do processo.
      const h = String(t.getUTCHours()).padStart(2, '0');
      const m = String(t.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    });
  },

  async getServiceDetails(serviceId: string, businessId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
      select: { price: true, durationMinutes: true },
    });
  },

  async findPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    const now = new Date();
    return prisma.appointment.findMany({
      where: { businessId, status: 'aguardando_pagamento', expiresAt: { gt: now } },
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    }) as unknown as AppointmentWithRelations[];
  },
};
