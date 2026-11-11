import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/lib/businessPublicPage', () => ({ businessPublicPageApi: api }));

const { PixManualCard } = await import('../PixManualCard');

describe('PixManualCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSettings.mockResolvedValue({ pixKey: 'pix@aurora.com', pixKeyType: 'email' });
    api.updateSettings.mockResolvedValue({ pixKey: '83999990000', pixKeyType: 'telefone' });
  });

  it('carrega a chave salva', async () => {
    render(<PixManualCard />);
    expect(await screen.findByLabelText(/^chave pix$/i)).toHaveValue('pix@aurora.com');
    expect(screen.getByLabelText(/tipo de chave/i)).toHaveValue('email');
  });

  it('salva só a chave e o tipo', async () => {
    const user = userEvent.setup();
    render(<PixManualCard />);
    const campo = await screen.findByLabelText(/^chave pix$/i);
    await user.selectOptions(screen.getByLabelText(/tipo de chave/i), 'telefone');
    await user.clear(campo);
    await user.type(campo, '83999990000');
    await user.click(screen.getByRole('button', { name: /salvar chave pix/i }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ pixKey: '83999990000', pixKeyType: 'telefone' }));
    expect(await screen.findByText('Chave Pix salva.')).toBeInTheDocument();
  });

  it('avisa quando falta a chave', async () => {
    api.getSettings.mockResolvedValue({ pixKey: null, pixKeyType: null });
    render(<PixManualCard />);
    expect(await screen.findByText(/sem a chave pix, sua página não aceita agendamentos com sinal/i)).toBeInTheDocument();
  });

  it('não envia chave vazia', async () => {
    api.getSettings.mockResolvedValue({ pixKey: null, pixKeyType: null });
    const user = userEvent.setup();
    render(<PixManualCard />);
    await screen.findByLabelText(/^chave pix$/i);
    await user.click(screen.getByRole('button', { name: /salvar chave pix/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a chave Pix.');
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor', async () => {
    api.updateSettings.mockRejectedValueOnce(new AxiosError('bad', '400', undefined, undefined, {
      status: 400, data: { success: false, error: 'E-mail inválido' },
    } as AxiosResponse));
    const user = userEvent.setup();
    render(<PixManualCard />);
    await screen.findByLabelText(/^chave pix$/i);
    await user.click(screen.getByRole('button', { name: /salvar chave pix/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail inválido');
  });

  it('sem conta conectada deixa claro que a confirmação é manual', async () => {
    render(<PixManualCard />);
    expect(await screen.findByText('Confirmação manual')).toBeInTheDocument();
    expect(screen.getByText(/só com a chave pix, a confirmação é manual/i)).toBeInTheDocument();
  });

  it('com conta conectada a chave aparece como reserva', async () => {
    render(<PixManualCard confirmacaoAutomatica />);
    expect(await screen.findByText('Reserva')).toBeInTheDocument();
    expect(screen.getByText(/sua conta conectada confirma o sinal sozinha/i)).toBeInTheDocument();
  });

  it('avisa o pai (onSalvo) só depois de salvar a chave com sucesso', async () => {
    const onSalvo = vi.fn();
    const user = userEvent.setup();
    render(<PixManualCard onSalvo={onSalvo} />);
    await screen.findByLabelText(/^chave pix$/i);
    await user.click(screen.getByRole('button', { name: /salvar chave pix/i }));
    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
  });

  it('não chama onSalvo quando o salvamento falha', async () => {
    const onSalvo = vi.fn();
    api.updateSettings.mockRejectedValueOnce(new Error('falhou'));
    const user = userEvent.setup();
    render(<PixManualCard onSalvo={onSalvo} />);
    await screen.findByLabelText(/^chave pix$/i);
    await user.click(screen.getByRole('button', { name: /salvar chave pix/i }));
    await screen.findByRole('alert');
    expect(onSalvo).not.toHaveBeenCalled();
  });
});
