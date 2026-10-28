import JSZip from 'jszip';
import { prisma } from '../../config/prisma.js';
import {
  agendamentosCsv, caixaCsv, clientesCsv, comandasCsv, despesasCsv, profissionaisCsv, servicosCsv,
} from './backup.csv.js';

// Backup da conta em CSV. Só as colunas que vão para o arquivo; toda consulta filtra por businessId.
export const backupService = {
  async gerar(businessId: string): Promise<Buffer> {
    const [clientes, agendamentos, servicos, profissionais, itens, sessoes, movimentos, despesas] = await Promise.all([
      prisma.client.findMany({
        where: { businessId },
        select: { name: true, phone: true, email: true, birthDate: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { businessId },
        select: {
          date: true, time: true, status: true, source: true, depositAmount: true,
          client: { select: { name: true } }, professional: { select: { name: true } },
          service: { select: { name: true, price: true } },
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      }),
      prisma.service.findMany({
        where: { businessId },
        select: { name: true, price: true, durationMinutes: true, depositPercentage: true, active: true },
        orderBy: { name: 'asc' },
      }),
      prisma.professional.findMany({
        where: { businessId },
        select: { name: true, especialidade: true, cnpj: true, commissionServicePct: true, commissionProductPct: true, active: true },
        orderBy: { name: 'asc' },
      }),
      // ComandaItem não tem businessId próprio: o filtro passa pela comanda.
      prisma.comandaItem.findMany({
        where: { comanda: { businessId } },
        select: {
          name: true, kind: true, unitPrice: true, quantity: true,
          comanda: {
            select: {
              number: true, status: true, closedAt: true, createdAt: true, paymentMethod: true, totalCharged: true,
              client: { select: { name: true } }, professional: { select: { name: true } },
            },
          },
        },
        orderBy: [{ comanda: { number: 'asc' } }, { createdAt: 'asc' }],
      }),
      prisma.cashSession.findMany({
        where: { businessId },
        select: {
          date: true, openedAt: true, openingBalance: true, closedAt: true,
          countedBalance: true, expectedBalance: true, difference: true, notes: true,
        },
        orderBy: { openedAt: 'asc' },
      }),
      prisma.cashMovement.findMany({
        where: { businessId },
        select: { kind: true, amount: true, description: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.expense.findMany({
        where: { businessId },
        select: { date: true, description: true, category: true, amount: true, paymentMethod: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const zip = new JSZip();
    zip.file('clientes.csv', clientesCsv(clientes));
    zip.file('agendamentos.csv', agendamentosCsv(agendamentos));
    zip.file('servicos.csv', servicosCsv(servicos));
    zip.file('profissionais.csv', profissionaisCsv(profissionais));
    zip.file('comandas.csv', comandasCsv(itens));
    zip.file('caixa.csv', caixaCsv(sessoes, movimentos));
    zip.file('despesas.csv', despesasCsv(despesas));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  },

  async identificador(businessId: string): Promise<string> {
    const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    return negocio?.slug || businessId;
  },
};
