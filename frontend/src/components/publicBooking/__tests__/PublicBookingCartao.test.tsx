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
    confirmarInfinitePay: vi.fn(),
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

  it('antes de ir ao Checkout grava a reserva no endereço, para o "voltar" achá-la', async () => {
    const troca = vi.spyOn(window.history, 'replaceState');
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: null, checkoutUrl, forma: 'cartao',
      automatica: true, cartaoIndisponivel: false, expiresAt: FUTURO,
    });
    const user = userEvent.setup();
    await irAteOsDados(user);
    await user.click(screen.getAllByRole('radio')[1]);
    await preencherEConfirmar(user);

    await waitFor(() => expect(assign).toHaveBeenCalledWith(checkoutUrl));
    expect(troca).toHaveBeenCalledWith(null, '', '/agendar/studio-aurora?reserva=appt-1');
    troca.mockRestore();
  });

  it('negócio só com cartão: o resumo diz cartão e a reserva pede cartão', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, formasPagamento: ['cartao'] });
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: null, checkoutUrl, forma: 'cartao',
      automatica: true, cartaoIndisponivel: false, expiresAt: FUTURO,
    });
    const user = userEvent.setup();
    await irAteOsDados(user);

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

  it('retorno=sucesso ou pendente ainda aguardando não oferece pagar de novo', async () => {
    for (const volta of ['sucesso', 'pendente']) {
      abrirEm(`?reserva=appt-1&retorno=${volta}`);
      api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA });
      const { unmount } = render(<PublicBookingFlow slug="studio-aurora" />);
      expect(await screen.findByText(/Estamos aguardando a confirmação do pagamento/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ir para o pagamento' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pagar com Pix' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('vencida há pouco segue consultando: o pagamento feito no limite ainda confirma na mesma tela', async () => {
    abrirEm('?reserva=appt-1&retorno=falha');
    const venceu = new Date(Date.now() - 60_000).toISOString();
    api.getAppointmentStatus.mockResolvedValueOnce({ situacao: 'expirado', reserva: { ...RESERVA, checkoutUrl: null, expiresAt: venceu } });
    render(<PublicBookingFlow slug="studio-aurora" />);
    expect(await screen.findByRole('button', { name: 'Escolher outro horário' })).toBeInTheDocument();

    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: { ...RESERVA, expiresAt: venceu } });
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
  });

  it('vencida há mais de 30 minutos para de consultar', async () => {
    abrirEm('?reserva=appt-1&retorno=falha');
    const venceu = new Date(Date.now() - 31 * 60_000).toISOString();
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'expirado', reserva: { ...RESERVA, checkoutUrl: null, expiresAt: venceu } });
    render(<PublicBookingFlow slug="studio-aurora" />);
    expect(await screen.findByRole('button', { name: 'Escolher outro horário' })).toBeInTheDocument();
    fireEvent(document, new Event('visibilitychange'));
    expect(api.getAppointmentStatus).toHaveBeenCalledTimes(1);
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

  it('reserva de cartão expirada mostra o título do prazo para pagar, sem falar em Pix', async () => {
    abrirEm('?reserva=appt-1&retorno=falha');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'expirado', reserva: { ...RESERVA, checkoutUrl: null } });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'O prazo para pagar acabou' })).toBeInTheDocument();
    expect(screen.queryByText('O prazo do Pix acabou')).not.toBeInTheDocument();
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

