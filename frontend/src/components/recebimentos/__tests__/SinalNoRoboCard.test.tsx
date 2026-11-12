import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/lib/businessPublicPage', () => ({ businessPublicPageApi: api }));

const { SinalNoRoboCard } = await import('../SinalNoRoboCard');
const NOME = 'Cobrar sinal nas reservas';

describe('SinalNoRoboCard (cobrança do sinal e sinal geral)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: false, sinalPadraoPct: null });
  });

  it('desligado por padrão, sem campo de porcentagem', async () => {
    render(<SinalNoRoboCard />);
    const interruptor = await screen.findByRole('switch', { name: NOME });
    expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect(interruptor).toBeEnabled();
    expect(screen.queryByLabelText('Sinal geral (%)')).not.toBeInTheDocument();
  });

  it('ao ligar pede a porcentagem e só salva ao confirmar', async () => {
    api.updateSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: true, sinalPadraoPct: 30 });
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch', { name: NOME }));
    expect(api.updateSettings).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Sinal geral (%)'), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar sinal' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ botCobraSinal: true, sinalPadraoPct: 30 }));
    expect(await screen.findByText('Sinal geral salvo.')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('recusa porcentagem fora de 1 a 100 sem chamar a API', async () => {
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch', { name: NOME }));
    await user.type(screen.getByLabelText('Sinal geral (%)'), '150');
    await user.click(screen.getByRole('button', { name: 'Salvar sinal' }));
    expect(screen.getByText('Informe uma porcentagem entre 1 e 100.')).toBeInTheDocument();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('com porcentagem já salva, ligar salva direto e mostra o valor', async () => {
    api.getSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: false, sinalPadraoPct: 25 });
    api.updateSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: true, sinalPadraoPct: 25 });
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch', { name: NOME }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ botCobraSinal: true }));
    expect(await screen.findByLabelText('Sinal geral (%)')).toHaveValue(25);
  });

  it('fica desabilitado sem chave Pix e mostra o aviso', async () => {
    api.getSettings.mockResolvedValue({ pixKey: null, botCobraSinal: false, sinalPadraoPct: null });
    render(<SinalNoRoboCard />);
    expect(await screen.findByRole('switch', { name: NOME })).toBeDisabled();
    expect(screen.getByText('Cadastre a chave Pix acima para ativar.')).toBeInTheDocument();
  });

  it('mostra o erro do servidor ao salvar a porcentagem', async () => {
    api.updateSettings.mockRejectedValueOnce(new AxiosError('bad', '400', undefined, undefined, {
      status: 400, data: { success: false, error: 'Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô' },
    } as AxiosResponse));
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch', { name: NOME }));
    await user.type(screen.getByLabelText('Sinal geral (%)'), '30');
    await user.click(screen.getByRole('button', { name: 'Salvar sinal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô');
  });

  it('com a cobrança ligada e sem chave Pix, o interruptor continua ativo e dá para desligar', async () => {
    api.getSettings.mockResolvedValue({ pixKey: null, botCobraSinal: true, sinalPadraoPct: 30 });
    api.updateSettings.mockResolvedValue({ pixKey: null, botCobraSinal: false, sinalPadraoPct: 30 });
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    const interruptor = await screen.findByRole('switch', { name: NOME });
    expect(interruptor).toBeEnabled();
    await user.click(interruptor);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ botCobraSinal: false }));
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
  });
});
