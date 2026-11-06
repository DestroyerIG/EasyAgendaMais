import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicBookingFlow } from '../PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';

vi.mock('@/components/clube/AdesaoClube', () => ({ ClubeVitrine: () => null }));
vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn(),
    getProfessionals: vi.fn(),
    getAvailabilityGrid: vi.fn(),
    getAvailabilityDays: vi.fn(),
    getAppointmentStatus: vi.fn(),
    createAppointment: vi.fn(),
    trocarParaPix: vi.fn(),
  },
}));

const api = publicBookingApi as unknown as Record<keyof typeof publicBookingApi, ReturnType<typeof vi.fn>>;

const STOREFRONT = {
  businessId: 'biz-1',
  name: 'Studio Aurora',
  logoUrl: null,
  brandColor: '#FF7A00',
  galleryPhotos: [] as string[],
  address: null as string | null,
  formasPagamento: ['pix', 'cartao'],
  services: [{ id: 'srv-1', name: 'Manutenção Fibra', price: 130, durationMinutes: 105, depositPercentage: 30, depositAmount: 39 }],
};

const FUTURO = new Date(2099, 1, 1).toISOString();
const checkoutUrl = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc';

const RESERVA = {
  servico: { name: 'Manutenção Fibra', price: 130, durationMinutes: 105 },
  profissional: 'Paula',
  data: '2099-10-24',
  horario: '14:00',
  sinal: 39,
  forma: 'cartao',
  pixPayload: null as string | null,
  checkoutUrl,
  expiresAt: FUTURO,
};

const assign = vi.fn();
const localOriginal = window.location;

const abrirEm = (busca: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...localOriginal, search: busca, pathname: '/agendar/studio-aurora', assign },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  abrirEm('');
  api.getStorefront.mockResolvedValue(STOREFRONT);
  api.getProfessionals.mockResolvedValue([{ id: 'prof-1', name: 'Paula' }]);
  api.getAvailabilityGrid.mockResolvedValue(['14:00'].map((horario) => ({ horario, livre: true })));
  api.getAvailabilityDays.mockResolvedValue([]);
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: localOriginal });
  window.sessionStorage.clear();
});

const irAteOsDados = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<PublicBookingFlow slug="studio-aurora" />);
  await user.click(await screen.findByRole('button', { name: 'Agendar horário' }));
  await user.click(await screen.findByText('Manutenção Fibra'));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByLabelText('Data do agendamento');
  fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });
  await user.click(await screen.findByRole('button', { name: '14:00' }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
};

const preencherEConfirmar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
  await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
  await user.click(screen.getByRole('button', { name: /confirmar agendamento/i }));
};

