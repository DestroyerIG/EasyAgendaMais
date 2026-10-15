import { waitlistRepository as repo } from './waitlist.repository.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { ACTIVE_STATUSES } from './waitlist.types.js';
import type { ListQuery, CreateWaitlistInput, UpdateWaitlistInput, OfferInput, WaitlistItemDto } from './waitlist.types.js';

const NAO_AGENDAVEL = 'Esta inscrição não pode mais ser agendada';

function buildWhatsappUrl(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, '');
  if (!(digits.startsWith('55') && (digits.length === 12 || digits.length === 13))) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

async function loadActive(businessId: string, id: string, msg: string): Promise<WaitlistItemDto> {
  const cur = await repo.findById(id, businessId);
  if (!cur) throw new NotFoundError('Inscrição');
  if (!(ACTIVE_STATUSES as readonly string[]).includes(cur.status)) throw new ConflictError(msg);
  return cur;
}
async function assertProfessional(businessId: string, id?: string | null) {
  if (id && !(await repo.professionalExists(id, businessId))) throw new NotFoundError('Profissional');
}

export const waitlistService = {
  list(businessId: string, q: ListQuery) {
    const statuses = q.status === 'todas' ? undefined : q.status ? [q.status] : [...ACTIVE_STATUSES];
    return repo.list(businessId, { statuses, period: q.period, date: q.date });
  },
  async create(businessId: string, input: CreateWaitlistInput) {
    if (!(await repo.clientExists(input.clientId, businessId))) throw new NotFoundError('Cliente');
    if (!(await repo.serviceExists(input.serviceId, businessId))) throw new NotFoundError('Serviço');
    await assertProfessional(businessId, input.professionalId);
    return repo.create(businessId, input);
  },
  async update(businessId: string, id: string, input: UpdateWaitlistInput) {
    await loadActive(businessId, id, 'Esta inscrição não pode mais ser alterada');
    await assertProfessional(businessId, input.professionalId);
    const r = await repo.updateActive(id, businessId, input);
    if (!r) throw new ConflictError('Esta inscrição não pode mais ser alterada');
    return r;
  },
  async offer(businessId: string, id: string, input: OfferInput) {
    const cur = await loadActive(businessId, id, 'Esta inscrição não pode mais receber ofertas');
    await assertProfessional(businessId, input.professionalId);
    const negocio = await repo.businessName(businessId);
    const [, m, d] = input.date.split('-');
    const msg = `Olá, ${cur.cliente.name}! Abriu um horário para ${cur.servico.name} no ${negocio}: ${d}/${m} às ${input.time}. Quer que eu reserve para você?`;
    const item = await repo.markOffered(id, businessId);
    if (!item) throw new ConflictError('Esta inscrição não pode mais receber ofertas');
    return { item, whatsappUrl: buildWhatsappUrl(cur.cliente.phone, msg) };
  },
  async booked(businessId: string, id: string, appointmentId: string) {
    const cur = await loadActive(businessId, id, NAO_AGENDAVEL);
    const apptClient = await repo.appointmentClientId(appointmentId, businessId);
    if (!apptClient) throw new NotFoundError('Agendamento');
    if (apptClient !== cur.cliente.id) throw new ConflictError(NAO_AGENDAVEL);
    try {
      const r = await repo.markBooked(id, businessId, appointmentId);
      if (!r) throw new ConflictError(NAO_AGENDAVEL);
      return r;
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new ConflictError(NAO_AGENDAVEL);
      throw e;
    }
  },
};
