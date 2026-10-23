import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { Visita } from './crmMetrics.js';

export interface ClienteBase {
  id: string; name: string; phone: string; email: string | null; birthDate: string | null; createdAt: string; active: boolean;
  tags: Array<{ id: string; name: string; color: string }>;
  consentimento: 'consentido' | 'revogado' | 'nao_informado';
}

interface LinhaVisita { client_id: string; date: string; receita: unknown; servico: string; profissional: string; professional_id: string; service_id: string; duracao: number | null }

export interface ClientePerfilRow {
  id: string; name: string; phone: string; email: string | null; birthDate: string | null; notes: string | null; createdAt: string;
  tags: Array<{ id: string; name: string; color: string }>;
  consentimento: { granted: boolean; channel: string; grantedAt: string; revokedAt: string | null } | null;
}
export interface FichaRow { allergies: string | null; fields: Record<string, string>; customFields: Array<{ label: string; value: string }>; updatedAt: string }
export interface AgendamentoLinha {
  id: string; date: string; time: string; status: string; source: string; reminderSent: boolean; depositAmount: number | null;
  createdAt: string; finishedAt: string | null; servico: string; servicePrice: number; profissional: string;
  comanda: { totalCharged: number; depositApplied: number; itens: string[] } | null;
  avaliacao: { rating: number; comment: string | null; createdAt: string } | null;
}

async function carregarVisitas(businessId: string, clientId?: string) {
  const linhas = await prisma.$queryRaw<LinhaVisita[]>(Prisma.sql`
    SELECT a.client_id, to_char(a.date, 'YYYY-MM-DD') AS date,
           COALESCE(e.amount, s.price) AS receita, s.name AS servico, p.name AS profissional, p.id AS professional_id, s.id AS service_id, s.duration_minutes AS duracao
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN professionals p ON p.id = a.professional_id
    LEFT JOIN earnings e ON e.appointment_id = a.id
    WHERE a.business_id = ${businessId}::uuid AND a.status = 'concluido'
      ${clientId ? Prisma.sql`AND a.client_id = ${clientId}::uuid` : Prisma.empty}`);
  const visitas = new Map<string, Visita[]>();
  const profissionais = new Map<string, Set<string>>();
  for (const l of linhas) {
    const lista = visitas.get(l.client_id) ?? [];
    lista.push({ date: l.date, receita: Number(l.receita ?? 0), servico: l.servico, profissional: l.profissional, professionalId: l.professional_id, serviceId: l.service_id, duracao: l.duracao ?? undefined });
    visitas.set(l.client_id, lista);
    const set = profissionais.get(l.client_id) ?? new Set<string>();
    set.add(l.professional_id);
    profissionais.set(l.client_id, set);
  }
  return { visitas, profissionais };
}

