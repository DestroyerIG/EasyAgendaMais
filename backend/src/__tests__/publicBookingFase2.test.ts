import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { diasAPartirDe, notaPublica, situacaoDaReserva } from '../modules/publicBooking/publicBooking.rules.js';
import { closesTodayAt } from '../services/scheduleSettingsService.js';
import { NotFoundError } from '../utils/errors.js';

vi.mock('../modules/recebimentos/conexao.service.js', () => ({ conexaoService: { formas: vi.fn().mockResolvedValue(['pix']), gatewayAtivo: vi.fn().mockResolvedValue(null), credencial: vi.fn().mockResolvedValue(null), tokenAtivo: vi.fn().mockResolvedValue(null) } }));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: { cobrancasDaReserva: vi.fn().mockResolvedValue([]) } }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { doNegocio: vi.fn().mockResolvedValue({ tipo: 'ativa' }) } }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: {} }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: { bloqueiosDoDia: vi.fn().mockResolvedValue([]) } }));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: {
    findBusinessBySlug: vi.fn(),
    findEligibleServices: vi.fn(),
    findServiceForBusiness: vi.fn(),
    findProfessionalForBusiness: vi.fn(),
    resumoDasNotas: vi.fn(),
    findPublicAppointment: vi.fn(),
  },
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: { getBookedSlots: vi.fn(), getProfessionalBreak: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/scheduleSettingsService.js', async (original) => ({
  ...(await original<typeof import('../services/scheduleSettingsService.js')>()),
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({
    openingTime: '09:00', closingTime: '12:00', slotIntervalMinutes: 60, timezone: 'America/Sao_Paulo',
    diasAbertos: { dom: true, seg: true, ter: true, qua: true, qui: true, sex: true, sab: true },
  }),
}));

const repo = publicBookingRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
const agenda = appointmentsPrismaRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;

const NEGOCIO = {
  id: 'biz-1', name: 'Studio', logoUrl: null, brandColor: null, galleryPhotos: [], address: null, whatsapp: null,
  coverUrl: 'https://cdn.test/capa.jpg', description: 'Apresentação', comodidades: ['wifi'], mostrarNota: false,
  settings: { segment: null },
};
const CONSULTA = { serviceId: 's1', professionalId: 'p1', date: '2099-10-24' };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findBusinessBySlug.mockResolvedValue(NEGOCIO);
  repo.findEligibleServices.mockResolvedValue([
    { id: 's1', name: 'Corte', price: 100, durationMinutes: 60, depositPercentage: 30, description: 'Com lavagem' },
  ]);
  repo.findServiceForBusiness.mockResolvedValue({ id: 's1', durationMinutes: 60 });
  repo.findProfessionalForBusiness.mockResolvedValue({ id: 'p1' });
  agenda.getBookedSlots.mockResolvedValue([]);
});

describe('notaPublica', () => {
  it('só aparece com o dono ligando e 5 ou mais avaliações', () => {
    expect(notaPublica(false, { media: 4.9, quantidade: 50 })).toBeNull();
    expect(notaPublica(true, { media: 4.9, quantidade: 4 })).toBeNull();
    expect(notaPublica(true, null)).toBeNull();
    expect(notaPublica(true, { media: null, quantidade: 0 })).toBeNull();
    expect(notaPublica(true, { media: 4.86, quantidade: 5 })).toEqual({ media: 4.9, quantidade: 5 });
  });
});

describe('situacaoDaReserva', () => {
  const agora = new Date('2099-01-01T12:00:00Z');

  it('separa a reserva no prazo da que venceu sem pagamento', () => {
    expect(situacaoDaReserva('aguardando_pagamento', new Date('2099-01-01T12:10:00Z'), agora)).toBe('aguardando');
    expect(situacaoDaReserva('aguardando_pagamento', new Date('2099-01-01T11:50:00Z'), agora)).toBe('expirado');
    expect(situacaoDaReserva('aguardando_pagamento', null, agora)).toBe('expirado');
  });

  it('qualquer andamento depois da confirmação segue como confirmado', () => {
    expect(situacaoDaReserva('confirmado', null, agora)).toBe('confirmado');
    expect(situacaoDaReserva('concluido', null, agora)).toBe('confirmado');
    expect(situacaoDaReserva('cancelado', null, agora)).toBe('cancelado');
  });
});

