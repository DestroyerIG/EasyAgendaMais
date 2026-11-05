import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { PublicBookingFlow } from '../PublicBookingFlow';
import { publicBookingApi } from '@/lib/publicBooking';
import { dataPorExtenso } from '@/lib/agendamentoPublico';

vi.mock('@/components/clube/AdesaoClube', () => ({ ClubeVitrine: () => null }));
vi.mock('@/lib/publicBooking', () => ({
  publicBookingApi: {
    getStorefront: vi.fn(),
    getProfessionals: vi.fn(),
    getAvailabilityGrid: vi.fn(),
    getAvailabilityDays: vi.fn(),
    getAppointmentStatus: vi.fn(),
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
  address: null as string | null,
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

const HORARIOS = ['09:00', '14:00', '14:30'].map((horario) => ({ horario, livre: true }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getStorefront.mockResolvedValue(STOREFRONT);
  api.getProfessionals.mockResolvedValue([{ id: 'prof-1', name: 'Paula' }]);
  api.getAvailabilityGrid.mockResolvedValue(HORARIOS);
  api.getAvailabilityDays.mockResolvedValue([{ date: todayIso(), vagas: 3 }]);
});

const clickContinuar = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Continuar' }));

const EQUIPE = [{ id: 'prof-1', name: 'Paula' }, { id: 'prof-2', name: 'Bruna' }];

const goToServiceStep = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<PublicBookingFlow slug="studio-aurora" />);
  await user.click(await screen.findByRole('button', { name: 'Agendar horário' }));
};

const goToTimeStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await goToServiceStep(user);
  await user.click(await screen.findByText('Manutenção Fibra'));
  await clickContinuar(user);
  await screen.findByLabelText('Data do agendamento');
};

const goToPagamentoStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await goToTimeStep(user);
  fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });
  await user.click(await screen.findByRole('button', { name: '14:00' }));
  await clickContinuar(user);
};

const goToPixStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await goToPagamentoStep(user);
  await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
  await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
  await user.click(screen.getByRole('button', { name: /confirmar agendamento/i }));
};

