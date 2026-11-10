import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfinitePayFormulario } from '../InfinitePayFormulario';
import { recebimentosApi, type EstadoRecebimentos } from '@/lib/recebimentos';

vi.mock('@/lib/recebimentos', () => ({ recebimentosApi: { conectarChave: vi.fn() } }));

const estado: EstadoRecebimentos = {
  configurado: true,
  disponiveis: ['infinitepay'],
  conexao: {
    gateway: 'infinitepay', situacao: 'ativa', contaNome: '$loja', aceitaPix: true, aceitaCartao: true,
    aceiteCartaoEm: null, ultimaConfirmacaoEm: null, reservasPendentes: 0,
  },
};

describe('InfinitePayFormulario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('conecta com os campos preenchidos e entrega o estado a onConectado', async () => {
    vi.mocked(recebimentosApi.conectarChave).mockResolvedValue(estado);
    const onConectado = vi.fn();
    render(<InfinitePayFormulario onConectado={onConectado} />);
    const botao = screen.getByRole('button', { name: 'Conectar' });
    expect(botao).toBeDisabled();
    await userEvent.type(screen.getByLabelText('InfiniteTag'), ' $loja ');
    await userEvent.type(screen.getByLabelText('Chave de API'), 'abc123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(botao);
    await waitFor(() => expect(onConectado).toHaveBeenCalledWith(estado));
    expect(recebimentosApi.conectarChave).toHaveBeenCalledWith({ handle: '$loja', chave: 'abc123', aceite: true });
  });
});
