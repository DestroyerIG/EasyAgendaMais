import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoBusca } from '@/lib/busca';
import { BuscaCelular } from '../BuscaCelular';
import { TopBarSearchProvider, useRegisterTopBarSearch } from '../TopBarSearchContext';

const m = vi.hoisted(() => ({ push: vi.fn(), buscar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/lib/busca', async (orig) => {
  const real = await orig<typeof import('@/lib/busca')>();
  return { ...real, buscaApi: { buscar: m.buscar } };
});

const completo: ResultadoBusca = {
  clientes: [{ id: 'c1', nome: 'Carla Souza', telefone: '83999998888' }],
  agendamentos: [
    { id: 'a1', data: '2030-01-10', hora: '10:00', status: 'agendado', clienteNome: 'Carla Souza', servicoNome: 'Corte', profissionalNome: 'Rui' },
  ],
};

const PLACEHOLDER = 'Buscar cliente, agendamento ou tela...';

const renderBusca = (filhos?: React.ReactNode) =>
  render(
    <TopBarSearchProvider>
      <BuscaCelular />
      {filhos}
    </TopBarSearchProvider>,
  );

async function abrir() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Buscar' }));
  return user;
}

describe('BuscaCelular', () => {
  beforeEach(() => {
    m.push.mockReset();
    m.buscar.mockReset().mockResolvedValue(completo);
  });

  it('a lupa tem o nome acessível "Buscar" e abre a busca em tela cheia', async () => {
    renderBusca();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await abrir();
    expect(screen.getByRole('dialog', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('o campo recebe o foco ao abrir', async () => {
    renderBusca();
    await abrir();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('mostra os mesmos grupos de resultados', async () => {
    renderBusca();
    const user = await abrir();
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'agenda');
    expect(await screen.findByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Agendamentos')).toBeInTheDocument();
    expect(screen.getByText('Telas')).toBeInTheDocument();
  });

  it('escolher um resultado navega e fecha a busca', async () => {
    renderBusca();
    const user = await abrir();
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'carla');
    await user.click(await screen.findByText('Carla Souza'));
    expect(m.push).toHaveBeenCalledWith('/clientes/c1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('o botão Fechar fecha e limpa o termo', async () => {
    renderBusca();
    const user = await abrir();
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'carla');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await abrir();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('');
  });

  it('Esc fecha e limpa o termo', async () => {
    renderBusca();
    const user = await abrir();
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'carla');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await abrir();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('');
  });

  function TelaComBusca() {
    const [v, setV] = useState('');
    useRegisterTopBarSearch({ value: v, onChange: setV, placeholder: 'Filtrar clientes por nome ou telefone...' });
    return null;
  }

  it('em Clientes, com busca registrada, a lupa abre a busca geral', async () => {
    renderBusca(<TelaComBusca />);
    const user = await abrir();
    expect(screen.queryByPlaceholderText('Filtrar clientes por nome ou telefone...')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'carla');
    expect(await screen.findByText('Carla Souza')).toBeInTheDocument();
    expect(m.buscar).toHaveBeenCalled();
  });
});
