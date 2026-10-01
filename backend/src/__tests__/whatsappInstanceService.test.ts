import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockFindWhatsAppInstanceContextByBusinessId = vi.hoisted(() => vi.fn());
const mockEnsureWhatsAppInstanceName = vi.hoisted(() => vi.fn());

vi.mock('../repositories/businessSettingsRepository.js', () => ({
  businessSettingsRepository: {
    findWhatsAppInstanceContextByBusinessId: mockFindWhatsAppInstanceContextByBusinessId,
    ensureWhatsAppInstanceName: mockEnsureWhatsAppInstanceName,
  },
}));

const {
  normalizeWhatsAppInstanceName,
  buildDeterministicWhatsAppInstanceName,
  getBusinessWhatsAppInstanceContext,
  ensureBusinessWhatsAppInstanceName,
} = await import('../services/whatsapp/whatsappInstanceService.js');

describe('whatsappInstanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes instance names to lowercase safe tokens', () => {
    expect(normalizeWhatsAppInstanceName(' Negócio São João #1 ')).toBe('negocio-sao-joao-1');
  });

  it('builds deterministic unique names per business', () => {
    const a = buildDeterministicWhatsAppInstanceName({
      businessId: 'shop-12345678',
      shopName: 'Studio Corte',
    });

    const b = buildDeterministicWhatsAppInstanceName({
      businessId: 'shop-87654321',
      shopName: 'Studio Corte',
    });

    expect(a).toBe('studio-corte_12345678');
    expect(b).toBe('studio-corte_87654321');
    expect(a).not.toBe(b);
  });

  it('returns persisted instance context already linked to the business', async () => {
    mockFindWhatsAppInstanceContextByBusinessId.mockResolvedValue({
      id: 'tenant-1',
      name: 'Professional Prime',
      active: true,
      whatsappInstanceName: 'PROFESSIONAL_PRIME_ABC12345',
    });

    const result = await getBusinessWhatsAppInstanceContext('tenant-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-1',
        whatsappInstanceName: 'professional_prime_abc12345',
      })
    );
  });

  it('creates and persists a new instance name for a new business', async () => {
    mockEnsureWhatsAppInstanceName.mockImplementation(async (_businessId: string, builder: (ctx: { id: string; name: string }) => string) => ({
      id: 'tenant-2',
      name: 'Negócio Elite',
      active: true,
      whatsappInstanceName: builder({
        id: 'tenant-2',
        name: 'Negócio Elite',
      }),
      createdNow: true,
    }));

    const result = await ensureBusinessWhatsAppInstanceName('tenant-2');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-2',
        whatsappInstanceName: 'negocio-elite_tenant2',
      })
    );
  });

  it('reuses the same persisted instance instead of regenerating it', async () => {
    mockEnsureWhatsAppInstanceName.mockResolvedValue({
      id: 'tenant-3',
      name: 'Joao Professional',
      active: true,
      whatsappInstanceName: 'joao-professional_tenant3',
      createdNow: false,
    });

    const result = await ensureBusinessWhatsAppInstanceName('tenant-3');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tenant-3',
        whatsappInstanceName: 'joao-professional_tenant3',
      })
    );
    expect(mockEnsureWhatsAppInstanceName).toHaveBeenCalledTimes(1);
  });
});
