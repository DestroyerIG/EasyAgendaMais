import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const repo = vi.hoisted(() => ({
  pendentes: vi.fn(), houveSaidaDepois: vi.fn(), apagar: vi.fn(), statusDoAgendamento: vi.fn(), marcarConfirmadoPeloCliente: vi.fn(), salvarNota: vi.fn(),
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

const configs: Record<string, Record<string, unknown>> = {};
const base = { businessId: 'b1', phone: '5583999990000', instanceName: 'loja_1' };
const CRIADA = new Date('2026-10-22T12:00:00Z');
const espera = (tipo: string, extra: Record<string, unknown> = {}) => ({ id: 'e1', businessId: 'b1', phoneKey: 'k', tipo, appointmentId: 'a1', expiresAt: new Date(), createdAt: CRIADA, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  repo.pendentes.mockResolvedValue([]);
  repo.houveSaidaDepois.mockResolvedValue(false);
  repo.statusDoAgendamento.mockResolvedValue('confirmado');
  repo.marcarConfirmadoPeloCliente.mockResolvedValue(true);
  repo.salvarNota.mockResolvedValue(true);
  configs.confirmacao = { hora: '09:00', textoConfirmado: null, textoCancelado: null };
  configs.avaliacao = { horas: 2, linkGoogle: 'https://g.page/x', textoNota: null, textoGoogle: null };
  auto.obter.mockImplementation(async (_b: string, regra: string) => ({ config: configs[regra] }));
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
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(true);
  expect(repo.marcarConfirmadoPeloCliente).toHaveBeenCalledWith('a1', 'b1', expect.any(Date));
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(base.phone, 'Obrigada! Seu horário está confirmado ✨', expect.objectContaining({ origin: 'sistema' }));
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + "2": cancela, pede humano, avisa', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(true);
  expect(appts.updateStatus).toHaveBeenCalledWith('a1', 'b1', 'cancelado');
  expect(rec.pedirAtendimentoHumano).toHaveBeenCalledWith('b1', base.phone);
  expect(rec.avisoDoSistema).toHaveBeenCalledWith('b1', base.phone, 'Pediu para reagendar pelo WhatsApp');
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + "2" com agendamento já não confirmado: só apaga e false', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  repo.statusDoAgendamento.mockResolvedValue('cancelado');
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(false);
  expect(appts.updateStatus).not.toHaveBeenCalled();
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação + texto livre: false e espera continua', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  expect(await respostas.tratar({ ...base, texto: 'oi, tudo bem?' })).toBe(false);
  expect(repo.apagar).not.toHaveBeenCalled();
});

it('avaliação 5 com link: duas mensagens', async () => {
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  expect(await respostas.tratar({ ...base, texto: '5' })).toBe(true);
  expect(repo.salvarNota).toHaveBeenCalledWith({ businessId: 'b1', appointmentId: 'a1', rating: 5 });
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledTimes(2);
  expect(msg.sendWhatsAppMessage.mock.calls[1][1]).toBe('Que bom que gostou! Se puder, deixe sua avaliação no Google: https://g.page/x');
});

it('nota descartada (já existia): só apaga a espera, sem agradecimento, Google nem alerta', async () => {
  repo.salvarNota.mockResolvedValue(false);
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(true);
  expect(repo.apagar).toHaveBeenCalledWith('e1');
  expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(rec.pedirAtendimentoHumano).not.toHaveBeenCalled();
  expect(rec.avisoDoSistema).not.toHaveBeenCalled();
});

it('avaliação 2: pede humano e avisa', async () => {
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(true);
  expect(rec.pedirAtendimentoHumano).toHaveBeenCalled();
  expect(rec.avisoDoSistema).toHaveBeenCalledWith('b1', base.phone, 'Avaliação baixa (2) — vale falar com ela');
});

it('erro interno: false', async () => {
  repo.pendentes.mockRejectedValue(new Error('x'));
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(false);
});

it('confirmação + "2" com cancelamento falhando: não responde "Liberamos" e não consome', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  appts.updateStatus.mockRejectedValueOnce(new Error('falhou'));
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(false);
  expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  expect(repo.apagar).not.toHaveBeenCalled();
});

it('conversa com humano: não trata', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  expect(await respostas.tratar({ ...base, texto: '2', atendimentoHumano: true })).toBe(false);
  expect(appts.updateStatus).not.toHaveBeenCalled();
  expect(repo.apagar).not.toHaveBeenCalled();
});

it('sessão do robô ativa desde depois da espera: não trata', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  const sessaoRoboDesde = new Date(CRIADA.getTime() + 60_000);
  expect(await respostas.tratar({ ...base, texto: '2', sessaoRoboDesde })).toBe(false);
  expect(appts.updateStatus).not.toHaveBeenCalled();
});

