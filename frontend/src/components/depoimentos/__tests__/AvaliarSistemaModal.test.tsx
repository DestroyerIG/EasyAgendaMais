import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  meu: vi.fn(),
  enviar: vi.fn(),
  adiar: vi.fn(),
  dispensar: vi.fn(),
  retirar: vi.fn(),
}));
vi.mock('@/lib/depoimentos', () => ({ depoimentosApi: api }));

import { AvaliarSistemaModal } from '../AvaliarSistemaModal';

const TEXTO_OK = 'Sistema muito bom, organiza toda a minha agenda.';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.meu.mockResolvedValue({ mostrarPopup: true, nomeSugerido: 'Ana Souza', atual: null });
  api.enviar.mockResolvedValue(undefined);
  api.adiar.mockResolvedValue(undefined);
  api.dispensar.mockResolvedValue(undefined);
  api.retirar.mockResolvedValue(undefined);
});

describe('AvaliarSistemaModal', () => {
  it('nota 5 mostra a autorização e o nome sugerido', async () => {
    const user = userEvent.setup();
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: '5 estrelas' }));
    expect(screen.getByText('Que bom! Conta pra outros profissionais?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Autorizo exibir este depoimento/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome exibido')).toHaveValue('Ana Souza');
    expect(screen.getByText('Sem marcar a autorização, vai só como avaliação interna.')).toBeInTheDocument();
  });

  it('nota 2 mostra o aviso interno e não mostra a autorização', async () => {
    const user = userEvent.setup();
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: '2 estrelas' }));
    expect(screen.getByText('Vai direto para os responsáveis pelo sistema. Não aparece no site.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Autorizo exibir/)).not.toBeInTheDocument();
  });

  it('"Agora não" chama adiar e fecha', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AvaliarSistemaModal isOpen onClose={onClose} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(api.adiar).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('"Não perguntar mais" chama dispensar', async () => {
    const user = userEvent.setup();
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: 'Não perguntar mais' }));
    await waitFor(() => expect(api.dispensar).toHaveBeenCalled());
  });

  it('pelo menu não mostra adiar nem dispensar', async () => {
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="menu" />);
    await screen.findByRole('button', { name: '5 estrelas' });
    expect(screen.queryByRole('button', { name: 'Agora não' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Não perguntar mais' })).not.toBeInTheDocument();
  });

  it('nota 5 sem marcar a autorização envia autorizou false', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AvaliarSistemaModal isOpen onClose={onClose} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Seu depoimento'), TEXTO_OK);
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalledTimes(1));
    expect(api.enviar.mock.calls[0][0]).toMatchObject({ nota: 5, texto: TEXTO_OK, autorizou: false });
  });

  it('nota 2 envia sem autorizou true, nome nem cidade', async () => {
    const user = userEvent.setup();
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="popup" />);
    await user.click(await screen.findByRole('button', { name: '2 estrelas' }));
    await user.type(screen.getByLabelText('O que podemos melhorar?'), 'Faltam coisas');
    await user.click(screen.getByRole('button', { name: 'Enviar para a equipe' }));
    await waitFor(() => expect(api.enviar).toHaveBeenCalledWith({ nota: 2, texto: 'Faltam coisas', autorizou: false }));
  });

  it('pelo menu mostra a situação e permite retirar', async () => {
    const user = userEvent.setup();
    api.meu.mockResolvedValue({
      mostrarPopup: false,
      nomeSugerido: 'Ana',
      atual: { status: 'publicado', nota: 5, texto: TEXTO_OK, nomeExibido: 'Ana', cidade: 'Recife' },
    });
    render(<AvaliarSistemaModal isOpen onClose={() => {}} origem="menu" />);
    expect(await screen.findByText('Publicado no site')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirar meu depoimento do site' }));
    await waitFor(() => expect(api.retirar).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Enviar outra avaliação' })).toBeInTheDocument();
  });
});
