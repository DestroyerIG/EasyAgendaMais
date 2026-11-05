import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicBookingFlow } from '@/components/publicBooking/PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';

vi.mock('@/components/clube/AdesaoClube', () => ({ ClubeVitrine: () => null }));
vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn(),
    getProfessionals: vi.fn(),
    getAvailability: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

const api = publicBookingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const STOREFRONT = {
  businessId: 'biz-1',
  name: 'Studio Aurora',
  logoUrl: null,
  brandColor: '#FF7A00',
  galleryPhotos: [] as string[],
  address: null,
  services: [{ id: 'srv-1', name: 'Manutenção Fibra', price: 130, durationMinutes: 105, depositPercentage: 30, depositAmount: 39 }],
  agendaPausada: true,
  whatsapp: '83999990000',
};

describe('Página pública com a agenda pausada', () => {
  beforeEach(() => {
    api.getStorefront.mockReset();
  });

  it('mostra a frase e o botão do WhatsApp, sem a lista de serviços', async () => {
    api.getStorefront.mockResolvedValue(STOREFRONT);
    render(<PublicBookingFlow slug="aurora" />);

    expect(
      await screen.findByText('A agenda online está pausada no momento. Fale direto com Studio Aurora pelo WhatsApp.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/5583999990000');
    expect(screen.queryByText('Manutenção Fibra')).not.toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/pagamento|assinatura/);
  });

  it('não duplica o 55 quando o número já o traz', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, whatsapp: '5583999990000' });
    render(<PublicBookingFlow slug="aurora" />);
    const link = await screen.findByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/5583999990000');
  });

  it('número local com DDD 55 recebe o prefixo do país', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, whatsapp: '(55) 99999-0000' });
    render(<PublicBookingFlow slug="aurora" />);
    const link = await screen.findByRole('link', { name: /whatsapp/i });
    expect(link).toHaveAttribute('href', 'https://wa.me/5555999990000');
  });

  it('sem WhatsApp cadastrado mostra só a frase', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, whatsapp: null });
    render(<PublicBookingFlow slug="aurora" />);
    await screen.findByText(/A agenda online está pausada/);
    expect(screen.queryByRole('link', { name: /whatsapp/i })).not.toBeInTheDocument();
  });

  it('com a agenda ativa segue permitindo agendar', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, agendaPausada: false });
    api.getProfessionals.mockResolvedValue([{ id: 'prof-1', name: 'Paula' }]);
    render(<PublicBookingFlow slug="aurora" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agendar horário' })).toBeInTheDocument());
  });
});
