import { vi, describe, it, beforeEach, expect } from 'vitest';

const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { businessSettingsRepository } = await import('../repositories/businessSettingsRepository.js');

describe('businessSettingsRepository.findByBusinessId', () => {
  beforeEach(() => prismaMock.$queryRaw.mockReset());

  // Produção (04/11/2026): o padrão 30 ia como parâmetro int8, o COALESCE virava bigint e o Prisma
  // devolvia BigInt; o res.json quebrava com "Do not know how to serialize a BigInt" (500 em Ajustes).
  it('intervalo vindo como BigInt sai como number e a resposta serializa em JSON', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        whatsapp_instance_name: '',
        opening_time: '09:00',
        closing_time: '20:00',
        slot_interval_minutes: 30n,
        dias_abertos: ['seg', 'ter'],
        allow_walkins: true,
        auto_confirm_appointments: false,
        whatsapp_reminders: true,
      },
    ]);

    const settings = await businessSettingsRepository.findByBusinessId('fd2b67b9-36f1-4370-a5e0-8dfaeacb8a07');

    expect(settings?.slotIntervalMinutes).toBe(30);
    expect(() => JSON.stringify(settings)).not.toThrow();
  });

  it('a consulta força o intervalo para int, sem depender do tipo do parâmetro', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await businessSettingsRepository.findByBusinessId('fd2b67b9-36f1-4370-a5e0-8dfaeacb8a07');
    const sql = prismaMock.$queryRaw.mock.calls[0]![0] as { strings: string[] };
    expect(sql.strings.join('?')).toMatch(/COALESCE\(s\.slot_interval_minutes, \?::int\)/);
  });
});
