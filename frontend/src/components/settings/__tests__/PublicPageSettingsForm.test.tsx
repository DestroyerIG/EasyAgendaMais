import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PublicPageSettingsForm } from '../PublicPageSettingsForm';
import { businessPublicPageApi } from '@/lib/businessPublicPage';

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
