import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoBusca } from '@/lib/busca';
import { BuscaGeral } from '../BuscaGeral';
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
const vazio: ResultadoBusca = { clientes: [], agendamentos: [] };

const PLACEHOLDER = 'Buscar cliente, agendamento ou tela...';
const campo = () => screen.getByRole('combobox');

async function digitar(texto: string) {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(PLACEHOLDER), texto);
  return user;
}

const renderBusca = () =>
  render(
    <TopBarSearchProvider>
      <BuscaGeral />
    </TopBarSearchProvider>,
  );

describe('BuscaGeral', () => {
  beforeEach(() => {
    m.push.mockReset();
    m.buscar.mockReset().mockResolvedValue(completo);
  });

  it('a barra fica ativa com o texto "Buscar cliente, agendamento ou tela..."', () => {
    renderBusca();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeEnabled();
  });

  it('mostra os grupos Clientes, Agendamentos e Telas', async () => {
    renderBusca();
    await digitar('agenda');
    expect(await screen.findByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Agendamentos')).toBeInTheDocument();
    expect(screen.getByText('Telas')).toBeInTheDocument();
  });

  it('clicar em um resultado navega para o href', async () => {
    renderBusca();
    const user = await digitar('carla');
    await user.click(await screen.findByText('Carla Souza'));
    expect(m.push).toHaveBeenCalledWith('/clientes/c1');
  });

  it('nada encontrado mostra: Nada encontrado para "xyz".', async () => {
    m.buscar.mockResolvedValue(vazio);
    renderBusca();
    await digitar('xyz');
    expect(await screen.findByText('Nada encontrado para "xyz".')).toBeInTheDocument();
  });

  it('falha mostra as telas e: Não foi possível buscar clientes agora.', async () => {
    m.buscar.mockRejectedValue({ response: { status: 500 } });
    renderBusca();
    await digitar('agenda');
    expect(await screen.findByText('Não foi possível buscar clientes agora.')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('bloqueada mostra só as telas, sem mensagem de falha', async () => {
    m.buscar.mockRejectedValue({ response: { status: 402 } });
    renderBusca();
    await digitar('agenda');
    await waitFor(() => expect(m.buscar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Buscando...')).not.toBeInTheDocument());
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
  });

  it('expõe combobox: aria-expanded, aria-controls e aria-activedescendant', async () => {
    renderBusca();
    expect(campo()).toHaveAttribute('aria-expanded', 'false');
    await digitar('carla');
    await screen.findByText('Carla Souza');
    expect(campo()).toHaveAttribute('aria-expanded', 'true');
    const lista = screen.getByRole('listbox');
    expect(campo()).toHaveAttribute('aria-controls', lista.id);
    const ativo = campo().getAttribute('aria-activedescendant');
    expect(ativo).toBeTruthy();
    expect(document.getElementById(ativo!)).toHaveAttribute('role', 'option');
  });

  it('anuncia a quantidade de resultados em aria-live', async () => {
    renderBusca();
    await digitar('carla');
    await screen.findByText('Carla Souza');
    const regiao = document.querySelector('[aria-live="polite"]');
    expect(regiao?.textContent).toMatch(/^\d+ resultados?$/);
  });

  // O jsdom não faz layout: getClientRects() vem sempre vazio, como se a barra estivesse oculta.
  const visivel = () =>
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);

  it('Ctrl K leva o foco à barra', () => {
    const espiao = visivel();
    renderBusca();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(campo()).toHaveFocus();
    espiao.mockRestore();
  });

  it('Ctrl K com a barra oculta não faz nada', () => {
    renderBusca();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(campo()).not.toHaveFocus();
  });

  it('Ctrl K dentro de outro campo de texto não tira o foco dele', () => {
    render(
      <TopBarSearchProvider>
        <BuscaGeral />
        <input aria-label="outro" />
      </TopBarSearchProvider>,
    );
    const espiao = visivel();
    const outro = screen.getByLabelText('outro');
    outro.focus();
    fireEvent.keyDown(outro, { key: 'k', ctrlKey: true });
    expect(outro).toHaveFocus();
    espiao.mockRestore();
  });

  it('clique fora fecha a lista', async () => {
    renderBusca();
    await digitar('carla');
    await screen.findByText('Carla Souza');
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('Tab para fora do campo fecha a lista', async () => {
    renderBusca();
    const user = await digitar('carla');
    await screen.findByText('Carla Souza');
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('clicar numa opção continua funcionando com o fechamento no blur', async () => {
    renderBusca();
    const user = await digitar('carla');
    await user.click(await screen.findByText('Carla Souza'));
    expect(m.push).toHaveBeenCalledWith('/clientes/c1');
  });

  it('o combobox sempre tem aria-label com o placeholder', () => {
    renderBusca();
    expect(campo()).toHaveAttribute('aria-label', PLACEHOLDER);
  });

  it('bloqueada sem nenhuma tela mostra "Nada encontrado"', async () => {
    m.buscar.mockRejectedValue({ response: { status: 402 } });
    renderBusca();
    await digitar('xyz');
    expect(await screen.findByText('Nada encontrado para "xyz".')).toBeInTheDocument();
  });

  it('a opção marcada pelas setas é rolada para dentro da vista', async () => {
    const espiao = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = espiao;
    try {
      renderBusca();
      const user = await digitar('agenda');
      await screen.findByText('Telas');
      espiao.mockClear();
      await user.keyboard('{ArrowDown}');
      await waitFor(() => expect(espiao).toHaveBeenCalledWith({ block: 'nearest' }));
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  function TelaComBusca() {
    const [v, setV] = useState('');
    useRegisterTopBarSearch({ value: v, onChange: setV, placeholder: 'Filtrar clientes por nome ou telefone...' });
    return null;
  }
  const renderComRegistro = () =>
    render(
      <TopBarSearchProvider>
        <BuscaGeral />
        <TelaComBusca />
      </TopBarSearchProvider>,
    );

  it('com busca registrada, filtra a tela e não abre a lista', async () => {
    const user = userEvent.setup();
    renderComRegistro();
    const input = screen.getByPlaceholderText('Filtrar clientes por nome ou telefone...');
    await user.type(input, 'carla');
    expect(input).toHaveValue('carla');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(m.buscar).not.toHaveBeenCalled();
  });

  it('com busca registrada, usa o placeholder da tela', () => {
    renderComRegistro();
    expect(screen.getByPlaceholderText('Filtrar clientes por nome ou telefone...')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(PLACEHOLDER)).not.toBeInTheDocument();
  });
});
