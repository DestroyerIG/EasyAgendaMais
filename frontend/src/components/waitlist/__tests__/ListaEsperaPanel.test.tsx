import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { ToastProvider } from '@/components/Toast';
import type { WaitlistItem } from '@/lib/waitlist';

const roteador = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => roteador,
}));

const espera = vi.hoisted(() => ({
  listarEspera: vi.fn(),
  inscreverEspera: vi.fn(),
  atualizarEspera: vi.fn(),
  ofertarVaga: vi.fn(),
  marcarAgendada: vi.fn(),
}));
vi.mock('@/lib/waitlist', () => espera);

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: (...args: unknown[]) => mockApiGet(...args) } }));

const { ListaEsperaPanel } = await import('../ListaEsperaPanel');

const item = (parcial: Partial<WaitlistItem> = {}): WaitlistItem => ({
  id: 'w1',
  cliente: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
  servico: { id: 's1', name: 'Manutenção' },
  profissional: null,
  desiredDate: null,
  period: 'tarde',
  notes: 'Prefere depois das 15h',
  status: 'aguardando',
  offeredAt: null,
  createdAt: '2026-10-14T12:00:00.000Z',
  ...parcial,
});

const renderizar = (props: Partial<Parameters<typeof ListaEsperaPanel>[0]> = {}) =>
  render(
    <ToastProvider>
      <ListaEsperaPanel aberto onFechar={vi.fn()} {...props} />
    </ToastProvider>,
  );

