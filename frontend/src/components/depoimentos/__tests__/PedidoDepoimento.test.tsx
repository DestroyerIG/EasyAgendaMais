import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const api = vi.hoisted(() => ({
  meu: vi.fn(),
  enviar: vi.fn(),
  adiar: vi.fn(),
  dispensar: vi.fn(),
  retirar: vi.fn(),
}));
vi.mock('@/lib/depoimentos', () => ({ depoimentosApi: api }));

import { PedidoDepoimento } from '../PedidoDepoimento';

const TITULO = 'Como está sendo o EasyAgenda+ pra você?';

vi.setConfig({ testTimeout: 30000 });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  window.sessionStorage.clear();
  api.meu.mockResolvedValue({ mostrarPopup: true, nomeSugerido: 'Ana', atual: null });
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('PedidoDepoimento', () => {
  it('abre quando mostrarPopup é true', async () => {
    render(<PedidoDepoimento />);
    expect(await screen.findByText(TITULO)).toBeInTheDocument();
  });

  it('não abre com outro diálogo no documento', async () => {
    const outro = document.createElement('div');
    outro.setAttribute('role', 'dialog');
    document.body.appendChild(outro);
    render(<PedidoDepoimento />);
    await waitFor(() => expect(api.meu).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });

  it('não consulta de novo na mesma sessão depois de uma consulta concluída', async () => {
    api.meu.mockResolvedValue({ mostrarPopup: false, nomeSugerido: 'Ana', atual: null });
    const { unmount } = render(<PedidoDepoimento />);
    await waitFor(() => expect(api.meu).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    unmount();
    render(<PedidoDepoimento />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.meu).toHaveBeenCalledTimes(1);
  });

  it('falha de meu() é silenciosa', async () => {
    api.meu.mockRejectedValue(new Error('x'));
    const { container } = render(<PedidoDepoimento />);
    await waitFor(() => expect(api.meu).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre também dentro de React.StrictMode', async () => {
    render(<StrictMode><PedidoDepoimento /></StrictMode>);
    expect(await screen.findByText(TITULO)).toBeInTheDocument();
  });
});