describe('escolha da forma de pagamento', () => {
  it('com só o Pix liberado não mostra escolha e o rótulo segue "Sinal Pix"', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, formasPagamento: ['pix'] });
    const user = userEvent.setup();
    await irAteOsDados(user);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Sinal Pix')).toBeInTheDocument();
  });

  it('com Pix e cartão mostra a escolha com o Pix primeiro e marcado', async () => {
    const user = userEvent.setup();
    await irAteOsDados(user);

    const opcoes = screen.getAllByRole('radio');
    expect(opcoes).toHaveLength(2);
    expect(opcoes[0]).toHaveAccessibleName(/Pix/);
    expect(opcoes[0]).toBeChecked();
    expect(opcoes[1]).toHaveAccessibleName(/Cartão/);
  });

  it('ao escolher cartão troca o rótulo do resumo, envia formaPagamento e vai para o Checkout', async () => {
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: null, checkoutUrl, forma: 'cartao',
      automatica: true, cartaoIndisponivel: false, expiresAt: FUTURO,
    });
    const user = userEvent.setup();
    await irAteOsDados(user);

    await user.click(screen.getAllByRole('radio')[1]);
    expect(screen.getByText('Sinal cartão')).toBeInTheDocument();
    await preencherEConfirmar(user);

    await waitFor(() => expect(assign).toHaveBeenCalledWith(checkoutUrl));
    expect(api.createAppointment).toHaveBeenCalledWith(
      'studio-aurora', expect.objectContaining({ formaPagamento: 'cartao' }),
    );
  });

  it('com o cartão indisponível avisa e mostra o código Pix', async () => {
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIX', checkoutUrl: null, forma: 'pix',
      automatica: true, cartaoIndisponivel: true, expiresAt: FUTURO,
    });
    const user = userEvent.setup();
    await irAteOsDados(user);
    await user.click(screen.getAllByRole('radio')[1]);
    await preencherEConfirmar(user);

    expect(await screen.findByText('O pagamento com cartão está indisponível agora. Use o Pix para garantir seu horário.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código Pix copia e cola')).toHaveValue('000201PIX');
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('volta do Checkout', () => {
  it('retorno=sucesso confirmado mostra a confirmação sem saudação e com "Sinal pago no cartão"', async () => {
    abrirEm('?reserva=appt-1&retorno=sucesso');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
    expect(api.getAppointmentStatus).toHaveBeenCalledWith('studio-aurora', 'appt-1');
    expect(screen.getByText('Sinal pago no cartão')).toBeInTheDocument();
    expect(screen.getByText(/Tudo certo! Seu horário em/)).toBeInTheDocument();
    expect(screen.queryByText(/Tudo certo, /)).not.toBeInTheDocument();
    expect(screen.getByText(/Manutenção Fibra/)).toBeInTheDocument();
  });

  it('abre a reserva mesmo antes de a vitrine chegar', async () => {
    abrirEm('?reserva=appt-1&retorno=sucesso');
    api.getStorefront.mockReturnValue(new Promise(() => undefined));
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
  });

  it('retorno=pendente aguardando mostra o aviso e segue consultando', async () => {
    abrirEm('?reserva=appt-1&retorno=pendente');
    api.getAppointmentStatus.mockResolvedValueOnce({ situacao: 'aguardando', reserva: RESERVA });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText(/Estamos aguardando a confirmação do pagamento/)).toBeInTheDocument();

    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA });
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
  });

  it('retorno=falha oferece tentar de novo no Checkout e trocar para Pix', async () => {
    abrirEm('?reserva=appt-1&retorno=falha');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA });
    api.trocarParaPix.mockResolvedValue({ pixPayload: '000201TROCA', forma: 'pix', expiresAt: FUTURO });
    const user = userEvent.setup();
    render(<PublicBookingFlow slug="studio-aurora" />);

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(assign).toHaveBeenCalledWith(checkoutUrl);

    await user.click(screen.getByRole('button', { name: 'Pagar com Pix' }));
    expect(api.trocarParaPix).toHaveBeenCalledWith('studio-aurora', 'appt-1');
    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('000201TROCA');
    expect(await screen.findByRole('img', { name: /qr code do pix/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('reserva expirada mostra a reserva encerrada, nunca a tela de pagamento', async () => {
    abrirEm('?reserva=appt-1&retorno=falha');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'expirado', reserva: { ...RESERVA, checkoutUrl: null } });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('button', { name: 'Escolher outro horário' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar com Pix' })).not.toBeInTheDocument();
  });

  it('com Pix e sem código (null) não gera QR Code', async () => {
    abrirEm('?reserva=appt-1');
    api.getAppointmentStatus.mockResolvedValue({
      situacao: 'aguardando', reserva: { ...RESERVA, forma: 'pix', pixPayload: null, checkoutUrl: null },
    });
    render(<PublicBookingFlow slug="studio-aurora" />);

    await screen.findByText(/Aguardando confirmação/);
    expect(screen.queryByRole('img', { name: /qr code do pix/i })).not.toBeInTheDocument();
  });

  it('reserva inexistente avisa e abre a página normal', async () => {
    abrirEm('?reserva=nao-existe&retorno=sucesso');
    api.getAppointmentStatus.mockRejectedValue(new AxiosError('x', '404', undefined, undefined, { status: 404, data: {} } as AxiosResponse));
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText('Não encontramos esta reserva.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Agendar horário' })).toBeInTheDocument();
  });

  it('não usa o sessionStorage para remontar a reserva', async () => {
    const leitura = vi.spyOn(Storage.prototype, 'getItem');
    abrirEm('?reserva=appt-1&retorno=sucesso');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA });
    render(<PublicBookingFlow slug="studio-aurora" />);
    await screen.findByRole('heading', { name: 'Agendamento confirmado!' });

    expect(leitura).not.toHaveBeenCalled();
    leitura.mockRestore();
  });

  it('"Voltar para o perfil" na confirmação remontada abre a página inicial e limpa a URL', async () => {
    abrirEm('?reserva=appt-1&retorno=sucesso');
    const troca = vi.spyOn(window.history, 'replaceState');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA });
    const user = userEvent.setup();
    render(<PublicBookingFlow slug="studio-aurora" />);

    await user.click(await screen.findByRole('button', { name: 'Voltar para o perfil' }));

    expect(await screen.findByRole('button', { name: 'Agendar horário' })).toBeInTheDocument();
    expect(troca).toHaveBeenCalledWith(null, '', '/agendar/studio-aurora');
    troca.mockRestore();
  });
});
