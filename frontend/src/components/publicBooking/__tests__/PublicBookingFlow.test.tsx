import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PublicBookingFlow } from '../PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';

vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      name: 'Studio Aurora',
      logoUrl: null,
      brandColor: '#FF7A00',
      services: [
        { id: 'srv-1', name: 'Manutenção Fibra', price: 130, durationMinutes: 105, depositPercentage: 30, depositAmount: 39 },
      ],
    }),
    getProfessionals: vi.fn(),
    getAvailability: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

describe('PublicBookingFlow', () => {
  it('mostra o nome do negócio e os serviços elegíveis ao carregar', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    await waitFor(() => {
      expect(screen.getByText('Studio Aurora')).toBeInTheDocument();
    });
    expect(screen.getByText('Manutenção Fibra')).toBeInTheDocument();
    expect(publicBookingApi.getStorefront).toHaveBeenCalledWith('studio-aurora');
  });
});