it('sessão do robô anterior à espera: trata normalmente', async () => {
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  const sessaoRoboDesde = new Date(CRIADA.getTime() - 60_000);
  expect(await respostas.tratar({ ...base, texto: '1', sessaoRoboDesde })).toBe(true);
  expect(repo.marcarConfirmadoPeloCliente).toHaveBeenCalled();
});

it('saída do robô ou da equipe depois da espera: não trata e apaga a espera', async () => {
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  repo.houveSaidaDepois.mockResolvedValue(true);
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(false);
  expect(repo.houveSaidaDepois).toHaveBeenCalledWith('b1', expect.any(String), CRIADA);
  expect(repo.salvarNota).not.toHaveBeenCalled();
  expect(repo.apagar).toHaveBeenCalledWith('e1');
});

it('confirmação e avaliação pendentes + "1": confirma e não vira nota', async () => {
  repo.pendentes.mockResolvedValue([
    espera('avaliacao', { id: 'e2', appointmentId: 'a2', createdAt: new Date(CRIADA.getTime() + 3_600_000) }),
    espera('confirmacao'),
  ]);
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(true);
  expect(repo.marcarConfirmadoPeloCliente).toHaveBeenCalledWith('a1', 'b1', expect.any(Date));
  expect(repo.salvarNota).not.toHaveBeenCalled();
  expect(repo.apagar).toHaveBeenCalledWith('e1');
  expect(repo.apagar).not.toHaveBeenCalledWith('e2');
});

it('confirmação e avaliação pendentes + "4": vira nota da avaliação', async () => {
  repo.pendentes.mockResolvedValue([
    espera('avaliacao', { id: 'e2', appointmentId: 'a2' }),
    espera('confirmacao'),
  ]);
  expect(await respostas.tratar({ ...base, texto: '4' })).toBe(true);
  expect(repo.salvarNota).toHaveBeenCalledWith({ businessId: 'b1', appointmentId: 'a2', rating: 4 });
  expect(repo.marcarConfirmadoPeloCliente).not.toHaveBeenCalled();
});

it('confirmação com agendamento já cancelado + "2" e avaliação pendente: não vira nota', async () => {
  repo.pendentes.mockResolvedValue([espera('avaliacao', { id: 'e2', appointmentId: 'a2' }), espera('confirmacao')]);
  repo.statusDoAgendamento.mockResolvedValue('cancelado');
  expect(await respostas.tratar({ ...base, texto: '2' })).toBe(false);
  expect(repo.salvarNota).not.toHaveBeenCalled();
});

it('confirmação "1" com textoConfirmado personalizado: envia o texto da regra', async () => {
  configs.confirmacao.textoConfirmado = 'Fechado, até lá!';
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  await respostas.tratar({ ...base, texto: '1' });
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(base.phone, 'Fechado, até lá!', expect.any(Object));
  expect(auto.obter).toHaveBeenCalledTimes(1);
});

it('confirmação "2" com textoCancelado personalizado: envia o texto da regra', async () => {
  configs.confirmacao.textoCancelado = 'Sem problema, vamos remarcar.';
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  await respostas.tratar({ ...base, texto: '2' });
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(base.phone, 'Sem problema, vamos remarcar.', expect.any(Object));
});

it('confirmação: falha ao ler a regra usa o texto padrão', async () => {
  auto.obter.mockRejectedValue(new Error('x'));
  repo.pendentes.mockResolvedValue([espera('confirmacao')]);
  expect(await respostas.tratar({ ...base, texto: '1' })).toBe(true);
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(base.phone, 'Obrigada! Seu horário está confirmado ✨', expect.any(Object));
});

it('avaliação 5 com textoNota e textoGoogle: preenche {link}', async () => {
  configs.avaliacao.textoNota = 'Gratidão pela nota!';
  configs.avaliacao.textoGoogle = 'Avalie: {link}';
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  await respostas.tratar({ ...base, texto: '5' });
  expect(msg.sendWhatsAppMessage.mock.calls.map((c) => c[1])).toEqual(['Gratidão pela nota!', 'Avalie: https://g.page/x']);
  expect(auto.obter).toHaveBeenCalledTimes(1);
});

it('avaliação 5 sem link do Google: só o agradecimento, mesmo com textoGoogle com {link}', async () => {
  configs.avaliacao.linkGoogle = null;
  configs.avaliacao.textoGoogle = 'Avalie: {link}';
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  await respostas.tratar({ ...base, texto: '5' });
  expect(msg.sendWhatsAppMessage.mock.calls.map((c) => c[1])).toEqual(['Obrigada pela nota!']);
});

it('avaliação 4 com textoNota: agradece com o texto da regra e não convida ao Google', async () => {
  configs.avaliacao.textoNota = 'Valeu!';
  repo.pendentes.mockResolvedValue([espera('avaliacao')]);
  await respostas.tratar({ ...base, texto: '4' });
  expect(msg.sendWhatsAppMessage.mock.calls.map((c) => c[1])).toEqual(['Valeu!']);
});
