import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Regressão do achado do usuário: um agendamento criado às 12:00 aparecia com outro
 * horário na tela. Causa raiz: `time` é uma coluna @db.Time (sem fuso) e o repositório
 * construía o Date sem sufixo "Z" — `new Date('1970-01-01T12:00:00')` é interpretado em
 * hora LOCAL do processo Node, então em qualquer fuso diferente de UTC o valor gravado já
 * saía deslocado. `getBookedSlots` lia de volta com getters locais (compensava o próprio
 * deslocamento, por acidente) mas o serializer sempre leu em UTC — por isso a tela exibia
 * um horário diferente do que foi digitado.
 */

const mockAppointmentCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'apt-1' }));
const mockAppointmentUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'apt-1' }));
const mockAppointmentFindFirst = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockAppointmentFindMany = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      create: mockAppointmentCreate,
      update: mockAppointmentUpdate,
      findFirst: mockAppointmentFindFirst,
      findMany: mockAppointmentFindMany,
    },
  },
}));

const { appointmentsPrismaRepository } = await import(
  '../modules/appointments/appointments.repository.js'
);
const { toAppointmentDto } = await import('../modules/appointments/appointment.serializer.js');

describe('appointmentsPrismaRepository — horário gravado independe do fuso do processo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppointmentCreate.mockResolvedValue({ id: 'apt-1' });
    mockAppointmentUpdate.mockResolvedValue({ id: 'apt-1' });
    mockAppointmentFindFirst.mockResolvedValue(null);
    mockAppointmentFindMany.mockResolvedValue([]);
  });

  it('create grava "12:00" como 12:00 UTC literal, não meio-dia local', async () => {
    await appointmentsPrismaRepository.create({
      businessId: 'b1',
      clientId: 'c1',
      professionalId: 'p1',
      serviceId: 's1',
      date: '2026-04-15',
      time: '12:00',
    });

    const argumentoTime = mockAppointmentCreate.mock.calls[0]?.[0]?.data?.time as Date;
    expect(argumentoTime.getUTCHours()).toBe(12);
    expect(argumentoTime.getUTCMinutes()).toBe(0);
  });

  it('update grava "17:30" como 17:30 UTC literal', async () => {
    mockAppointmentFindFirst.mockResolvedValueOnce({ id: 'apt-1' });
    await appointmentsPrismaRepository.update('apt-1', 'b1', { time: '17:30' });

    const argumentoTime = mockAppointmentUpdate.mock.calls[0]?.[0]?.data?.time as Date;
    expect(argumentoTime.getUTCHours()).toBe(17);
    expect(argumentoTime.getUTCMinutes()).toBe(30);
  });

  it('hasConflict monta o filtro de horário em UTC literal', async () => {
    await appointmentsPrismaRepository.hasConflict('b1', 'p1', '2026-04-15', '09:00:00');

    const argumentoTime = mockAppointmentFindFirst.mock.calls[0]?.[0]?.where?.time as Date;
    expect(argumentoTime.getUTCHours()).toBe(9);
    expect(argumentoTime.getUTCMinutes()).toBe(0);
  });

  it('getBookedSlots lê o horário gravado em UTC — nunca em hora local do processo', async () => {
    mockAppointmentFindMany.mockResolvedValue([
      { time: new Date('1970-01-01T12:00:00.000Z') },
    ]);

    const horarios = await appointmentsPrismaRepository.getBookedSlots('b1', 'p1', '2026-04-15');

    expect(horarios).toEqual(['12:00']);
  });
});

describe('toAppointmentDto — o horário exibido bate com o que create grava (round-trip)', () => {
  it('um agendamento gravado às 12:00 UTC é exibido como "12:00:00"', () => {
    const dto = toAppointmentDto({
      id: 'apt-1',
      date: new Date('2026-04-15T00:00:00.000Z'),
      time: new Date('1970-01-01T12:00:00.000Z'),
      status: 'confirmado',
    });

    expect(dto.time).toBe('12:00:00');
  });
});
