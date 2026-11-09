import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ conexoes: vi.fn(), conectarChave: vi.fn(), desconectar: vi.fn() }));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: toast }) }));

const { InfinitePayPassos } = await import('../InfinitePayPassos');

const conexao = (extra: Record<string, unknown> = {}) => ({
  gateway: 'infinitepay', situacao: 'ativa', contaNome: '$barbearia-ana', aceitaPix: true, aceitaCartao: true,
  aceiteCartaoEm: '2026-11-10T12:00:00Z', ultimaConfirmacaoEm: '2026-11-10T13:05:00Z', reservasPendentes: 0, ...extra,
});
const semConexao = { configurado: true, disponiveis: ['mercadopago', 'infinitepay'], conexao: null };

describe('InfinitePayPassos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem conexão mostra os cinco passos, os campos e a caixa de aceite; Conectar fica desabilitado', async () => {
    api.conexoes.mockResolvedValue(semConexao);
    render(<InfinitePayPassos />);
    expect(await screen.findByLabelText('InfiniteTag')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('h2'))).toHaveLength(5);
    expect(screen.getByLabelText('Chave de API')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /tabela de taxas/ })).toHaveAttribute('href', 'https://www.infinitepay.io/taxas');
  });

  it('conectar envia o texto digitado com aceite e limpa a chave', async () => {
    api.conexoes.mockResolvedValue(semConexao);
    api.conectarChave.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: conexao() });
    render(<InfinitePayPassos />);
    fireEvent.change(await screen.findByLabelText('InfiniteTag'), { target: { value: '$barbearia-ana' } });
    fireEvent.change(screen.getByLabelText('Chave de API'), { target: { value: 'seg-123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await waitFor(() => expect(api.conectarChave).toHaveBeenCalledWith({ handle: '$barbearia-ana', chave: 'seg-123', aceite: true }));
    expect(await screen.findByText('$barbearia-ana')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chave de API')).not.toBeInTheDocument();
  });

  it('erro da API aparece na tela e mantém os campos', async () => {
    api.conexoes.mockResolvedValue(semConexao);
    api.conectarChave.mockRejectedValue(new AxiosError('x', '400', undefined, undefined, {
      status: 400, statusText: 'Bad Request', headers: {}, config: {} as never, data: { error: { message: 'A InfinitePay recusou a chave.' } },
    }));
    render(<InfinitePayPassos />);
    fireEvent.change(await screen.findByLabelText('InfiniteTag'), { target: { value: 'ana' } });
    fireEvent.change(screen.getByLabelText('Chave de API'), { target: { value: 'k' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByText('A InfinitePay recusou a chave.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chave de API')).toBeInTheDocument();
  });

  it('conectado mostra a conta, a última confirmação e Desconectar, sem escolha de formas', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: conexao() });
    render(<InfinitePayPassos />);
    expect(await screen.findByText('$barbearia-ana')).toBeInTheDocument();
    expect(screen.getByText(/Última confirmação automática/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
    expect(screen.queryByText('O que o cliente pode usar')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('precisa reconectar mostra o aviso e os campos para uma chave nova', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: conexao({ situacao: 'precisa_reconectar' }) });
    render(<InfinitePayPassos />);
    expect(await screen.findByText(/A InfinitePay recusou a chave/)).toBeInTheDocument();
    expect(screen.getByLabelText('InfiniteTag')).toBeInTheDocument();
    expect(screen.getByLabelText('Chave de API')).toBeInTheDocument();
  });

  it('desconectar pede confirmação com as reservas pendentes e chama a API com o gateway', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: conexao({ reservasPendentes: 2 }) });
    api.desconectar.mockResolvedValue({ desconectado: true });
    render(<InfinitePayPassos />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(screen.getByText(/2 reservas pendentes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desconectar' }));
    await waitFor(() => expect(api.desconectar).toHaveBeenCalledWith('infinitepay'));
  });

  it('sem a InfinitePay entre as disponíveis mostra aviso', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: null });
    render(<InfinitePayPassos />);
    expect(await screen.findByText(/não está disponível/)).toBeInTheDocument();
  });

  it('com o Mercado Pago conectado, avisa e não mostra conectar nem desconectar', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago', 'infinitepay'], conexao: conexao({ gateway: 'mercadopago', contaNome: 'Conta MP' }) });
    render(<InfinitePayPassos />);
    expect(await screen.findByText(/Você já recebe pelo Mercado Pago/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o Mercado Pago' })).toHaveAttribute('href', '/dashboard/configuracoes/recebimentos/mercadopago');
    expect(screen.queryByText('Conta MP')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
  });
});
