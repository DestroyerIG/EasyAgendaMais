import { vi, describe, it, expect } from 'vitest';

vi.mock('../services/whatsappClient.js', () => ({ sendWhatsAppText: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { formatMessage } = await import('../services/whatsapp/whatsappMessageService.js');

describe('formatMessage', () => {
  it('troca horário de atendimento e hora de fechamento', () => {
    expect(formatMessage('Das {horario_atendimento}, até as {hora_fechamento}.', { horarioAtendimento: '08:00 às 18:00', horaFechamento: '18:00' }))
      .toBe('Das 08:00 às 18:00, até as 18:00.');
  });

  it('troca a mesma variável mais de uma vez e esvazia a que não tem dado', () => {
    expect(formatMessage('{nome_negocio} / {nome_negocio} / {valor}', { businessName: 'Studio' })).toBe('Studio / Studio / ');
  });
});
