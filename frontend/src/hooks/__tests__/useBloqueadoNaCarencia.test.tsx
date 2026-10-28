import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoConta } from '@/lib/conta';
import { useBloqueadoNaCarencia } from '../useBloqueadoNaCarencia';

const estado = vi.hoisted(() => ({ atual: null as EstadoConta | null }));
vi.mock('@/hooks/useEstadoConta', () => ({ useEstadoConta: () => ({ estado: estado.atual, recarregar: vi.fn() }) }));

describe('useBloqueadoNaCarencia', () => {
  beforeEach(() => {
    estado.atual = null;
  });

  it('em carência bloqueia e traz a dica', () => {
    estado.atual = { tipo: 'carencia', desde: '2026-10-20', ate: '2026-10-27', diasRestantes: 3 };
    const { result } = renderHook(() => useBloqueadoNaCarencia());
    expect(result.current).toEqual({ bloqueado: true, dica: 'Disponível depois de regularizar' });
  });

  it('ativa ou sem estado não bloqueia', () => {
    estado.atual = { tipo: 'ativa' };
    expect(renderHook(() => useBloqueadoNaCarencia()).result.current).toEqual({ bloqueado: false, dica: undefined });
    estado.atual = null;
    expect(renderHook(() => useBloqueadoNaCarencia()).result.current.bloqueado).toBe(false);
  });
});
