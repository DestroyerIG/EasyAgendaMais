import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { PublicBookingFlow } from '../PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';

vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn(),
    getProfessionals: vi.fn(),
    getAvailability: vi.fn(),
    createAppointment: vi.fn(),
  },
}));

const api = publicBookingApi as unknown as Record<keyof typeof publicBookingApi, ReturnType<typeof vi.fn>>;

const STOREFRONT = {
  businessId: 'biz-1',
  name: 'Studio Aurora',
  logoUrl: null,
  brandColor: '#FF7A00',
  galleryPhotos: [] as string[],
  services: [
    { id: 'srv-1', name: 'Manutenção Fibra', price: 130, durationMinutes: 105, depositPercentage: 30, depositAmount: 39 },
  ],
};

const axiosError = (status: number, message: string) =>
  new AxiosError(message, String(status), undefined, undefined, {
    status,
    data: { success: false, error: message },
  } as AxiosResponse);

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getStorefront.mockResolvedValue(STOREFRONT);
  api.getProfessionals.mockResolvedValue([{ id: 'prof-1', name: 'Paula' }]);
  api.getAvailability.mockResolvedValue(['14:00', '14:30']);
});

const goToTimeStep = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<PublicBookingFlow slug="studio-aurora" />);
  await user.click(await screen.findByText('Manutenção Fibra'));
  await user.click(await screen.findByText('Paula'));
};

const goToPixStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await goToTimeStep(user);
  fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });
  await user.click(await screen.findByRole('button', { name: '14:00' }));
  await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
  await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
  await user.click(screen.getByRole('button', { name: /reservar e pagar sinal/i }));
};

describe('PublicBookingFlow', () => {
  it('mostra o nome do negócio e os serviços elegíveis ao carregar', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    await waitFor(() => {
      expect(screen.getByText('Studio Aurora')).toBeInTheDocument();
    });
    expect(screen.getByText('Manutenção Fibra')).toBeInTheDocument();
    expect(publicBookingApi.getStorefront).toHaveBeenCalledWith('studio-aurora');
  });

  it('mostra uma mensagem quando o negócio não tem nenhum serviço elegível', async () => {
    api.getStorefront.mockResolvedValueOnce({ ...STOREFRONT, services: [] });

    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText(/nenhum serviço disponível para agendamento online/i)).toBeInTheDocument();
  });

  it('mostra as fotos da galeria quando o negócio tem', async () => {
    api.getStorefront.mockResolvedValueOnce({
      ...STOREFRONT,
      galleryPhotos: ['https://cdn.test/foto-1.jpg', 'https://cdn.test/foto-2.jpg'],
    });

    render(<PublicBookingFlow slug="studio-aurora" />);

    const photos = await screen.findAllByRole('img');
    expect(photos).toHaveLength(2);
    expect(photos[0]).toHaveAttribute('src', 'https://cdn.test/foto-1.jpg');
  });

  it('não mostra a galeria quando o negócio não tem fotos', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    await waitFor(() => expect(screen.getByText('Studio Aurora')).toBeInTheDocument());
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('mostra erro visível quando falha ao carregar os profissionais', async () => {
    const user = userEvent.setup();
    api.getProfessionals.mockRejectedValue(new Error('falhou'));
    render(<PublicBookingFlow slug="studio-aurora" />);

    await user.click(await screen.findByText('Manutenção Fibra'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os profissionais');
    expect(screen.getByText('Manutenção Fibra')).toBeInTheDocument(); // continua na etapa de serviço
  });

  it('mostra erro visível quando falha ao carregar os horários', async () => {
    const user = userEvent.setup();
    api.getAvailability.mockRejectedValue(new Error('falhou'));
    await goToTimeStep(user);

    fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os horários disponíveis. Tente novamente.'
    );
  });

  it('o seletor de data não permite datas passadas (min = hoje)', async () => {
    const user = userEvent.setup();
    await goToTimeStep(user);

    expect(screen.getByLabelText('Data do agendamento')).toHaveAttribute('min', todayIso());
  });

  it('na etapa Pix mostra o prazo de pagamento e copia o código com feedback', async () => {
    const user = userEvent.setup();
    const expiresAt = new Date(2099, 9, 24, 14, 15).toISOString();
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIXCODE6304ABCD', expiresAt,
    });

    await goToPixStep(user);

    expect(await screen.findByText(/Pague até 14:15/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar código' }));

    expect(await navigator.clipboard.readText()).toBe('000201PIXCODE6304ABCD');
    expect(screen.getByRole('button', { name: 'Copiado!' })).toBeInTheDocument();
  });

  it('na etapa Pix gera e mostra o QR Code do código copia e cola', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIXCODE6304ABCD', expiresAt: new Date().toISOString(),
    });

    await goToPixStep(user);

    const qrImage = await screen.findByRole('img', { name: /qr code do pix/i });
    expect(qrImage).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
  });

  it('quando o horário foi reservado por outra pessoa (409), volta para a escolha de horário com a lista atualizada', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockRejectedValue(axiosError(409, 'Este horário acabou de ser reservado por outra pessoa'));

    await goToPixStep(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha outro horário');
    expect(screen.getByLabelText('Data do agendamento')).toBeInTheDocument();
    expect(api.getAvailability).toHaveBeenCalledTimes(2);
  });

  it('em outros erros na reserva mostra a mensagem do servidor', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockRejectedValue(axiosError(400, 'Não é possível agendar em uma data que já passou'));

    await goToPixStep(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não é possível agendar em uma data que já passou');
    expect(screen.getByPlaceholderText('Seu nome')).toBeInTheDocument();
  });
});
