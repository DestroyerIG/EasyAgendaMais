import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogoNegocioCard } from '../LogoNegocioCard';

const refreshMe = vi.fn().mockResolvedValue(null);
const showToast = vi.fn();
const mockUser: { logoUrl: string | null } = { logoUrl: null };

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshMe }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/lib/businessPublicPage', () => ({
  businessPublicPageApi: {
    uploadImage: vi.fn().mockResolvedValue('https://x.test/logo.png'),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

import { businessPublicPageApi } from '@/lib/businessPublicPage';

describe('LogoNegocioCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.logoUrl = null;
  });

  it('sem logo oferece "Enviar logo"; com logo oferece "Trocar foto"', () => {
    const { unmount } = render(<LogoNegocioCard />);
    expect(screen.getByRole('button', { name: 'Enviar logo' })).toBeInTheDocument();
    unmount();

    mockUser.logoUrl = 'https://x.test/atual.png';
    render(<LogoNegocioCard />);
    expect(screen.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();
    expect(screen.getByAltText('Logo do negócio')).toBeInTheDocument();
  });

  it('enviar a imagem salva como logo da página e atualiza a sessão', async () => {
    render(<LogoNegocioCard />);
    const arquivo = new File(['x'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Enviar logo', { selector: 'input' }), arquivo);

    await waitFor(() => expect(refreshMe).toHaveBeenCalled());
    expect(businessPublicPageApi.uploadImage).toHaveBeenCalledWith(arquivo);
    expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith({ logoUrl: 'https://x.test/logo.png' });
    expect(showToast).toHaveBeenCalledWith('Logo atualizada.', 'success');
  });
});
