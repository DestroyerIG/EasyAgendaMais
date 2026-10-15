import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { Visita } from './crmMetrics.js';

export interface ClienteBase {
  id: string; name: string; phone: string; email: string | null; birthDate: string | null; createdAt: string; active: boolean;
  tags: Array<{ id: string; name: string; color: string }>;
  consentimento: 'consentido' | 'revogado' | 'nao_informado';
}

interface LinhaVisita { client_id: string; date: string; receita: unknown; servico: string; profissional: string; professional_id: string }

async function carregarVisitas(businessId: string) {
  const linhas = await prisma.$queryRaw<LinhaVisita[]>(Prisma.sql`
    SELECT a.client_id, to_char(a.date, 'YYYY-MM-DD') AS date,
           COALESCE(e.amount, s.price) AS receita, s.name AS servico, p.name AS profissional, p.id AS professional_id
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN professionals p ON p.id = a.professional_id
    LEFT JOIN earnings e ON e.appointment_id = a.id
    WHERE a.business_id = ${businessId}::uuid AND a.status = 'concluido'`);
  const visitas = new Map<string, Visita[]>();
  const profissionais = new Map<string, Set<string>>();
  for (const l of linhas) {
    const lista = visitas.get(l.client_id) ?? [];
    lista.push({ date: l.date, receita: Number(l.receita ?? 0), servico: l.servico, profissional: l.profissional });
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
  async visitas(businessId: string): Promise<Map<string, Visita[]>> {
    return (await carregarVisitas(businessId)).visitas;
  },
  async profissionaisPorCliente(businessId: string): Promise<Map<string, Set<string>>> {
    return (await carregarVisitas(businessId)).profissionais;
  },
};
