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
const { PROMOCOES_PADRAO_ANTIGO, DEFAULT_BOT_CONFIG } = await import('../services/whatsapp/whatsappConstants.js');

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