describe('diasAPartirDe', () => {
  it('atravessa o fim do mês', () => {
    expect(diasAPartirDe('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('closesTodayAt', () => {
  const base = { openingTime: '09:00', closingTime: '19:00', timezone: 'America/Sao_Paulo' };
  const quintaAsDez = new Date('2026-11-05T13:00:00Z');
  const quintaAsVinte = new Date('2026-11-05T23:00:00Z');

  it('devolve o fechamento enquanto o negócio não fechou', () => {
    expect(closesTodayAt({ ...base, diasAbertos: { qui: true } }, quintaAsDez)).toBe('19:00');
  });

  it('devolve null depois do fechamento ou em dia fechado', () => {
    expect(closesTodayAt({ ...base, diasAbertos: { qui: true } }, quintaAsVinte)).toBeNull();
    expect(closesTodayAt({ ...base, diasAbertos: { qui: false, sex: true } }, quintaAsDez)).toBeNull();
  });
});

describe('vitrine pública', () => {
  it('leva capa, descrição, comodidades e descrição dos serviços', async () => {
    const vitrine = await publicBookingService.getStorefront('studio');

    expect(vitrine).toMatchObject({ coverUrl: 'https://cdn.test/capa.jpg', descricao: 'Apresentação', comodidades: ['wifi'], nota: null });
    expect(vitrine.services[0].descricao).toBe('Com lavagem');
  });

  it('não consulta as notas se o dono não ligou', async () => {
    await publicBookingService.getStorefront('studio');

    expect(repo.resumoDasNotas).not.toHaveBeenCalled();
  });

  it('mostra a nota quando o dono ligou e há avaliações suficientes', async () => {
    repo.findBusinessBySlug.mockResolvedValue({ ...NEGOCIO, mostrarNota: true });
    repo.resumoDasNotas.mockResolvedValue({ media: 4.84, quantidade: 12 });

    expect((await publicBookingService.getStorefront('studio')).nota).toEqual({ media: 4.8, quantidade: 12 });
  });
});

describe('grade de horários', () => {
  it('marca como ocupado o horário reservado e mantém os livres', async () => {
    agenda.getBookedSlots.mockResolvedValue(['10:00']);

    expect(await publicBookingService.getAvailabilityGrid('studio', CONSULTA)).toEqual([
      { horario: '09:00', livre: true },
      { horario: '10:00', livre: false },
      { horario: '11:00', livre: true },
    ]);
  });
});

describe('vagas por dia', () => {
  it('conta as vagas dos próximos 14 dias a partir de hoje', async () => {
    const dias = await publicBookingService.getAvailabilityDays('studio', { serviceId: 's1', professionalId: 'p1' });

    expect(dias).toHaveLength(14);
    expect(dias[1].vagas).toBe(3);
    expect(dias[0].date < dias[13].date).toBe(true);
  });
});

describe('situação da reserva pública', () => {
  it('devolve a situação e os dados da reserva, sem dado da cliente', async () => {
    repo.findPublicAppointment.mockResolvedValue({
      id: 'a1', status: 'confirmado', expiresAt: null, date: new Date('2099-10-24T00:00:00Z'), time: new Date('1970-01-01T09:00:00Z'),
      depositAmount: 30, service: { name: 'Corte', price: 100, durationMinutes: 60 }, professional: { name: 'Ana' },
    });

    const r = await publicBookingService.getAppointmentStatus('studio', 'a1');
    expect(r.situacao).toBe('confirmado');
    expect(r.reserva).toMatchObject({ data: '2099-10-24', horario: '09:00', forma: 'pix', pixPayload: null, checkoutUrl: null });
    expect(repo.findPublicAppointment).toHaveBeenCalledWith('biz-1', 'a1');
  });

  it('não acha reserva de outro negócio', async () => {
    repo.findPublicAppointment.mockResolvedValue(null);

    await expect(publicBookingService.getAppointmentStatus('studio', 'a1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
