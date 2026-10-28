import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const findFirst = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({ prisma: { appointment: { findFirst } } }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
}));

import { somenteHojeNaCarencia } from '../modules/conta/somenteHoje.middleware.js';

const desde = new Date('2026-10-27T12:00:00Z');
const carencia = { tipo: 'carencia', desde, ate: new Date('2026-11-03T12:00:00Z'), diasRestantes: 5 };

const rodar = async (estadoConta: unknown) => {
  const req = {
    params: { id: 'ag-1' }, user: { businessId: 'biz-1' }, estadoConta,
  } as unknown as Request;
  const next = vi.fn();
  await somenteHojeNaCarencia(req, {} as Response, next);
  return next;
};

describe('somenteHojeNaCarencia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T01:00:00Z')); // 22h de 28/10 em São Paulo
    findFirst.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('libera atendimento de hoje criado antes da carência', async () => {
    findFirst.mockResolvedValue({ date: new Date('2026-10-28T00:00:00Z'), createdAt: new Date('2026-10-26T10:00:00Z') });
    const next = await rodar(carencia);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ag-1', businessId: 'biz-1' } }));
    expect(next).toHaveBeenCalledWith();
  });

  it('bloqueia atendimento de outro dia', async () => {
    findFirst.mockResolvedValue({ date: new Date('2026-10-29T00:00:00Z'), createdAt: new Date('2026-10-26T10:00:00Z') });
    const next = await rodar(carencia);
    const erro = next.mock.calls[0][0];
    expect(erro.statusCode).toBe(402);
    expect(erro.message).toBe('Disponível depois de regularizar a assinatura.');
    expect(erro.details).toEqual({ estado: 'carencia' });
  });

  it('bloqueia atendimento criado depois do início da carência', async () => {
    findFirst.mockResolvedValue({ date: new Date('2026-10-28T00:00:00Z'), createdAt: new Date('2026-10-27T13:00:00Z') });
    const next = await rodar(carencia);
    expect(next.mock.calls[0][0].statusCode).toBe(402);
  });

  it('404 para agendamento de outro negócio', async () => {
    findFirst.mockResolvedValue(null);
    const next = await rodar(carencia);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('não consulta o banco quando a conta está ativa', async () => {
    const next = await rodar({ tipo: 'ativa' });
    expect(findFirst).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