const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export const crmRepository = {
  async clientes(businessId: string): Promise<ClienteBase[]> {
    const rows = await prisma.client.findMany({
      where: { businessId },
      select: {
        id: true, name: true, phone: true, email: true, birthDate: true, createdAt: true, active: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        consents: { orderBy: { grantedAt: 'desc' }, take: 1, select: { granted: true, revokedAt: true } },
      },
    });
    return rows.map((r) => {
      const c = r.consents[0];
      return {
        id: r.id, name: r.name, phone: r.phone, email: r.email ?? null,
        birthDate: ymd(r.birthDate), createdAt: r.createdAt.toISOString(), active: r.active,
        tags: r.tags.map((t) => t.tag),
        consentimento: !c ? 'nao_informado' : c.granted && !c.revokedAt ? 'consentido' : 'revogado',
      } as ClienteBase;
    });
  },
  /** Uma única varredura devolve visitas e profissionais por cliente. */
  async visitasEProfissionais(businessId: string): Promise<{ visitas: Map<string, Visita[]>; profissionais: Map<string, Set<string>> }> {
    return carregarVisitas(businessId);
  },
  async visitas(businessId: string): Promise<Map<string, Visita[]>> {
    return (await carregarVisitas(businessId)).visitas;
  },
  async profissionaisPorCliente(businessId: string): Promise<Map<string, Set<string>>> {
    return (await carregarVisitas(businessId)).profissionais;
  },
  async clientePerfil(businessId: string, id: string): Promise<ClientePerfilRow | null> {
    const r = await prisma.client.findFirst({
      where: { id, businessId },
      select: {
        id: true, name: true, phone: true, email: true, birthDate: true, notes: true, createdAt: true,
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        consents: { orderBy: { grantedAt: 'desc' }, take: 1, select: { granted: true, channel: true, grantedAt: true, revokedAt: true } },
      },
    });
    if (!r) return null;
    const c = r.consents[0];
    return {
      id: r.id, name: r.name, phone: r.phone, email: r.email ?? null, birthDate: ymd(r.birthDate), notes: r.notes ?? null,
      createdAt: r.createdAt.toISOString(), tags: r.tags.map((t) => t.tag),
      consentimento: c ? { granted: c.granted, channel: c.channel, grantedAt: c.grantedAt.toISOString(), revokedAt: c.revokedAt?.toISOString() ?? null } : null,
    };
  },
  async visitasDoCliente(businessId: string, clientId: string): Promise<Visita[]> {
    return (await carregarVisitas(businessId, clientId)).visitas.get(clientId) ?? [];
  },
  async agendamentosDoCliente(businessId: string, clientId: string): Promise<AgendamentoLinha[]> {
    const rows = await prisma.appointment.findMany({
      where: { businessId, clientId },
      select: {
        id: true, date: true, time: true, status: true, source: true, reminderSent: true, depositAmount: true, createdAt: true, finishedAt: true,
        service: { select: { name: true, price: true } }, professional: { select: { name: true } },
        comanda: { select: { status: true, totalCharged: true, depositApplied: true, items: { select: { name: true, quantity: true } } } },
        whatsappRating: { select: { rating: true, comment: true, createdAt: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id, date: a.date.toISOString().slice(0, 10), time: a.time.toISOString().slice(11, 16), status: a.status, source: a.source,
      reminderSent: a.reminderSent, depositAmount: a.depositAmount === null ? null : Number(a.depositAmount),
      createdAt: a.createdAt.toISOString(), finishedAt: a.finishedAt?.toISOString() ?? null,
      servico: a.service.name, servicePrice: Number(a.service.price), profissional: a.professional.name,
      comanda: a.comanda && a.comanda.status === 'fechada'
        ? {
          totalCharged: Number(a.comanda.totalCharged), depositApplied: Number(a.comanda.depositApplied),
          itens: a.comanda.items.map((i) => (i.quantity > 1 ? `${i.name} x${i.quantity}` : i.name)),
        }
        : null,
      avaliacao: a.whatsappRating
        ? { rating: a.whatsappRating.rating, comment: a.whatsappRating.comment ?? null, createdAt: a.whatsappRating.createdAt.toISOString() }
        : null,
    }));
  },
  async ficha(businessId: string, clientId: string): Promise<FichaRow | null> {
    const f = await prisma.clientTechnicalSheet.findFirst({ where: { clientId, businessId } });
    if (!f) return null;
    return {
      allergies: f.allergies ?? null, fields: (f.fields ?? {}) as Record<string, string>,
      customFields: (f.customFields ?? []) as Array<{ label: string; value: string }>, updatedAt: f.updatedAt.toISOString(),
    };
  },
  async salvarFicha(a: {
    businessId: string; clientId: string; allergies: string | null; fields: Record<string, string>;
    customFields: Array<{ label: string; value: string }>; updatedBy: string;
  }): Promise<FichaRow> {
    const data = { allergies: a.allergies, fields: a.fields, customFields: a.customFields, updatedBy: a.updatedBy };
    const f = await prisma.clientTechnicalSheet.upsert({
      where: { clientId: a.clientId },
      create: { clientId: a.clientId, businessId: a.businessId, ...data },
      update: data,
    });
    return {
      allergies: f.allergies ?? null, fields: f.fields as Record<string, string>,
      customFields: f.customFields as Array<{ label: string; value: string }>, updatedAt: f.updatedAt.toISOString(),
    };
  },
  async registrarConsentimento(a: { businessId: string; clientId: string; granted: boolean; channel: string; recordedBy: string }) {
    const c = await prisma.clientConsent.create({
      data: { businessId: a.businessId, clientId: a.clientId, granted: a.granted, channel: a.channel, recordedBy: a.recordedBy },
    });
    return { granted: c.granted, channel: c.channel, grantedAt: c.grantedAt.toISOString() };
  },
  async ownerName(businessId: string): Promise<string> {
    return (await prisma.business.findUnique({ where: { id: businessId }, select: { ownerName: true } }))?.ownerName ?? '';
  },
  async configuracao(businessId: string): Promise<{ segment: string; dailyRevenueGoal: number | null }> {
    const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { segment: true, dailyRevenueGoal: true } });
    return { segment: s?.segment ?? 'outro', dailyRevenueGoal: s?.dailyRevenueGoal == null ? null : Number(s.dailyRevenueGoal) };
  },
  async salvarConfiguracao(businessId: string, d: { segment: string; dailyRevenueGoal: number | null }) {
    const s = await prisma.businessSettings.upsert({
      where: { businessId }, create: { businessId, ...d }, update: d, select: { segment: true, dailyRevenueGoal: true },
    });
    return { segment: s.segment, dailyRevenueGoal: s.dailyRevenueGoal == null ? null : Number(s.dailyRevenueGoal) };
  },
};
