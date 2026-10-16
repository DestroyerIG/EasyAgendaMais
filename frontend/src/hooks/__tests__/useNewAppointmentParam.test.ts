import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSearch = vi.hoisted(() => ({ value: '' }));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const { useNewAppointmentParam } = await import('../useNewAppointmentParam');

describe('useNewAppointmentParam', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockReplace.mockReset();
  });

  it('abre quando o endereço tem novo=1', () => {
    mockSearch.value = 'novo=1';
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.open).toBe(true);
  });

  it('lê a cliente pré-escolhida de cliente=<id>', () => {
    mockSearch.value = 'novo=1&cliente=c9';
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.clienteId).toBe('c9');
  });

  it('sem cliente=<id>, clienteId é null', () => {
    mockSearch.value = 'novo=1';
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.clienteId).toBeNull();
  });

  it('não abre sem o parâmetro', () => {
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.open).toBe(false);
  });

  it('limpar remove o parâmetro do endereço', () => {
    mockSearch.value = 'novo=1';
    const { result } = renderHook(() => useNewAppointmentParam());
    act(() => result.current.clear());
    expect(mockReplace).toHaveBeenCalledWith('/agendamentos', { scroll: false });
  });

  it('limpar sem o parâmetro não navega', () => {
    const { result } = renderHook(() => useNewAppointmentParam());
    act(() => result.current.clear());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