describe('InfinitePay', () => {
  const STOREFRONT_IP = { ...STOREFRONT, formasPagamento: ['cartao'], gatewayPagamento: 'infinitepay' };
  const RESERVA_IP = { ...RESERVA, gateway: 'infinitepay', checkoutUrl: 'https://checkout.infinitepay.io/x' };

  it('antes de pagar usa os rótulos da InfinitePay, sem falar em cartão', async () => {
    api.getStorefront.mockResolvedValue(STOREFRONT_IP);
    const user = userEvent.setup();
    await irAteOsDados(user);

    expect(screen.getByText('Sinal')).toBeInTheDocument();
    expect(screen.queryByText('Sinal cartão')).not.toBeInTheDocument();
    expect(screen.getByText('Pagamento do sinal na InfinitePay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar o sinal na InfinitePay (Pix ou cartão)' })).toBeInTheDocument();
    expect(screen.getByText('Você escolhe Pix ou cartão na página da InfinitePay.')).toBeInTheDocument();
  });

  it('na volta confirma a cobrança uma vez, mostra a situação e limpa os parâmetros da URL', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay&order_nsu=C&transaction_nsu=T&slug=F&capture_method=pix&receipt_url=x');
    const replace = vi.spyOn(window.history, 'replaceState');
    api.confirmarInfinitePay.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA_IP });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
    expect(api.confirmarInfinitePay).toHaveBeenCalledTimes(1);
    expect(api.confirmarInfinitePay).toHaveBeenCalledWith('studio-aurora', 'appt-1', {
      orderNsu: 'C', transactionNsu: 'T', fatura: 'F',
    });
    expect(api.getAppointmentStatus).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(
      window.history.state, '', '/agendar/studio-aurora?reserva=appt-1&retorno=infinitepay',
    );
    replace.mockRestore();
  });

  it('na volta sem pagamento confirmado oferece ir para o pagamento', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay&order_nsu=C&transaction_nsu=T&slug=F');
    api.confirmarInfinitePay.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA_IP });
    render(<PublicBookingFlow slug="studio-aurora" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Ir para o pagamento' }));
    expect(assign).toHaveBeenCalledWith('https://checkout.infinitepay.io/x');
  });

  it('sem transaction_nsu só consulta o status', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA_IP });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('button', { name: 'Ir para o pagamento' })).toBeInTheDocument();
    expect(api.confirmarInfinitePay).not.toHaveBeenCalled();
    expect(api.getAppointmentStatus).toHaveBeenCalledWith('studio-aurora', 'appt-1');
  });

  it('se a confirmação falha, cai na consulta do status sem erro na tela', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay&order_nsu=C&transaction_nsu=T&slug=F');
    api.confirmarInfinitePay.mockRejectedValue(new Error('rede'));
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado', reserva: RESERVA_IP });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
    expect(api.getAppointmentStatus).toHaveBeenCalledWith('studio-aurora', 'appt-1');
  });

  it('na volta ainda aguardando oferece o Pix direto ao estabelecimento e chama o fluxo de Pix', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA_IP });
    api.trocarParaPix.mockResolvedValue({ pixPayload: '000201pix', forma: 'pix', expiresAt: FUTURO });
    render(<PublicBookingFlow slug="studio-aurora" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Pagar com Pix direto ao estabelecimento' }));
    await waitFor(() => expect(api.trocarParaPix).toHaveBeenCalledWith('studio-aurora', 'appt-1'));
  });

  it('sem checkoutUrl ainda mostra o Pix direto ao estabelecimento', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay');
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: { ...RESERVA_IP, checkoutUrl: null } });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('button', { name: 'Pagar com Pix direto ao estabelecimento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ir para o pagamento' })).not.toBeInTheDocument();
  });

  it('depois de trocar para o Pix direto, os rótulos passam a ser do Pix', async () => {
    abrirEm('?reserva=appt-1&retorno=infinitepay');
    api.getStorefront.mockResolvedValue(STOREFRONT_IP);
    api.getAppointmentStatus.mockResolvedValue({ situacao: 'aguardando', reserva: RESERVA_IP });
    api.trocarParaPix.mockResolvedValue({ pixPayload: '000201pix', forma: 'pix', expiresAt: FUTURO });
    render(<PublicBookingFlow slug="studio-aurora" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Pagar com Pix direto ao estabelecimento' }));
    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('000201pix');
    expect(screen.getByText('Sinal Pix')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do sinal Pix')).toBeInTheDocument();
    expect(screen.queryByText('Pagamento do sinal na InfinitePay')).not.toBeInTheDocument();
  });

  it('reserva remontada no Pix manual, com a InfinitePay conectada, usa os rótulos do Pix', async () => {
    abrirEm('?reserva=appt-1');
    api.getStorefront.mockResolvedValue(STOREFRONT_IP);
    api.getAppointmentStatus.mockResolvedValue({
      situacao: 'aguardando', reserva: { ...RESERVA, forma: 'pix', gateway: null, checkoutUrl: null, pixPayload: '000201manual' },
    });
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('000201manual');
    await waitFor(() => expect(api.getStorefront).toHaveBeenCalled());
    expect(await screen.findByText('Sinal Pix')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do sinal Pix')).toBeInTheDocument();
  });

  it('link que não pôde ser criado cai no Pix manual com os rótulos do Pix', async () => {
    api.getStorefront.mockResolvedValue(STOREFRONT_IP);
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201manual', checkoutUrl: null, forma: 'pix',
      automatica: false, cartaoIndisponivel: true, expiresAt: FUTURO,
    });
    const user = userEvent.setup();
    await irAteOsDados(user);
    await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
    await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
    await user.click(screen.getByRole('button', { name: 'Pagar o sinal na InfinitePay (Pix ou cartão)' }));

    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('000201manual');
    expect(screen.getByText('Sinal Pix')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do sinal Pix')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('Mercado Pago segue com os rótulos de hoje', async () => {
    api.getStorefront.mockResolvedValue({ ...STOREFRONT, formasPagamento: ['cartao'], gatewayPagamento: 'mercadopago' });
    const user = userEvent.setup();
    await irAteOsDados(user);

    expect(screen.getByText('Sinal cartão')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do sinal no cartão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar agendamento/i })).toBeInTheDocument();
  });
});
