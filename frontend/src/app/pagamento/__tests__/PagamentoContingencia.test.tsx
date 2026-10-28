import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoConta } from '@/lib/conta';

const replace = vi.hoisted(() => vi.fn());
const estado = vi.hoisted(() => vi.fn());
const getStatus = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'tenant_admin' }, loading: false, logout: vi.fn() }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/conta', () => ({ contaApi: { estado } }));
vi.mock('@/lib/billing', () => ({ billingApi: { getStatus } }));

import PagamentoPage from '../page';

describe('/pagamento na contingência', () => {
  beforeEach(() => {
    replace.mockReset();
    estado.mockReset();
    getStatus.mockReset();
    getStatus.mockResolvedValue({ subscriptionStatus: 'past_due', paymentRequired: true, plan: 'premium' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it.each([
    [{ tipo: 'carencia', desde: '2026-10-25', ate: '2026-11-01', diasRestantes: 4 }],
    [{ tipo: 'bloqueada', motivo: 'cobranca' }],
  ] as [EstadoConta][])('%o vai para a tela da assinatura (sem segunda assinatura)', async (e) => {
    estado.mockResolvedValue(e);
    render(<PagamentoPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/assinatura'));
  });

  it('bloqueada por teste fica no checkout', async () => {
    estado.mockResolvedValue({ tipo: 'bloqueada', motivo: 'teste' });
    render(<PagamentoPage />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    await waitFor(() => expect(estado).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  it('se o estado falhar, fica no checkout', async () => {
    estado.mockRejectedValue(new Error('rede'));
    render(<PagamentoPage />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});