describe('PublicBookingFlow', () => {
  it('mostra o nome do negócio e os serviços elegíveis ao carregar', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('heading', { name: 'Studio Aurora' })).toBeInTheDocument();
    expect(publicBookingApi.getStorefront).toHaveBeenCalledWith('studio-aurora');

    await userEvent.click(screen.getByRole('button', { name: 'Agendar horário' }));
    expect(await screen.findByText('Manutenção Fibra')).toBeInTheDocument();
  });

  it('mostra uma mensagem quando o negócio não tem nenhum serviço elegível', async () => {
    api.getStorefront.mockResolvedValueOnce({ ...STOREFRONT, services: [] });

    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText(/nenhum serviço disponível para agendamento online/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agendar horário' })).not.toBeInTheDocument();
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

    await screen.findByRole('heading', { name: 'Studio Aurora' });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('mostra endereço e mapa quando o negócio tem localização cadastrada', async () => {
    api.getStorefront.mockResolvedValueOnce({ ...STOREFRONT, address: 'Rua das Flores, 123 - Centro' });

    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText('Rua das Flores, 123 - Centro')).toBeInTheDocument();
    expect(screen.getByTitle('Localização do negócio')).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('Rua das Flores, 123 - Centro'))
    );
  });

  it('não mostra o bloco de localização sem endereço cadastrado', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    await screen.findByRole('heading', { name: 'Studio Aurora' });
    expect(screen.queryByTitle('Localização do negócio')).not.toBeInTheDocument();
  });

  it('exige selecionar um serviço antes de habilitar Continuar', async () => {
    await goToServiceStep(userEvent.setup());
    await screen.findByText('Manutenção Fibra');

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });

  it('mostra erro visível quando falha ao carregar os profissionais', async () => {
    const user = userEvent.setup();
    api.getProfessionals.mockRejectedValue(new Error('falhou'));
    await goToServiceStep(user);

    await user.click(await screen.findByText('Manutenção Fibra'));
    await clickContinuar(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as profissionais');
    expect(screen.getAllByText('Manutenção Fibra').length).toBeGreaterThan(0); // continua na etapa de serviço
  });

  it('mostra erro visível quando falha ao carregar os horários', async () => {
    const user = userEvent.setup();
    api.getAvailabilityGrid.mockRejectedValue(new Error('falhou'));
    await goToTimeStep(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os horários disponíveis. Tente novamente.'
    );
  });

  it('o seletor de data não permite datas passadas (min = hoje)', async () => {
    const user = userEvent.setup();
    await goToTimeStep(user);

    expect(screen.getByLabelText('Data do agendamento')).toHaveAttribute('min', todayIso());
  });

  it('agrupa os horários livres em Manhã e Tarde', async () => {
    const user = userEvent.setup();
    await goToTimeStep(user);

    fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });

    expect(await screen.findByText('Manhã')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument();
    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '14:00' })).toBeInTheDocument();
  });

  it('mostra o resumo do serviço e o cálculo de sinal/restante na etapa de pagamento', async () => {
    const user = userEvent.setup();
    await goToPagamentoStep(user);

    expect(screen.getAllByText('Manutenção Fibra').length).toBeGreaterThan(0);
    expect(screen.getByText('R$ 39,00')).toBeInTheDocument(); // sinal (30% de 130)
    expect(screen.getByText('R$ 91,00')).toBeInTheDocument(); // restante (130 - 39)
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
    expect(api.getAvailabilityGrid).toHaveBeenCalledTimes(3); // hoje, a data escolhida e a lista atualizada
  });

  it('em outros erros na reserva mostra a mensagem do servidor', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockRejectedValue(axiosError(400, 'Não é possível agendar em uma data que já passou'));

    await goToPixStep(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não é possível agendar em uma data que já passou');
    expect(screen.getByPlaceholderText('Seu nome')).toBeInTheDocument();
  });
  it('a caixa de consentimento do WhatsApp começa desmarcada e, desmarcada, a reserva vai com whatsappConsent: false', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIXCODE6304ABCD', expiresAt: new Date().toISOString(),
    });
    await goToPagamentoStep(user);

    const caixa = screen.getByRole('checkbox', { name: 'Quero receber lembretes e novidades pelo WhatsApp de Studio Aurora' });
    expect(caixa).not.toBeChecked();
    expect(screen.getByText('Você pode cancelar quando quiser, é só avisar o estabelecimento.')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
    await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
    await user.click(screen.getByRole('button', { name: /confirmar agendamento/i }));

    await waitFor(() => expect(api.createAppointment).toHaveBeenCalledWith('studio-aurora', expect.objectContaining({ whatsappConsent: false })));
  });

  it('com a caixa marcada, a reserva é enviada com whatsappConsent: true', async () => {
    const user = userEvent.setup();
    api.createAppointment.mockResolvedValue({
      appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIXCODE6304ABCD', expiresAt: new Date().toISOString(),
    });
    await goToPagamentoStep(user);

    await user.click(screen.getByRole('checkbox', { name: /Quero receber lembretes e novidades pelo WhatsApp/ }));
    await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
    await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
    await user.click(screen.getByRole('button', { name: /confirmar agendamento/i }));

    await waitFor(() =>
      expect(api.createAppointment).toHaveBeenCalledWith('studio-aurora', {
        serviceId: 'srv-1', professionalId: 'prof-1', date: '2099-10-24', time: '14:00',
        clientName: 'Mariana', clientPhone: '83999990000', whatsappConsent: true,
      }),
    );
  });

  it('abre no perfil com a marca da plataforma e o WhatsApp do negócio', async () => {
    api.getStorefront.mockResolvedValueOnce({ ...STOREFRONT, whatsapp: '83999990000' });

    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByRole('link', { name: /tirar dúvidas no whatsapp/i })).toHaveAttribute('href', 'https://wa.me/5583999990000');
    expect(screen.getByText('Agendamento por EasyAgenda+')).toBeInTheDocument();
    expect(screen.queryByText('Manutenção Fibra')).not.toBeInTheDocument();
  });

  it('aplica a cor do negócio com texto legível sobre ela', async () => {
    api.getStorefront.mockResolvedValueOnce({ ...STOREFRONT, brandColor: '#1B3A6B' });

    render(<PublicBookingFlow slug="studio-aurora" />);

    const botao = await screen.findByRole('button', { name: 'Agendar horário' });
    const casca = botao.closest('[style*="--color-brand"]') as HTMLElement;
    expect(casca.style.getPropertyValue('--color-brand')).toBe('27 58 107');
    expect(casca.style.getPropertyValue('--color-on-brand')).toBe('255 255 255');
  });

  it('com uma profissional só pula a escolha e conta 3 etapas', async () => {
    const user = userEvent.setup();
    await goToServiceStep(user);

    expect(await screen.findByText('Etapa 1 de 3')).toBeInTheDocument();
    await user.click(await screen.findByText('Manutenção Fibra'));
    await clickContinuar(user);

    expect(await screen.findByText('Etapa 2 de 3')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /escolha a profissional/i })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getAvailabilityGrid).toHaveBeenCalledWith('studio-aurora', {
      serviceId: 'srv-1', professionalId: 'prof-1', date: todayIso(),
    }));
  });

  it('com duas ou mais profissionais mostra a escolha e conta 4 etapas', async () => {
    const user = userEvent.setup();
    api.getProfessionals.mockResolvedValue(EQUIPE);
    await goToServiceStep(user);

    expect(await screen.findByText('Etapa 1 de 4')).toBeInTheDocument();
    await user.click(await screen.findByText('Manutenção Fibra'));
    await clickContinuar(user);

    expect(await screen.findByRole('heading', { name: /escolha a profissional/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await user.click(screen.getByText('Bruna'));
    await clickContinuar(user);

    expect(await screen.findByText('Etapa 3 de 4')).toBeInTheDocument();
    await waitFor(() => expect(api.getAvailabilityGrid).toHaveBeenCalledWith('studio-aurora', expect.objectContaining({ professionalId: 'prof-2' })));
  });

  it('avisa quando o negócio não tem profissional para atender', async () => {
    const user = userEvent.setup();
    api.getProfessionals.mockResolvedValue([]);
    await goToServiceStep(user);

    await user.click(await screen.findByText('Manutenção Fibra'));
    await clickContinuar(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('agendamento online está indisponível');
  });

  it('escolhe o dia pela faixa e mostra o término previsto do horário', async () => {
    const user = userEvent.setup();
    await goToTimeStep(user);
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const amanhaIso = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;

    await user.click(screen.getByRole('button', { name: dataPorExtenso(amanhaIso) }));
    await user.click(await screen.findByRole('button', { name: '14:00' }));

    await waitFor(() => expect(api.getAvailabilityGrid).toHaveBeenCalledWith('studio-aurora', expect.objectContaining({ date: amanhaIso })));
    expect(screen.getByText('15:45')).toBeInTheDocument(); // 14:00 + 1h45
  });

  it('ignora a resposta antiga quando a cliente troca de dia antes dela chegar', async () => {
    const user = userEvent.setup();
    await goToTimeStep(user);
    let responderAntiga: (horarios: unknown[]) => void = () => undefined;
    api.getAvailabilityGrid.mockReturnValueOnce(new Promise((resolve) => { responderAntiga = resolve; }));
    api.getAvailabilityGrid.mockResolvedValueOnce([{ horario: '16:00', livre: true }]);

    fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-24' } });
    fireEvent.change(screen.getByLabelText('Data do agendamento'), { target: { value: '2099-10-25' } });
    await screen.findByRole('button', { name: '16:00' });
    responderAntiga([{ horario: '08:00', livre: true }]);

    await waitFor(() => expect(screen.queryByRole('button', { name: '08:00' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '16:00' })).toBeInTheDocument();
  });

  it('volta da etapa de pagamento para o horário sem perder a escolha', async () => {
    const user = userEvent.setup();
    await goToPagamentoStep(user);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByRole('button', { name: '14:00' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mostra capa, apresentação, comodidades, nota e horário de hoje no perfil', async () => {
    api.getStorefront.mockResolvedValueOnce({
      ...STOREFRONT, coverUrl: 'https://cdn.test/capa.jpg', descricao: 'Atendimento com hora marcada.',
      comodidades: ['wifi', 'desconhecida'], nota: { media: 4.9, quantidade: 187 }, atendeHojeAte: '19:00',
    });

    const { container } = render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText('Atendimento com hora marcada.')).toBeInTheDocument();
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument();
    expect(screen.getByText('4,9')).toBeInTheDocument();
    expect(screen.getByText('(187)')).toBeInTheDocument();
    expect(screen.getByText('Atende hoje até 19h')).toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.test/capa.jpg"]')).not.toBeNull();
  });

  it('sem nota e fora do horário mostra só o selo de agendamento online', async () => {
    render(<PublicBookingFlow slug="studio-aurora" />);

    expect(await screen.findByText('Agendamento online')).toBeInTheDocument();
    expect(screen.queryByText(/atende hoje/i)).not.toBeInTheDocument();
  });

  it('mostra a descrição do serviço', async () => {
    api.getStorefront.mockResolvedValueOnce({
      ...STOREFRONT, services: [{ ...STOREFRONT.services[0], descricao: 'Inclui lavagem.' }],
    });
    await goToServiceStep(userEvent.setup());

    expect(await screen.findByText('Inclui lavagem.')).toBeInTheDocument();
  });

  it('abre no primeiro dia com vaga e mostra as vagas na faixa', async () => {
    const user = userEvent.setup();
    const depois = new Date();
    depois.setDate(depois.getDate() + 2);
    const depoisIso = `${depois.getFullYear()}-${String(depois.getMonth() + 1).padStart(2, '0')}-${String(depois.getDate()).padStart(2, '0')}`;
    api.getAvailabilityDays.mockResolvedValue([{ date: todayIso(), vagas: 0 }, { date: depoisIso, vagas: 1 }]);

    await goToTimeStep(user);

    await waitFor(() => expect(api.getAvailabilityGrid).toHaveBeenCalledWith('studio-aurora', expect.objectContaining({ date: depoisIso })));
    expect(screen.getByText('Sem vagas')).toBeInTheDocument();
    expect(screen.getByText('1 vaga')).toBeInTheDocument();
  });

  it('segue funcionando se a contagem de vagas falhar', async () => {
    api.getAvailabilityDays.mockRejectedValue(new Error('falhou'));
    await goToTimeStep(userEvent.setup());

    expect(await screen.findByRole('button', { name: '14:00' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra o horário ocupado riscado e sem permitir escolher', async () => {
    api.getAvailabilityGrid.mockResolvedValue([{ horario: '09:00', livre: false }, { horario: '14:00', livre: true }]);
    await goToTimeStep(userEvent.setup());

    expect(await screen.findByRole('button', { name: /09:00 ocupado/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: '14:00' })).toBeEnabled();
  });

  describe('depois do Pix', () => {
    const RESERVA = { appointmentId: 'appt-1', depositAmount: 39, pixPayload: '000201PIX', expiresAt: new Date(2099, 1, 1).toISOString() };

    const irAtePix = async () => {
      const user = userEvent.setup();
      api.createAppointment.mockResolvedValue(RESERVA);
      await goToPixStep(user);
      await screen.findByRole('button', { name: 'Copiar código' });
      return user;
    };
    const voltarParaAPagina = () => fireEvent(document, new Event('visibilitychange'));

    it('troca para a confirmação quando o dono confirma', async () => {
      api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado' });
      await irAtePix();

      voltarParaAPagina();

      expect(await screen.findByRole('heading', { name: 'Agendamento confirmado!' })).toBeInTheDocument();
      expect(screen.getByText(/Tudo certo, Mariana!/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /adicionar à agenda do celular/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copiar código' })).not.toBeInTheDocument();
      expect(api.getAppointmentStatus).toHaveBeenCalledWith('studio-aurora', 'appt-1');
    });

    it('continua aguardando se a consulta falhar', async () => {
      api.getAppointmentStatus.mockRejectedValue(new Error('falhou'));
      await irAtePix();

      voltarParaAPagina();

      await waitFor(() => expect(api.getAppointmentStatus).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Copiar código' })).toBeInTheDocument();
    });

    it('avisa quando o prazo acaba e deixa escolher outro horário', async () => {
      api.getAppointmentStatus.mockResolvedValue({ situacao: 'expirado' });
      const user = await irAtePix();

      voltarParaAPagina();

      expect(await screen.findByRole('heading', { name: 'O prazo do Pix acabou' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Escolher outro horário' }));
      expect(await screen.findByLabelText('Data do agendamento')).toBeInTheDocument();
    });

    it('volta ao perfil depois da confirmação, pronta para um novo agendamento', async () => {
      api.getAppointmentStatus.mockResolvedValue({ situacao: 'confirmado' });
      const user = await irAtePix();
      voltarParaAPagina();

      await user.click(await screen.findByRole('button', { name: 'Voltar para o perfil' }));

      expect(await screen.findByRole('button', { name: 'Agendar horário' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Agendamento confirmado!' })).not.toBeInTheDocument();
    });
  });
});
