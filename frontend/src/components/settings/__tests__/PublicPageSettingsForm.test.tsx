import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PublicPageSettingsForm } from '../PublicPageSettingsForm';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { AxiosError, type AxiosResponse } from 'axios';

vi.mock('@/lib/businessPublicPage', () => ({
  businessPublicPageApi: {
    getSettings: vi.fn().mockResolvedValue({ slug: null, pixKey: null, pixKeyType: null, logoUrl: null, brandColor: null }),
    updateSettings: vi.fn().mockResolvedValue({ slug: 'studio-aurora', pixKey: '83999990000', pixKeyType: 'telefone', logoUrl: null, brandColor: null }),
  },
}));

describe('PublicPageSettingsForm', () => {
  it('salva o slug e a chave Pix ao enviar o formulário', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/link da sua página/i), 'studio-aurora');
    await user.type(screen.getByLabelText(/chave pix/i), '83999990000');
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'studio-aurora', pixKey: '83999990000' })
      );
    });
  });
});

describe('PublicPageSettingsForm — falha ao salvar', () => {
  it('mostra mensagem visível quando o link já está em uso (409)', async () => {
    const user = userEvent.setup();
    (businessPublicPageApi.updateSettings as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: { success: false, error: 'Este link já está em uso por outro negócio' },
      } as AxiosResponse)
    );
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.type(await screen.findByLabelText(/link da sua página/i), 'studio-aurora');
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este link já está em uso por outro negócio');
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar/i })).not.toBeDisabled();
  });
});
