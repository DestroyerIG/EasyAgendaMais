import { prisma } from '../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { ACTIVE_STATUSES } from './waitlist.types.js';
import type { WaitlistItemDto, WaitlistFilter, CreateWaitlistInput, UpdateWaitlistInput } from './waitlist.types.js';

const include = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true } },
} as const;

type Row = Prisma.WaitlistEntryGetPayload<{ include: typeof include }>;

const toDto = (r: Row): WaitlistItemDto => ({
  id: r.id,
  cliente: { id: r.client.id, name: r.client.name, phone: r.client.phone },
  servico: r.service,
  profissional: r.professional,
  desiredDate: r.desiredDate ? r.desiredDate.toISOString().slice(0, 10) : null,
  period: r.period as WaitlistItemDto['period'],
  notes: r.notes,
  status: r.status as WaitlistItemDto['status'],
  offeredAt: r.offeredAt ? r.offeredAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});
const toDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const ACTIVE = [...ACTIVE_STATUSES];

async function findById(id: string, businessId: string): Promise<WaitlistItemDto | null> {
  const r = await prisma.waitlistEntry.findFirst({ where: { id, businessId }, include });
  return r ? toDto(r) : null;
}

export const waitlistRepository = {
  async list(businessId: string, f: WaitlistFilter): Promise<WaitlistItemDto[]> {
    const and: Prisma.WaitlistEntryWhereInput[] = [];
    if (f.date) and.push({ OR: [{ desiredDate: null }, { desiredDate: toDate(f.date) }] });
    if (f.period) and.push({ period: { in: [f.period, 'qualquer'] } });
    const rows = await prisma.waitlistEntry.findMany({
      where: { businessId, ...(f.statuses ? { status: { in: f.statuses } } : {}), ...(and.length ? { AND: and } : {}) },
      orderBy: { createdAt: 'asc' },
      include,
    });
    return rows.map(toDto);
  },
  findById,
  async create(businessId: string, d: CreateWaitlistInput): Promise<WaitlistItemDto> {
    const r = await prisma.waitlistEntry.create({
      data: {
        businessId, clientId: d.clientId, serviceId: d.serviceId,
        professionalId: d.professionalId ?? null,
        desiredDate: d.desiredDate ? toDate(d.desiredDate) : null,
        period: d.period ?? 'qualquer', notes: d.notes ?? null,
      },
      include,
    });
    return toDto(r);
  },
  /** Edita/cancela só se ainda ativa; null quando nenhuma linha foi afetada. */
  async updateActive(id: string, businessId: string, d: UpdateWaitlistInput): Promise<WaitlistItemDto | null> {
    const data: Prisma.WaitlistEntryUncheckedUpdateManyInput = {};
    if (d.status) data.status = d.status;
    if (d.professionalId !== undefined) data.professionalId = d.professionalId;
    if (d.desiredDate !== undefined) data.desiredDate = d.desiredDate ? toDate(d.desiredDate) : null;
    if (d.period) data.period = d.period;
    if (d.notes !== undefined) data.notes = d.notes;
    const r = await prisma.waitlistEntry.updateMany({ where: { id, businessId, status: { in: ACTIVE } }, data });
    return r.count ? findById(id, businessId) : null;
  },
  async markOffered(id: string, businessId: string): Promise<WaitlistItemDto | null> {
    const r = await prisma.waitlistEntry.updateMany({
      where: { id, businessId, status: { in: ACTIVE } }, data: { status: 'oferecida', offeredAt: new Date() },
    });
    return r.count ? findById(id, businessId) : null;
  },
  async markBooked(id: string, businessId: string, appointmentId: string): Promise<WaitlistItemDto | null> {
    const r = await prisma.waitlistEntry.updateMany({
      where: { id, businessId, status: { in: ACTIVE } }, data: { status: 'agendada', appointmentId },
    });
    return r.count ? findById(id, businessId) : null;
  },
  async clientExists(id: string, businessId: string): Promise<boolean> {
    return (await prisma.client.count({ where: { id, businessId } })) > 0;
  },
  async serviceExists(id: string, businessId: string): Promise<boolean> {
    return (await prisma.service.count({ where: { id, businessId } })) > 0;
  },
  async professionalExists(id: string, businessId: string): Promise<boolean> {
    return (await prisma.professional.count({ where: { id, businessId } })) > 0;
  },
  async appointmentClientId(id: string, businessId: string): Promise<string | null> {
    const a = await prisma.appointment.findFirst({ where: { id, businessId }, select: { clientId: true } });
    return a?.clientId ?? null;
  },
  async businessName(businessId: string): Promise<string> {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    return b?.name ?? '';
  },
};
