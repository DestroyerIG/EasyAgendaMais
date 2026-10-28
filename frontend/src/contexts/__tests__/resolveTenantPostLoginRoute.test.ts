import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoConta } from '@/lib/conta';

const estado = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/conta', () => ({ contaApi: { estado } }));
vi.mock('@/lib/api', () => ({ default: { get: apiGet, post: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/login', useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import { resolveTenantPostLoginRoute } from '../AuthContext';

const cobrancaPendente = { data: { subscriptionStatus: 'past_due', paymentRequired: true, desiredPlan: 'premium' } };

describe('resolveTenantPostLoginRoute com o estado da conta', () => {
  beforeEach(() => {
    estado.mockReset();
    apiGet.mockReset();
    apiGet.mockResolvedValue(cobrancaPendente);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('ativa vai para o painel (mesmo com Pix antecipado que o billing chama de pendente)', async () => {
    estado.mockResolvedValue({ tipo: 'ativa' } satisfies EstadoConta);
    await expect(resolveTenantPostLoginRoute()).resolves.toBe('/dashboard');
    await expect(resolveTenantPostLoginRoute('/dashboard/clientes')).resolves.toBe('/dashboard/clientes');
  });

  it('carência vai para a tela da assinatura, não para o checkout', async () => {
    estado.mockResolvedValue({ tipo: 'carencia', desde: '2026-10-25', ate: '2026-11-01', diasRestantes: 4 } satisfies EstadoConta);
    await expect(resolveTenantPostLoginRoute()).resolves.toBe('/dashboard/assinatura');
  });

  it.each(['cobranca', 'cancelada'] as const)('bloqueada por %s vai para a tela da assinatura', async (motivo) => {
    estado.mockResolvedValue({ tipo: 'bloqueada', motivo } satisfies EstadoConta);
    await expect(resolveTenantPostLoginRoute()).resolves.toBe('/dashboard/assinatura');
  });

  it('bloqueada por teste (nunca pagou) segue para o /pagamento', async () => {
    estado.mockResolvedValue({ tipo: 'bloqueada', motivo: 'teste' } satisfies EstadoConta);
    await expect(resolveTenantPostLoginRoute()).resolves.toBe('/pagamento?plan=premium');
  });

  it('se o estado falhar, segue a regra antiga do billing', async () => {
    estado.mockRejectedValue(new Error('rede'));
    await expect(resolveTenantPostLoginRoute()).resolves.toBe('/pagamento?plan=premium');
  });
});
