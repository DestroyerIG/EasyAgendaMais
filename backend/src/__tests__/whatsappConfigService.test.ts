import { vi, describe, it, expect } from 'vitest';

const mockFindFirst = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({
  prisma: {
    whatsappBotConfig: { findFirst: mockFindFirst },
    businessSettings: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { getBotConfig } = await import('../services/whatsapp/whatsappConfigService.js');
const { PROMOCOES_PADRAO_ANTIGO, PADROES_ANTIGOS, DEFAULT_BOT_CONFIG } = await import('../services/whatsapp/whatsappConstants.js');

describe('getBotConfig padrões antigos gravados', () => {
  const colunas = {
    welcome_header: 'welcomeHeader',
    attendant_message: 'attendantMessage',
    cancel_no_appointments_message: 'cancelNoAppointmentsMessage',
    reschedule_no_appointments_message: 'rescheduleNoAppointmentsMessage',
    instagram_message: 'instagramMessage',
  } as const;

  it.each(Object.entries(colunas))('%s salvo igual ao antigo vira o padrão atual', async (chave, coluna) => {
    const antigo = PADROES_ANTIGOS[chave as keyof typeof PADROES_ANTIGOS] as string;
    expect(antigo).toBeTruthy();
    mockFindFirst.mockResolvedValue({ [coluna]: antigo });
    const cfg = await getBotConfig('b1');
    expect(cfg[chave as keyof typeof cfg]).toBe(DEFAULT_BOT_CONFIG[chave as keyof typeof DEFAULT_BOT_CONFIG]);
  });

  it('texto parecido mas diferente fica como o dono escreveu', async () => {
    mockFindFirst.mockResolvedValue({ attendantMessage: `${PADROES_ANTIGOS.attendant_message} ` });
    expect((await getBotConfig('b1')).attendant_message).toBe(`${PADROES_ANTIGOS.attendant_message} `);
  });
});

describe('getBotConfig promoções', () => {
  it('texto salvo igual ao padrão antigo volta vazio', async () => {
    mockFindFirst.mockResolvedValue({ promotionsMessage: PROMOCOES_PADRAO_ANTIGO });
    expect((await getBotConfig('b1')).promotions_message).toBe('');
  });
  it('texto próprio é mantido e o padrão novo é vazio', async () => {
    mockFindFirst.mockResolvedValue({ promotionsMessage: '10% na terça' });
    expect((await getBotConfig('b1')).promotions_message).toBe('10% na terça');
    expect(DEFAULT_BOT_CONFIG.promotions_message).toBe('');
  });
});
