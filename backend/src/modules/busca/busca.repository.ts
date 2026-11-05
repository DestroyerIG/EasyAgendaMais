import { prisma } from '../../config/prisma.js';
import type { AgendamentoBusca } from './busca.types.js';

const LIMITE_AGENDAMENTOS = 5;

const selecaoAgendamento = {
  id: true, date: true, time: true, status: true,
  client: { select: { name: true } },
  service: { select: { name: true } },
  professional: { select: { name: true } },
} as const;

type LinhaAgendamento = {
  id: string; date: Date; time: Date; status: string;
  client: { name: string }; service: { name: string }; professional: { name: string };
};

const paraTexto = (a: LinhaAgendamento): AgendamentoBusca => ({
  id: a.id,
  data: a.date.toISOString().slice(0, 10),
  hora: a.time.toISOString().slice(11, 16),
  status: a.status,
  clienteNome: a.client.name,
  servicoNome: a.service.name,
  profissionalNome: a.professional.name,
});

// `hoje` é AAAA-MM-DD no fuso do negócio; a coluna date é @db.Date, então comparamos à meia-noite UTC.
const meiaNoite = (hoje: string) => new Date(`${hoje}T00:00:00.000Z`);

export const buscaRepository = {
  clientesAtivos(businessId: string) {
    return prisma.client.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, phone: true, email: true },
    });
  },

  async agendamentosFuturos(businessId: string, clienteIds: string[], hoje: string): Promise<AgendamentoBusca[]> {
    const linhas = await prisma.appointment.findMany({
      where: { businessId, clientId: { in: clienteIds }, status: { not: 'cancelado' }, date: { gte: meiaNoite(hoje) } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      take: LIMITE_AGENDAMENTOS,
      select: selecaoAgendamento,
    });
    return linhas.map(paraTexto);
  },

  async agendamentosPassados(businessId: string, clienteIds: string[], hoje: string): Promise<AgendamentoBusca[]> {
    const linhas = await prisma.appointment.findMany({
      where: { businessId, clientId: { in: clienteIds }, status: { not: 'cancelado' }, date: { lt: meiaNoite(hoje) } },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      take: LIMITE_AGENDAMENTOS,
      select: selecaoAgendamento,
    });
    return linhas.map(paraTexto);
  },
};
