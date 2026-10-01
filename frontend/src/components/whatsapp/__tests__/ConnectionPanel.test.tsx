import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionPanel } from '../ConnectionPanel';

const baseStatus = {
  qrCode: null,
  connectedNumber: null,
  connectedName: null,
  error: null,
};

describe('ConnectionPanel', () => {
  it('mostra o chip "Conectado" com tom de sucesso quando conectado', () => {
    render(
      <ConnectionPanel
        waStatus={{ ...baseStatus, status: 'connected' }}
        statusLoading={false}
        actionLoading={false}
        lastSyncedAt={null}
        onConnect={vi.fn()}
      />,
    );

    const chip = screen.getByText('Conectado');
    expect(chip).toHaveClass('text-success');
  });

  it('mostra o chip "Desconectado" com tom de perigo quando desconectado', () => {
    render(
      <ConnectionPanel
        waStatus={{ ...baseStatus, status: 'disconnected' }}
        statusLoading={false}
        actionLoading={false}
        lastSyncedAt={null}
        onConnect={vi.fn()}
      />,
    );

    const chip = screen.getByText('Desconectado');
    expect(chip).toHaveClass('text-danger');
  });

  it('mostra o chip "Conectando" com tom de aviso durante o pareamento', () => {
    render(
      <ConnectionPanel
        waStatus={{ ...baseStatus, status: 'pairing', qrCode: 'data:image/png;base64,abc' }}
        statusLoading={false}
        actionLoading={false}
        lastSyncedAt={null}
        onConnect={vi.fn()}
      />,
    );

    const chip = screen.getByText('Conectando');
    expect(chip).toHaveClass('text-warning');
  });

  it('mostra as boas práticas anti-bloqueio com as tags reais de mensagem, sem nenhuma menção a Meta/WABA (achado da varredura de telas)', () => {
    render(
      <ConnectionPanel
        waStatus={{ ...baseStatus, status: 'connected' }}
        statusLoading={false}
        actionLoading={false}
        lastSyncedAt={null}
        onConnect={vi.fn()}
      />,
    );

    expect(screen.getByText('Boas Práticas & Dicas Anti-bloqueio')).toBeInTheDocument();
    expect(screen.getByText(/\{nome_cliente\}/)).toBeInTheDocument();
    expect(screen.queryByText(/Meta|WABA|Business API/)).not.toBeInTheDocument();
  });
});
