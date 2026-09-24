import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Appointment } from '@/types';

const mockSearch = vi.hoisted(() => ({ value: '' }));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { AppointmentModule } = await import('../AppointmentModule');

const agendamento = (partes: Partial<Appointment> & { id: string; time: string }): Appointment => ({
  business_id: 'b1',
  client_id: 'c1',
  professional_id: 'p1',
  service_id: 's1',
  date: '2026-09-17T00:00:00',
  status: 'confirmado',
  reminder_sent: false,
  created_at: '2026-09-14T00:00:00',
  client_name: 'Mariana Souza',
  professional_name: 'Camila Rocha',
  service_name: 'Atendimento',
  service_price: 100,
  ...partes,
});

/** Responde /appointments com a lista dada e /business/settings com o horário dado. */
const responder = (agendamentos: Appointment[], settings?: unknown) => {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/appointments') return Promise.resolve({ data: agendamentos });
    if (url === '/business/settings') {
      return settings === undefined ? Promise.reject(new Error('sem acesso')) : Promise.resolve({ data: settings });
    }
    return Promise.resolve({ data: [] });
  });
};

describe('AppointmentModule', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockReplace.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockImplementation(() => Promise.resolve({ data: [] }));
  });

  it('abrir a Agenda com ?novo=1 carrega os dados do formulário de criação (clientes, profissionais e serviços)', async () => {
    mockSearch.value = 'novo=1';
    render(<AppointmentModule />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/clients');
      expect(mockApiGet).toHaveBeenCalledWith('/business/professionals');
      expect(mockApiGet).toHaveBeenCalledWith('/business/services');
    });
  });

  it('sem ?novo=1 não carrega os dados do formulário de criação', async () => {
    render(<AppointmentModule />);

    // Deixa os efeitos de montagem (data + agendamentos) rodarem antes de checar.
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/appointments', expect.anything());
    });

    expect(mockApiGet).not.toHaveBeenCalledWith('/clients');
    expect(mockApiGet).not.toHaveBeenCalledWith('/business/professionals');
    expect(mockApiGet).not.toHaveBeenCalledWith('/business/services');
  });
});

describe('AppointmentModule: horário de funcionamento', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockApiGet.mockReset();
  });

  it('mostra o horário de funcionamento configurado do negócio', async () => {
    responder([agendamento({ id: '1', time: '10:00:00' })], { openingTime: '09:00', closingTime: '19:00' });
    render(<AppointmentModule />);

    expect(await screen.findByText('9h - 19h')).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith('/business/settings');
  });

  it('sem horário configurado não afirma horário nenhum', async () => {
    responder([agendamento({ id: '1', time: '10:00:00' })]);
    render(<AppointmentModule />);

    await screen.findAllByText('Mariana Souza');
    expect(screen.queryByText(/\dh - \dh/)).not.toBeInTheDocument();
    expect(screen.queryByText('8h - 20h')).not.toBeInTheDocument();
  });

  it('a régua começa no horário configurado, não na janela padrão', async () => {
    responder([agendamento({ id: '1', time: '10:00:00' })], { openingTime: '09:00', closingTime: '19:00' });
    render(<AppointmentModule />);

    await screen.findByText('9h - 19h');
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.queryByText('08:00')).not.toBeInTheDocument();
  });
});

describe('AppointmentModule: cabeçalho e lista contam a mesma coisa', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockApiGet.mockReset();
  });

  it('o número de agendamentos e o faturamento seguem o filtro de status', async () => {
    responder([
      agendamento({ id: '1', time: '09:00:00', service_price: 100 }),
      agendamento({ id: '2', time: '10:00:00', status: 'cancelado', service_price: 70 }),
    ]);
    render(<AppointmentModule />);

    await screen.findByText('2 agendamentos');
    const kpiFaturamento = () => screen.getByText('Faturamento:').parentElement;
    // Cancelado não entra no faturamento previsto do dia.
    expect(kpiFaturamento()).toHaveTextContent('R$ 100');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
    expect(screen.getByText('1 agendamento')).toBeInTheDocument();
    expect(kpiFaturamento()).toHaveTextContent('R$ 0');
  });

  it('o filtro por profissional peneira a lista e o cabeçalho sem chamar a API de novo', async () => {
    responder([
      agendamento({ id: '1', time: '09:00:00' }),
      agendamento({
        id: '2',
        time: '11:00:00',
        professional_id: 'p2',
        professional_name: 'Bruna Lima',
        client_name: 'Letícia Albuquerque',
      }),
    ]);
    render(<AppointmentModule />);

    await screen.findByText('2 agendamentos');
    const chamadasAntes = mockApiGet.mock.calls.length;

    // Dois conjuntos de chips (um por largura); o do computador é o compacto, sem contagem.
    await userEvent.click(screen.getAllByRole('button', { name: /^Camila/ })[0]);

    expect(screen.getByText('1 agendamento')).toBeInTheDocument();
    expect(screen.queryByText('Letícia Albuquerque')).not.toBeInTheDocument();
    expect(mockApiGet.mock.calls.length).toBe(chamadasAntes);
  });

  it('profissional escolhida que não atende no dia seguinte não deixa a tela vazia', async () => {
    const camila = agendamento({ id: '1', time: '09:00:00' });
    const bruna = agendamento({
      id: '2',
      time: '11:00:00',
      professional_id: 'p2',
      professional_name: 'Bruna Lima',
      client_name: 'Letícia Albuquerque',
    });
    let doDia: Appointment[] = [camila, bruna];
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/appointments') return Promise.resolve({ data: doDia });
      if (url === '/business/settings') return Promise.reject(new Error('sem acesso'));
      return Promise.resolve({ data: [] });
    });
    render(<AppointmentModule />);

    await screen.findByText('2 agendamentos');
    await userEvent.click(screen.getAllByRole('button', { name: /^Camila/ })[0]);
    expect(screen.getByText('1 agendamento')).toBeInTheDocument();

    // Vira o dia: Camila não atende, então a peneira dela deixa de valer.
    doDia = [bruna];
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));

    expect(await screen.findByText('1 agendamento')).toBeInTheDocument();
    expect(screen.getAllByText('Letícia Albuquerque').length).toBeGreaterThan(0);
    screen.getAllByRole('button', { name: /^Todas/ }).forEach(botao => {
      expect(botao).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