describe('ListaEsperaPanel', () => {
  beforeEach(() => {
    Object.values(espera).forEach((fn) => fn.mockReset());
    roteador.push.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: [{ id: 'c1', name: 'Mariana Souza', phone: '83999990000' }, { id: 'c2', name: 'Júlia Lima', phone: '83988887777' }] });
      if (url === '/business/services') return Promise.resolve({ data: [{ id: 's1', name: 'Manutenção', price: 130, duration_minutes: 90 }] });
      if (url === '/business/professionals') return Promise.resolve({ data: [{ id: 'p1', name: 'Camila Rocha' }] });
      return Promise.resolve({ data: [] });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('lista as inscrições com o filtro inicial (período e data da vaga)', async () => {
    espera.listarEspera.mockResolvedValue([
      item(),
      item({ id: 'w2', cliente: { id: 'c2', name: 'Júlia Lima', phone: '83988887777' }, profissional: { id: 'p1', name: 'Camila Rocha' }, desiredDate: '2026-10-15', period: 'manha', notes: null, status: 'oferecida' }),
    ]);
    renderizar({ filtroInicial: { period: 'tarde', date: '2026-10-15' } });

    expect(await screen.findByText('Mariana Souza')).toBeInTheDocument();
    expect(espera.listarEspera).toHaveBeenCalledWith({ period: 'tarde', date: '2026-10-15' });
    const primeira = screen.getByRole('listitem', { name: 'Mariana Souza' });
    expect(within(primeira).getByText(/Manutenção/)).toBeInTheDocument();
    expect(within(primeira).getByText(/Qualquer profissional/)).toBeInTheDocument();
    expect(within(primeira).getByText(/Qualquer dia/)).toBeInTheDocument();
    expect(within(primeira).getByText(/Tarde/)).toBeInTheDocument();
    expect(within(primeira).getByText('Prefere depois das 15h')).toBeInTheDocument();
    expect(within(primeira).getByText('Aguardando')).toBeInTheDocument();
    const segunda = screen.getByRole('listitem', { name: 'Júlia Lima' });
    expect(within(segunda).getByText(/Camila Rocha/)).toBeInTheDocument();
    expect(within(segunda).getByText(/15\/10/)).toBeInTheDocument();
    expect(within(segunda).getByText('Vaga oferecida')).toBeInTheDocument();
  });

  it('sem inscrições mostra o estado vazio', async () => {
    espera.listarEspera.mockResolvedValue([]);
    renderizar();
    expect(await screen.findByText('Ninguém na lista de espera')).toBeInTheDocument();
    expect(espera.listarEspera).toHaveBeenCalledWith({});
  });

  it('mostra a mensagem da API quando a lista é recusada (plano)', async () => {
    espera.listarEspera.mockRejectedValue(
      new AxiosError('x', '403', undefined, undefined, {
        status: 403,
        data: { success: false, error: 'Recurso indisponível no seu plano' },
      } as AxiosResponse),
    );
    renderizar();
    expect(await screen.findByText('Recurso indisponível no seu plano')).toBeInTheDocument();
  });

  it('inscreve uma cliente', async () => {
    const user = userEvent.setup();
    espera.listarEspera.mockResolvedValue([]);
    espera.inscreverEspera.mockResolvedValue(item({ id: 'w9', cliente: { id: 'c2', name: 'Júlia Lima', phone: '83988887777' } }));
    renderizar();
    await screen.findByText('Ninguém na lista de espera');

    await user.click(screen.getByRole('button', { name: 'Inscrever' }));
    await user.type(await screen.findByLabelText('Cliente'), 'Júlia');
    await user.click(await screen.findByRole('button', { name: /Júlia Lima/ }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Manutenção' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Serviço'), 's1');
    await user.selectOptions(screen.getByLabelText('Profissional'), 'p1');
    await user.selectOptions(screen.getByLabelText('Período'), 'tarde');
    await user.type(screen.getByLabelText('Observação'), 'Só às sextas');
    await user.click(screen.getByRole('button', { name: 'Salvar inscrição' }));

    await waitFor(() =>
      expect(espera.inscreverEspera).toHaveBeenCalledWith({
        clientId: 'c2', serviceId: 's1', professionalId: 'p1', period: 'tarde', notes: 'Só às sextas',
      }),
    );
    expect(espera.listarEspera).toHaveBeenCalledTimes(2);
  });

  it('oferece a vaga com a data e a hora vindas da Hoje e abre o WhatsApp devolvido pela API', async () => {
    const user = userEvent.setup();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    espera.listarEspera.mockResolvedValue([item()]);
    espera.ofertarVaga.mockResolvedValue({ item: item({ status: 'oferecida' }), whatsappUrl: 'https://wa.me/5583999990000?text=Ol%C3%A1' });
    renderizar({ vagaInicial: { date: '2026-10-15', time: '14:30', professionalId: 'p1' } });

    await user.click(await screen.findByRole('button', { name: 'Oferecer vaga' }));
    expect(screen.getByLabelText('Data da vaga')).toHaveValue('2026-10-15');
    expect(screen.getByLabelText('Horário da vaga')).toHaveValue('14:30');
    await user.click(screen.getByRole('button', { name: 'Abrir WhatsApp' }));

    await waitFor(() =>
      expect(espera.ofertarVaga).toHaveBeenCalledWith('w1', { date: '2026-10-15', time: '14:30', professionalId: 'p1' }),
    );
    expect(abrir).toHaveBeenCalledWith('https://wa.me/5583999990000?text=Ol%C3%A1', '_blank', 'noopener,noreferrer');
  });

  it('agendar abre o novo agendamento e marca a inscrição como agendada com o id criado', async () => {
    const user = userEvent.setup();
    espera.listarEspera.mockResolvedValue([item()]);
    espera.marcarAgendada.mockResolvedValue(item({ status: 'agendada' }));
    const onAgendar = vi.fn().mockResolvedValue({ id: 'a9' });
    renderizar({ onAgendar });

    await user.click(await screen.findByRole('button', { name: 'Agendar' }));

    expect(onAgendar).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
    await waitFor(() => expect(espera.marcarAgendada).toHaveBeenCalledWith('w1', 'a9'));
  });

  it('agendar sem salvar o agendamento não marca a inscrição', async () => {
    const user = userEvent.setup();
    espera.listarEspera.mockResolvedValue([item()]);
    const onAgendar = vi.fn().mockResolvedValue(null);
    renderizar({ onAgendar });

    await user.click(await screen.findByRole('button', { name: 'Agendar' }));
    await waitFor(() => expect(onAgendar).toHaveBeenCalled());
    expect(espera.marcarAgendada).not.toHaveBeenCalled();
  });

  it('fora da Agenda, agendar leva para a Agenda com a inscrição', async () => {
    const user = userEvent.setup();
    espera.listarEspera.mockResolvedValue([item()]);
    renderizar();

    await user.click(await screen.findByRole('button', { name: 'Agendar' }));
    expect(roteador.push).toHaveBeenCalledWith('/agendamentos?espera=w1');
  });

  it('na Agenda, uma inscrição pedida pela URL abre o agendamento sozinha', async () => {
    espera.listarEspera.mockResolvedValue([item()]);
    espera.marcarAgendada.mockResolvedValue(item({ status: 'agendada' }));
    const onAgendar = vi.fn().mockResolvedValue({ id: 'a9' });
    renderizar({ onAgendar, agendarAoAbrir: 'w1' });

    await waitFor(() => expect(onAgendar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(espera.marcarAgendada).toHaveBeenCalledWith('w1', 'a9'));
  });

  it('cancela a inscrição', async () => {
    const user = userEvent.setup();
    espera.listarEspera.mockResolvedValue([item()]);
    espera.atualizarEspera.mockResolvedValue(item({ status: 'cancelada' }));
    renderizar();

    await user.click(await screen.findByRole('button', { name: 'Cancelar inscrição' }));
    await waitFor(() => expect(espera.atualizarEspera).toHaveBeenCalledWith('w1', { status: 'cancelada' }));
  });
});
