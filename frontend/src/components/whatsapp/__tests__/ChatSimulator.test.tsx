import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatSimulator } from '../ChatSimulator';

const montar = (sobrescrever: Partial<React.ComponentProps<typeof ChatSimulator>> = {}) => {
  const props = {
    onSendMessage: vi.fn().mockResolvedValue(['um', 'dois', 'tres']),
    onLimpar: vi.fn().mockResolvedValue(undefined),
    temAlteracoes: false,
    ...sobrescrever,
  };
  render(<ChatSimulator {...props} />);
  return props;
};

describe('ChatSimulator', () => {
  it('mostra cada resposta do robo em um balao', async () => {
    montar();
    await userEvent.type(screen.getByPlaceholderText('Envie uma mensagem...'), 'oi{enter}');

    expect(await screen.findByText('um')).toBeInTheDocument();
    expect(screen.getByText('dois')).toBeInTheDocument();
    expect(screen.getByText('tres')).toBeInTheDocument();
  });

  it('avisa que o teste usa as mensagens salvas quando ha alteracoes', () => {
    montar({ temAlteracoes: true });
    expect(screen.getByText(/O teste usa as mensagens salvas/)).toBeInTheDocument();
  });

  it('nao mostra o aviso sem alteracoes', () => {
    montar();
    expect(screen.queryByText(/O teste usa as mensagens salvas/)).not.toBeInTheDocument();
  });

  it('Limpar chama onLimpar e esvazia a conversa', async () => {
    const props = montar();
    await userEvent.type(screen.getByPlaceholderText('Envie uma mensagem...'), 'oi{enter}');
    await screen.findByText('um');

    await userEvent.click(screen.getByRole('button', { name: /Limpar/ }));

    expect(props.onLimpar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('um')).not.toBeInTheDocument());
  });
});
