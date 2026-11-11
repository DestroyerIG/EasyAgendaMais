import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bancadaApi, EVENTO_ATUALIZAR_BANCADA } from '@/lib/bancada';
import { hojeLocal } from '@/lib/relatorios';
import { NovoNaBancada } from '../NovoNaBancada';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/lib/bancada', async (orig) => {
  const real = await orig<typeof import('@/lib/bancada')>();
  return {
    ...real,
    bancadaApi: {
      servicos: vi.fn(), buscarClientes: vi.fn(), horariosNovo: vi.fn(), criarCliente: vi.fn(), criarAgendamento: vi.fn(),
    },
  };
});

const api = bancadaApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mariana = { id: 'c1', name: 'Mariana Souza', phone: '83999990000' };

beforeEach(() => {
  vi.clearAllMocks();
  api.servicos.mockResolvedValue([{ id: 's1', nome: 'Corte', duracao: 30, preco: 45 }]);
  api.horariosNovo.mockResolvedValue(['14:00', '15:00']);
  api.buscarClientes.mockResolvedValue([mariana]);
});

describe('atalho + da bancada', () => {
  it('abre os dois balões e agenda para uma cliente do negócio na agenda dela', async () => {
    const user = userEvent.setup();
    const recarregar = vi.fn();
    window.addEventListener(EVENTO_ATUALIZAR_BANCADA, recarregar);
    api.criarAgendamento.mockResolvedValue({ id: 'a1', data: hojeLocal(), hora: '15:00' });
    render(<NovoNaBancada />);

    await user.click(screen.getByRole('button', { name: 'Criar novo' }));
    await user.click(screen.getByRole('button', { name: 'Novo agendamento' }));

    await user.type(await screen.findByLabelText('Buscar por nome ou telefone'), 'mari');
    await user.click(await screen.findByRole('button', { name: /Mariana Souza/ }));
    await user.selectOptions(await screen.findByLabelText('Serviço'), 's1');
    await user.click(await screen.findByRole('button', { name: '15:00' }));
    await user.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() => expect(api.criarAgendamento).toHaveBeenCalledWith({ clienteId: 'c1', servicoId: 's1', data: hojeLocal(), hora: '15:00' }));
    expect(recarregar).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Agendado'), 'success');
    window.removeEventListener(EVENTO_ATUALIZAR_BANCADA, recarregar);
  }, 20000);

  it('agendar fica desabilitado até escolher cliente, serviço e horário', async () => {
    const user = userEvent.setup();
    render(<NovoNaBancada />);
    await user.click(screen.getByRole('button', { name: 'Criar novo' }));
    await user.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    expect(await screen.findByRole('button', { name: 'Agendar' })).toBeDisabled();
  });

  it('novo cliente: cadastra e já segue para agendar com ela selecionada', async () => {
    const user = userEvent.setup();
    api.criarCliente.mockResolvedValue({ cliente: { id: 'c9', name: 'Ana Paula', phone: '83988887777' }, jaExistia: false });
    render(<NovoNaBancada />);

    await user.click(screen.getByRole('button', { name: 'Criar novo' }));
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await user.type(await screen.findByLabelText('Nome'), 'Ana Paula');
    await user.type(screen.getByLabelText('Telefone / WhatsApp'), '83988887777');
    await user.click(screen.getByRole('button', { name: 'Cadastrar e agendar' }));

    await waitFor(() => expect(api.criarCliente).toHaveBeenCalledWith({ name: 'Ana Paula', phone: '83988887777' }));
    expect(await screen.findByText('Ana Paula')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeInTheDocument();
  });

  it('telefone que já existe: avisa e usa o cadastro que já estava lá', async () => {
    const user = userEvent.setup();
    api.criarCliente.mockResolvedValue({ cliente: mariana, jaExistia: true });
    render(<NovoNaBancada />);

    await user.click(screen.getByRole('button', { name: 'Criar novo' }));
    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    await user.type(await screen.findByLabelText('Nome'), 'Mari');
    await user.type(screen.getByLabelText('Telefone / WhatsApp'), '83999990000');
    await user.click(screen.getByRole('button', { name: 'Cadastrar e agendar' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('já estava cadastrado'), 'success'));
    expect(await screen.findByText('Mariana Souza')).toBeInTheDocument();
  });
});
