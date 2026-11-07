import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({
  conexoes: vi.fn(), conectar: vi.fn(), confirmar: vi.fn(), definirFormas: vi.fn(), desconectar: vi.fn(),
}));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: toast }) }));

const { GatewayPassos } = await import('../GatewayPassos');
const LOCATION_ORIGINAL = window.location;

const conexao = (extra: Record<string, unknown> = {}) => ({
  gateway: 'mercadopago', situacao: 'ativa', contaNome: 'Barbearia Ana', aceitaPix: true, aceitaCartao: false,
  aceiteCartaoEm: null, ultimaConfirmacaoEm: '2026-11-10T13:05:00Z', reservasPendentes: 0, ...extra,
});
const conectado = (extra: Record<string, unknown> = {}) => ({ configurado: true, conexao: conexao(extra) });

describe('GatewayPassos', () => {
  const assign = vi.fn();
  const replaceState = vi.spyOn(window.history, 'replaceState');
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true, value: { ...LOCATION_ORIGINAL, assign, search: '', href: 'http://localhost/dashboard/configuracoes/recebimentos/mercadopago' },
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: LOCATION_ORIGINAL });
  });

  it('gateway inexistente mostra "Gateway não encontrado"', () => {
    render(<GatewayPassos gatewayId="xyz" />);
    expect(screen.getByText('Gateway não encontrado.')).toBeInTheDocument();
  });

  it('sem configuração mostra aviso de integração indisponível', async () => {
    api.conexoes.mockResolvedValue({ configurado: false, conexao: null });
    render(<GatewayPassos gatewayId="mercadopago" />);
    expect(await screen.findByText(/não está disponível/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar com o Mercado Pago' })).not.toBeInTheDocument();
  });

  it('sem conexão mostra os cinco passos, os avisos de taxa e o botão', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, conexao: null });
    render(<GatewayPassos gatewayId="mercadopago" />);
    expect(await screen.findByRole('button', { name: 'Conectar com o Mercado Pago' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('h2'))).toHaveLength(5);
    expect(screen.getByText('As taxas são cobradas pelo Mercado Pago e saem do valor do sinal.')).toBeInTheDocument();
    expect(screen.getByText('No cartão, o dinheiro pode levar mais tempo para ficar disponível.')).toBeInTheDocument();
    expect(screen.getByText('No cartão, o cliente pode contestar a compra no banco, e o valor pode voltar para ele.')).toBeInTheDocument();
    const taxas = screen.getByRole('link', { name: /tabela de taxas/ });
    expect(taxas).toHaveAttribute('href', 'https://www.mercadopago.com.br/costs-section');
    expect(taxas).toHaveAttribute('target', '_blank');
    expect(taxas).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('o clique em Conectar busca a url e navega', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, conexao: null });
    api.conectar.mockResolvedValue({ url: 'https://auth.mercadopago.com.br/authorization?x=1' });
    render(<GatewayPassos gatewayId="mercadopago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar com o Mercado Pago' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://auth.mercadopago.com.br/authorization?x=1'));
  });

  it('?recebimento=confirmar&t=x chama confirmar e limpa a URL', async () => {
    window.location.search = '?recebimento=confirmar&t=x';
    window.location.href = 'http://localhost/dashboard/configuracoes/recebimentos/mercadopago?recebimento=confirmar&t=x';
    api.confirmar.mockResolvedValue(conectado());
    render(<GatewayPassos gatewayId="mercadopago" />);
    expect(await screen.findByText('Barbearia Ana')).toBeInTheDocument();
    expect(api.confirmar).toHaveBeenCalledWith('x');
    expect(replaceState).toHaveBeenCalledWith(null, '', 'http://localhost/dashboard/configuracoes/recebimentos/mercadopago');
    expect(toast).toHaveBeenCalledWith('Mercado Pago conectado.', 'success');
  });

  it('?recebimento=erro mostra erro', async () => {
    window.location.search = '?recebimento=erro';
    api.conexoes.mockResolvedValue({ configurado: true, conexao: null });
    render(<GatewayPassos gatewayId="mercadopago" />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('Não foi possível conectar'), 'error'));
    expect(api.confirmar).not.toHaveBeenCalled();
  });

  it('conectado mostra conta, formas e última confirmação', async () => {
    api.conexoes.mockResolvedValue(conectado({ aceitaCartao: true, aceiteCartaoEm: '2026-11-01T10:00:00Z' }));
    render(<GatewayPassos gatewayId="mercadopago" />);
    expect(await screen.findByText('Barbearia Ana')).toBeInTheDocument();
    expect(screen.getByText(/Última confirmação automática/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Pix' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Cartão' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Conectar com o Mercado Pago' })).not.toBeInTheDocument();
  });

  it('ligar cartão exige o aceite do aviso de contestação', async () => {
    api.conexoes.mockResolvedValue(conectado());
    api.definirFormas.mockResolvedValue(conectado({ aceitaCartao: true }));
    render(<GatewayPassos gatewayId="mercadopago" />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Cartão' }));
    const ligar = await screen.findByRole('button', { name: 'Ligar cartão' });
    expect(ligar).toBeDisabled();
    expect(api.definirFormas).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(ligar);
    await waitFor(() => expect(api.definirFormas).toHaveBeenCalledWith({ aceitaPix: true, aceitaCartao: true, aceiteCartao: true }));
  });

  it('desligar as duas formas é recusado na tela', async () => {
    api.conexoes.mockResolvedValue(conectado());
    render(<GatewayPassos gatewayId="mercadopago" />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Pix' }));
    expect(await screen.findByText('Deixe ao menos uma forma de receber ligada.')).toBeInTheDocument();
    expect(api.definirFormas).not.toHaveBeenCalled();
  });

  it('precisa_reconectar mostra Reconectar', async () => {
    api.conexoes.mockResolvedValue(conectado({ situacao: 'precisa_reconectar' }));
    api.conectar.mockResolvedValue({ url: 'https://auth.mercadopago.com.br/a' });
    render(<GatewayPassos gatewayId="mercadopago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconectar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://auth.mercadopago.com.br/a'));
  });

  it('desconectar pede confirmação com o número de reservas pendentes', async () => {
    api.conexoes.mockResolvedValueOnce(conectado({ reservasPendentes: 3 })).mockResolvedValue({ configurado: true, conexao: null });
    api.desconectar.mockResolvedValue({ desconectado: true });
    render(<GatewayPassos gatewayId="mercadopago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText(/3 reservas pendentes/)).toBeInTheDocument();
    expect(api.desconectar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desconectar' }));
    await waitFor(() => expect(api.desconectar).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Conectar com o Mercado Pago' })).toBeInTheDocument();
  });
});
