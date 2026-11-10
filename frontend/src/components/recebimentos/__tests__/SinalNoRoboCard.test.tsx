import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/lib/businessPublicPage', () => ({ businessPublicPageApi: api }));

const { SinalNoRoboCard } = await import('../SinalNoRoboCard');

describe('SinalNoRoboCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: false });
    api.updateSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: true });
  });

  it('mostra o interruptor desligado por padrão', async () => {
    render(<SinalNoRoboCard />);
    const interruptor = await screen.findByRole('switch', { name: 'Cobrar o sinal pelo WhatsApp' });
    expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect(interruptor).toBeEnabled();
    expect(screen.getByText(/forma de pagamento padrão/i)).toBeInTheDocument();
  });

  it('liga e salva botCobraSinal true', async () => {
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch', { name: 'Cobrar o sinal pelo WhatsApp' }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ botCobraSinal: true }));
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
  });

  it('fica desabilitado sem chave Pix e mostra o aviso', async () => {
    api.getSettings.mockResolvedValue({ pixKey: null, botCobraSinal: false });
    render(<SinalNoRoboCard />);
    expect(await screen.findByRole('switch', { name: 'Cobrar o sinal pelo WhatsApp' })).toBeDisabled();
    expect(screen.getByText('Cadastre a chave Pix acima para ativar.')).toBeInTheDocument();
  });

  it('mostra o erro quando salvar falha e volta ao valor anterior', async () => {
    api.updateSettings.mockRejectedValueOnce(new AxiosError('bad', '400', undefined, undefined, {
      status: 400, data: { success: false, error: 'Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô' },
    } as AxiosResponse));
    const user = userEvent.setup();
    render(<SinalNoRoboCard />);
    await user.click(await screen.findByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
