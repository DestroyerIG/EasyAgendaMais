import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockSearch = vi.hoisted(() => ({ value: '' }));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { AppointmentModule } = await import('../AppointmentModule');

describe('AppointmentModule', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockReplace.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockImplementation(() => Promise.resolve({ data: [] }));
  });

  it('abrir a Agenda com ?novo=1 carrega os dados do formulário de criação (clientes, profissionais e serviços)', async () => {
    mockSearch.value = 'novo=1';
    render(<AppointmentModule />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/clients');
      expect(mockApiGet).toHaveBeenCalledWith('/business/professionals');
      expect(mockApiGet).toHaveBeenCalledWith('/business/services');
    });
  });

  it('sem ?novo=1 não carrega os dados do formulário de criação', async () => {
    render(<AppointmentModule />);

    // Deixa os efeitos de montagem (data + agendamentos) rodarem antes de checar.
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/appointments', expect.anything());
    });

    expect(mockApiGet).not.toHaveBeenCalledWith('/clients');
    expect(mockApiGet).not.toHaveBeenCalledWith('/business/professionals');
    expect(mockApiGet).not.toHaveBeenCalledWith('/business/services');
  });
});
