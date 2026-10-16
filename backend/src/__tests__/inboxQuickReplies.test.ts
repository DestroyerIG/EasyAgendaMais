import { it, expect, vi, beforeEach } from 'vitest';
const repo = vi.hoisted(() => ({ dadosRespostas: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const today = vi.hoisted(() => ({ proximasVagas: vi.fn() }));
vi.mock('../modules/dashboard/today.service.js', () => today);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const { respostasRapidas } = await import('../modules/whatsappInbox/quickReplies.js');

const AGORA = new Date('2026-10-16T13:00:00.000Z'); // sexta 10:00 em São Paulo
beforeEach(() => {
  repo.dadosRespostas.mockResolvedValue({ negocio: 'Studio Aurora', pixKey: 'pix@aurora.com', pixKeyType: 'email', endereco: 'Rua das Flores, 142 - João Pessoa', politica: 'Cancelamentos até 24h antes.' });
  today.proximasVagas.mockResolvedValue([
    { data: '2026-10-16', inicio: '14:30', profissional: 'Camila' },
    { data: '2026-10-21', inicio: '10:00', profissional: 'Bruna' },
  ]);
});

it('monta as quatro respostas com dados do negócio', async () => {
  const r = await respostasRapidas('b1', AGORA);
  expect(r.map((x) => x.chave)).toEqual(['pix', 'como_chegar', 'horarios', 'politica']);
  expect(r[0]!.texto).toBe('Segue a chave Pix do Studio Aurora:\nChave E-mail: pix@aurora.com');
  expect(r[1]!.texto).toBe('Rua das Flores, 142 - João Pessoa\nNo mapa: https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20142%20-%20Jo%C3%A3o%20Pessoa');
  expect(r[2]!.texto).toBe('Temos estes horários livres:\n• Hoje 14:30 com Camila\n• Qua 10:00 com Bruna\nQual fica melhor para você?');
  expect(r[3]!.texto).toBe('Cancelamentos até 24h antes.');
  expect(r.every((x) => x.disponivel)).toBe(true);
});

it('sem dados: indisponíveis com motivo', async () => {
  repo.dadosRespostas.mockResolvedValue({ negocio: 'X', pixKey: null, pixKeyType: null, endereco: '  ', politica: null });
  today.proximasVagas.mockResolvedValue([]);
  const r = await respostasRapidas('b1', AGORA);
  expect(r.map((x) => [x.disponivel, x.motivo])).toEqual([
    [false, 'Cadastre a chave Pix em Ajustes'], [false, 'Cadastre o endereço em Ajustes'],
    [false, 'Sem horários livres nos próximos 7 dias'], [false, 'Cadastre o texto em Automações › Mensagens'],
  ]);
  expect(r.every((x) => x.texto === null)).toBe(true);
});
