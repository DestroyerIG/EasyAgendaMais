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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Este teste cobre só o polling de status: as chamadas da central de conversas e do resumo da
// conexão ficam fora (devolvem listas vazias) para não depender do formato delas.
vi.mock('@/lib/whatsappInbox', () => ({
  listarConversas: () => Promise.resolve({
    itens: [], proximoCursor: null,
    contadores: { todas: 0, aguardando: 0, bot: 0, finalizadas: 0 },
  }),
  buscarResumoConexao: () => new Promise(() => {}),
  buscarConversa: () => new Promise(() => {}),
  listarMensagens: () => Promise.resolve({ itens: [], temMais: false }),
  buscarRespostasRapidas: () => Promise.resolve([]),
  marcarLidas: () => Promise.resolve({ atualizadas: 0 }),
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

  it('depois de um erro, o próximo intervalo já usa "provider_unavailable" (30s) — não o último status bem-sucedido (achado da varredura: waStatusRef ficava um passo atrás do state)', async () => {
    let falhaNaProximaChamada = false;
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/whatsapp/status') {
        if (falhaNaProximaChamada) return Promise.reject(new Error('network error'));
        return Promise.resolve({
          data: { status: 'connected', qrCode: null, connectedNumber: '5599999999', connectedName: null, error: null },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<WhatsAppModule />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(chamadasDeStatus()).toBe(1);

    falhaNaProximaChamada = true;
    // "connected" usa intervalo de 60s — a chamada seguinte falha e cai em "provider_unavailable".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(chamadasDeStatus()).toBe(2);

    // Se o ref não tivesse atualizado, o próximo intervalo continuaria em 60s (o último
    // status bem-sucedido); com o ref atualizado, "provider_unavailable" usa 30s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(chamadasDeStatus()).toBe(3);
  });
});
