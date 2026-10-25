import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';

const db = vi.hoisted(() => ({
  comanda: { update: vi.fn(), findUnique: vi.fn() },
  whatsappRating: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: db }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
}));
vi.mock('../services/emailService.js', () => ({ emailService: { getFrontendBaseUrl: () => 'https://app.test' } }));
const notif = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const push = vi.hoisted(() => ({ paraProfissional: vi.fn().mockResolvedValue(0) }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: push }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));

const { avaliacoesService, situacaoLink } = await import('../modules/avaliacoes/avaliacoes.service.js');
const { montarComprovante } = await import('../modules/comandas/receipt.js');
const routes = (await import('../modules/avaliacoes/avaliacoes.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/avaliacoes', routes);
app.use(errorHandler);
const request = supertest(app);

const TOKEN = 'b'.repeat(32);
const dia = 24 * 60 * 60 * 1000;
const agora = new Date('2026-10-25T15:00:00Z');
const comanda = (over: Record<string, unknown> = {}) => ({
  id: 'k1', businessId: 'b1', professionalId: 'p1', appointmentId: 'a1', closedAt: new Date(agora.getTime() - dia),
  business: { name: 'Studio Aurora' }, professional: { name: 'Camila Rocha' }, client: { name: 'Mariana Souza' },
  appointment: { date: new Date('2026-10-24T00:00:00Z'), service: { name: 'Manicure' }, whatsappRating: null }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(agora);
  db.comanda.findUnique.mockResolvedValue(comanda());
  db.whatsappRating.create.mockResolvedValue({});
  notif.notify.mockResolvedValue(undefined);
  push.paraProfissional.mockResolvedValue(0);
});
afterEach(() => vi.useRealTimers());

describe('avaliação pelo link', () => {
  it('link vale 14 dias depois do fechamento e uma vez só', () => {
    expect(situacaoLink({ closedAt: new Date(agora.getTime() - 13 * dia), jaAvaliada: false }, agora)).toBe('ok');
    expect(situacaoLink({ closedAt: new Date(agora.getTime() - 15 * dia), jaAvaliada: false }, agora)).toBe('vencido');
    expect(situacaoLink({ closedAt: null, jaAvaliada: false }, agora)).toBe('vencido');
    expect(situacaoLink({ closedAt: agora, jaAvaliada: true }, agora)).toBe('avaliada');
  });

  it('novo link guarda só o hash do token', async () => {
    const link = await avaliacoesService.novoLink('k1');
    const token = link.split('/').pop()!;
    expect(link).toMatch(/^https:\/\/app\.test\/avaliar\/[A-Za-z0-9_-]{32}$/);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    expect(db.comanda.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { avaliacaoTokenHash: hash } });
  });

  it('a página mostra só primeiro nome, serviço e data', async () => {
    expect(await avaliacoesService.ver(TOKEN)).toEqual({
      negocio: 'Studio Aurora', profissional: 'Camila', cliente: 'Mariana', servico: 'Manicure', data: '2026-10-24',
    });
  });

  it('nota boa: grava com origem link e avisa a profissional, sem sino', async () => {
    await avaliacoesService.avaliar(TOKEN, { nota: 5, comentario: '  Amei!  ' });
    expect(db.whatsappRating.create).toHaveBeenCalledWith({
      data: { businessId: 'b1', appointmentId: 'a1', rating: 5, comment: 'Amei!', origem: 'link' },
    });
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', 'p1', expect.objectContaining({ titulo: 'Nova avaliação ★★★★★' }));
    expect(notif.notify).not.toHaveBeenCalled();
  });

  it('nota 3 ou menos toca o sino da dona', async () => {
    await avaliacoesService.avaliar(TOKEN, { nota: 3, comentario: null });
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'avaliacao_baixa', title: 'Avaliação 3 de 5 de Mariana' }));
  });

  it('já avaliada (pelo WhatsApp ou outra aba), vencida ou inexistente: não grava', async () => {
    db.comanda.findUnique.mockResolvedValue(comanda({ appointment: { ...comanda().appointment, whatsappRating: { id: 'r1' } } }));
    await expect(avaliacoesService.avaliar(TOKEN, { nota: 5 })).rejects.toMatchObject({ statusCode: 410, code: 'AVALIACAO_INDISPONIVEL' });
    db.comanda.findUnique.mockResolvedValue(comanda({ closedAt: new Date(agora.getTime() - 20 * dia) }));
    await expect(avaliacoesService.avaliar(TOKEN, { nota: 5 })).rejects.toMatchObject({ statusCode: 410 });
    db.comanda.findUnique.mockResolvedValue(null);
    await expect(avaliacoesService.ver(TOKEN)).rejects.toMatchObject({ statusCode: 410 });
    expect(db.whatsappRating.create).not.toHaveBeenCalled();
  });

  it('corrida no índice único vira 409', async () => {
    db.whatsappRating.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(avaliacoesService.avaliar(TOKEN, { nota: 4 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rota valida a nota de 1 a 5', async () => {
    expect((await request.post(`/api/v1/avaliacoes/${TOKEN}`).send({ nota: 6 })).status).toBe(400);
    expect((await request.post(`/api/v1/avaliacoes/${TOKEN}`).send({ nota: 0 })).status).toBe(400);
    expect((await request.post(`/api/v1/avaliacoes/${TOKEN}`).send({ nota: 5 })).status).toBe(201);
  });

  it('relatório agrupa por profissional, com média e quantidade', async () => {
    const r = (id: string, rating: number, prof: { id: string; name: string }) => ({
      id, rating, comment: null, createdAt: agora, origem: 'whatsapp',
      appointment: { date: new Date('2026-10-20T00:00:00Z'), professional: prof, client: { name: 'C' }, service: { name: 'S' } },
    });
    const bia = { id: 'p2', name: 'Bia' };
    const ana = { id: 'p1', name: 'Ana' };
    db.whatsappRating.findMany.mockResolvedValue([r('1', 5, bia), r('2', 4, ana), r('3', 3, ana)]);
    const out = await avaliacoesService.porProfissional('b1', { inicio: '2026-10-01', fim: '2026-10-31' });
    expect(out.media).toBe(4);
    expect(out.quantidade).toBe(3);
    expect(out.profissionais.map((p) => [p.professional.nome, p.media, p.quantidade])).toEqual([['Ana', 3.5, 2], ['Bia', 5, 1]]);
  });
});

describe('comprovante com o link de avaliação', () => {
  const base = {
    negocio: 'X', numero: 1, cliente: 'Ana', profissional: 'Camila Rocha',
    itens: [{ name: 'Manicure', quantity: 1, unitPrice: 50 }],
    calc: { depositApplied: 0, discount: 0, tip: 0, totalCharged: 50 }, paymentMethod: 'pix' as const,
  };
  it('com link: a última linha convida a avaliar a profissional', () => {
    const texto = montarComprovante({ ...base, linkAvaliacao: 'https://app.test/avaliar/abc' });
    expect(texto.split('\n').pop()).toBe('Como foi seu atendimento com Camila? Avalie em 1 toque: https://app.test/avaliar/abc');
  });
  it('sem link: igual ao de antes', () => {
    expect(montarComprovante(base)).not.toContain('Avalie');
  });
});
