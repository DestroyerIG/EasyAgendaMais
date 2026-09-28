import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * Cobre só o polling adaptativo de /whatsapp/status (WhatsAppModule.tsx, useEffect perto da
 * linha 232). Esta tela é a que mais chama a API do módulo (18 chamadas ao todo) e o laço de
 * polling é o comportamento mais fácil de quebrar sem querer ao mexer na JSX — se alguém
 * mover o estado do intervalo para dentro de outro efeito, ou duplicar o useEffect, a
 * contagem de chamadas aqui muda. Ela precisa continuar em 1 chamada por montagem e mais
 * uma por intervalo decorrido, nunca dobrando nem parando de disparar.
 */

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiPut = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { businessId: 'b1' } }),
}));

const { WhatsAppModule } = await import('../WhatsAppModule');

function disconnectedStatusResponse() {
  return {
    data: {
      status: 'disconnected',
      qrCode: null,
      connectedNumber: null,
      connectedName: null,
      error: null,
    },
  };
}

describe('WhatsAppModule — polling de /whatsapp/status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/whatsapp/status') return Promise.resolve(disconnectedStatusResponse());
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const chamadasDeStatus = () =>
    mockApiGet.mock.calls.filter(([url]) => url === '/whatsapp/status').length;

  it('faz 1 chamada ao montar e repete no intervalo do estado "disconnected" (8s), sem dobrar nem parar', async () => {
    render(<WhatsAppModule />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(chamadasDeStatus()).toBe(1);
    expect(screen.getAllByText('Desconectado').length).toBeGreaterThan(0);

    // Estado "disconnected" usa intervalo de 8s (getIntervalMs, WhatsAppModule.tsx).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(chamadasDeStatus()).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(chamadasDeStatus()).toBe(3);

    // Avançar menos que o intervalo não deve disparar uma quarta chamada.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(chamadasDeStatus()).toBe(3);
  });

  it('cancela o loop ao desmontar — nenhuma chamada extra depois do unmount', async () => {
    const { unmount } = render(<WhatsAppModule />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(chamadasDeStatus()).toBe(1);

    unmount();
    const chamadasAoDesmontar = chamadasDeStatus();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(chamadasDeStatus()).toBe(chamadasAoDesmontar);
  });
});
