import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const repo = vi.hoisted(() => ({
  maisRecente: vi.fn(), apagar: vi.fn(), statusDoAgendamento: vi.fn(), marcarConfirmadoPeloCliente: vi.fn(), salvarNota: vi.fn(),
}));
vi.mock('../modules/whatsappAutomacoes/respostas.repository.js', () => ({ respostasRepository: repo }));
const msg = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => msg);
const rec = vi.hoisted(() => ({ pedirAtendimentoHumano: vi.fn(), avisoDoSistema: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: rec }));
const appts = vi.hoisted(() => ({ updateStatus: vi.fn() }));
vi.mock('../modules/appointments/appointments.service.js', () => ({ appointmentsService: appts }));
const auto = vi.hoisted(() => ({ obter: vi.fn() }));
vi.mock('../modules/whatsappAutomacoes/automacoes.service.js', () => ({ automacoes: auto }));

const { respostas } = await import('../modules/whatsappAutomacoes/respostas.service.js');

const base = { businessId: 'b1', phone: '5583999990000', instanceName: 'loja_1' };
const espera = (tipo: string) => ({ id: 'e1', businessId: 'b1', phoneKey: 'k', tipo, appointmentId: 'a1', expiresAt: new Date(), createdAt: new Date() });

beforeEach(() => {
  vi.clearAllMocks();
  repo.maisRecente.mockResolvedValue(null);
  repo.statusDoAgendamento.mockResolvedValue('confirmado');
  auto.obter.mockResolvedValue({ config: { horas: 2, linkGoogle: 'https://g.page/x' } });
});

it('sem espera: false e nada chamado', async () => {
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(false);
  expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(repo.apagar).not.toHaveBeenCalled();
});

it('espera vencida (repositório não devolve) + "1": false', async () => {
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(false);
  expect(repo.marcarConfirmadoPeloCliente).not.toHaveBeenCalled();
});

it('confirmação + "1": grava, responde e apaga', async () => {
  repo.maisRecente.mockResolvedValue(espera('confirmacao'));
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(true);
  expect(repo.marcarConfirmadoPeloCliente).toHaveBeenCalledWith('a1', 'b1', expect.any(Date));
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(base.phone, 'Obrigada! Seu horário está confirmado ✨', expect.objectContaining({ origin: 'sistema' }));
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + "2": cancela, pede humano, avisa', async () => {
  repo.maisRecente.mockResolvedValue(espera('confirmacao'));
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(true);
  expect(appts.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'cancelado');
  expect(rec.pedirAtendimentoHumano).toHaveBeenCalledWith('b1', base.phone);
  expect(rec.avisoDoSistema).toHaveBeenCalledWith('b1', base.phone, 'Pediu para reagendar pelo WhatsApp');
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + "2" com agendamento já não confirmado: só apaga e false', async () => {
  repo.maisRecente.mockResolvedValue(espera('confirmacao'));
  repo.statusDoAgendamento.mockResolvedValue('cancelado');
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(false);
  expect(appts.updateStatus).not.toHaveBeenCalled();
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + texto livre: false e espera continua', async () => {
  repo.maisRecente.mockResolvedValue(espera('confirmacao'));
  expect(await respostas.tratar({ ...base, texto: 'oi, tudo bem?' })).toBe(false);
  expect(repo.apagar).not.toHaveBeenCalled();
});

it('avaliação 5 com link: duas mensagens', async () => {
  repo.maisRecente.mockResolvedValue(espera('avaliacao'));
  expect(await respostas.tratar({ ...base, texto: '5' })).toBe(true);
  expect(repo.salvarNota).toHaveBeenCalledWith({ businessId: 'b1', appointmentId: 'a1', rating: 5 });
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledTimes(2);
  expect(msg.sendWhatsAppMessage.mock.calls[1][1]).toBe('Que bom que gostou! Se puder, deixe sua avaliação no Google: https://g.page/x');
});

it('avaliação 2: pede humano e avisa', async () => {
  repo.maisRecente.mockResolvedValue(espera('avaliacao'));
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(true);
  expect(rec.pedirAtendimentoHumano).toHaveBeenCalled();
  expect(rec.avisoDoSistema).toHaveBeenCalledWith('b1', base.phone, 'Avaliação baixa (2) — vale falar com ela');
});

it('erro interno: false', async () => {
  repo.maisRecente.mockRejectedValue(new Error('x'));
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(false);
});
