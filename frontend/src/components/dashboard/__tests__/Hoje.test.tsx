import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HojeDto } from '@/lib/hoje';
import { MENSAGENS, linkWhatsapp, preencherMensagem } from '@/lib/whatsappLink';

const mockBuscarHoje = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hoje', () => ({ buscarHoje: () => mockBuscarHoje() }));

// Roteador estável, como o do Next: um objeto novo a cada render refaria a busca.
const roteador = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => roteador,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'carla@aurora.com', role: 'owner', businessId: 'b1', businessName: 'Studio Aurora', ownerName: 'Carla' },
    loading: false,
  }),
}));

// O gráfico (recharts) não desenha no jsdom; o stub só mostra o que recebeu.
vi.mock('@/components/WeeklyChart', () => ({
  WeeklyChart: ({ data }: { data: Array<{ date: string; total: number }> }) => (
    <div data-testid="grafico-semana">{data.map((d) => `${d.date}=${d.total}`).join('|')}</div>
  ),
}));

const { default: DashboardPage } = await import('@/app/dashboard/page');

const base = (parcial: Partial<HojeDto> = {}): HojeDto => ({
  saudacao: { ownerName: 'Carla', date: '2026-10-13' },
  faturamento: { valor: 1460, meta: 1800, percentual: 81 },
  agendamentos: { total: 16, livresTarde: 2 },
  ocupacao: { percentual: 84, variacao: 6, diaDaSemana: 'terça' },
  confirmadosLembrete: { quantidade: 12, valor: 2980 },
  pendencias: [],
  proximas: [],
  semana: [
    { data: '2026-10-07', valor: 900 },
    { data: '2026-10-13', valor: 1460 },
  ],
  ...parcial,
});

const avaliacao = {
  tipo: 'avaliacao' as const,
  quantidade: 1,
  avaliacoes: [
    { clientId: 'c9', cliente: 'Joana Lima', phone: '83988887777', nota: 2, comentario: 'Atrasou muito.', data: '2026-10-12T21:30:00.000Z' },
  ],
};
const sinais = { tipo: 'sinais_pix' as const, quantidade: 3, total: 110, expiraEmMinutos: 30 };

const renderizar = async (dto: HojeDto) => {
  mockBuscarHoje.mockResolvedValue(dto);
  render(<DashboardPage />);
  return screen.findByText('Precisa de você');
};

describe('Tela Hoje com dados reais', () => {
  beforeEach(() => {
    mockBuscarHoje.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. saudação usa ownerName ("Bom dia, Carla" às 09:00) e a data por extenso', async () => {
    await renderizar(base());
    expect(screen.getByRole('heading', { name: 'Bom dia, Carla' })).toBeInTheDocument();
    expect(screen.getByText('terça, 13 de outubro de 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Bom dia, Studio Aurora/)).not.toBeInTheDocument();
    expect(mockBuscarHoje).toHaveBeenCalledTimes(1);
  });

  it('2. com meta mostra "Meta R$ 1.800,00" e "81%"; sem meta mostra o link "Definir meta"', async () => {
    await renderizar(base());
    expect(screen.getByText('Meta R$ 1.800,00')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Definir meta' })).not.toBeInTheDocument();
  });

  it('2b. sem meta mostra o link "Definir meta" para /configuracoes', async () => {
    await renderizar(base({ faturamento: { valor: 300, meta: null, percentual: null } }));
    expect(screen.getByRole('link', { name: 'Definir meta' })).toHaveAttribute('href', '/configuracoes');
    expect(screen.queryByText(/^Meta R\$/)).not.toBeInTheDocument();
  });

  it('3. variação +6 → "+6% vs média de terça"', async () => {
    await renderizar(base());
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('+6%')).toBeInTheDocument();
    expect(screen.getByText('vs média de terça')).toBeInTheDocument();
  });

  it('3b. ocupação null → "Sem expediente hoje"', async () => {
    await renderizar(base({ ocupacao: null }));
    expect(screen.getByText('Sem expediente hoje')).toBeInTheDocument();
    expect(screen.queryByText(/vs média/)).not.toBeInTheDocument();
  });

  it('cartões de agendamentos e lembrete usam os números do DTO', async () => {
    await renderizar(base());
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('2 horários livres à tarde')).toBeInTheDocument();
    expect(screen.getByText('Confirmados por lembrete')).toBeInTheDocument();
    expect(screen.getByText('12 atendimentos com lembrete enviado no mês')).toBeInTheDocument();
  });

  it('lembrete zerado → "Nenhum atendimento com lembrete neste mês"', async () => {
    await renderizar(base({ confirmadosLembrete: { quantidade: 0, valor: 0 } }));
    expect(screen.getByText('Nenhum atendimento com lembrete neste mês')).toBeInTheDocument();
  });

  it('4. pendências: só as recebidas, na ordem do DTO, com o contador "2 pendências"', async () => {
    await renderizar(base({ pendencias: [sinais, avaliacao] }));
    expect(screen.getByText('2 pendências')).toBeInTheDocument();

    const pix = screen.getByText('3 sinais Pix aguardando pagamento');
    const aval = screen.getByText('1 avaliação desfavorável');
    expect(pix.compareDocumentPosition(aval) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Expira em 30 min (R$ 110,00 pendentes)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver pendências' })).toHaveAttribute('href', '/agendamentos?aba=aguardando-pix');

    expect(screen.queryByText(/horários? vagos? à tarde/)).not.toBeInTheDocument();
    expect(screen.queryByText(/retorno vencido/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tudo em dia por aqui')).not.toBeInTheDocument();
  });

  it('4b. sem pendências mostra "Tudo em dia por aqui"', async () => {
    await renderizar(base({ pendencias: [] }));
    expect(screen.getByText('Tudo em dia por aqui')).toBeInTheDocument();
    expect(screen.queryByText(/pendências?$/)).not.toBeInTheDocument();
  });

  it('4c. vagas à tarde e retorno vencido com textos e ações próprias', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await renderizar(
      base({
        pendencias: [
          {
            tipo: 'vagas_tarde',
            quantidade: 2,
            vagas: [
              { profissional: 'Rita', professionalId: 'p1', inicio: '14:30', fim: '15:30' },
              { profissional: 'Ana', professionalId: 'p2', inicio: '16:00', fim: '17:00' },
            ],
          },
          {
            tipo: 'retorno_vencido',
            quantidade: 1,
            clientes: [{ id: 'c1', name: 'Lúcia Prado', phone: '83977776666', servico: 'Manutenção', venceuHa: 5 }],
          },
        ],
      }),
    );
    expect(screen.getByText('2 horários vagos à tarde')).toBeInTheDocument();
    expect(screen.getByText('14:30 com Rita, 16:00 com Ana')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Oferecer à lista de espera' })).toHaveAttribute('href', '/agendamentos');

    expect(screen.getByText('1 cliente com retorno vencido')).toBeInTheDocument();
    expect(screen.queryByText('Lúcia Prado')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lembrar no WhatsApp' }));
    expect(screen.getByText('Lúcia Prado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem para Lúcia Prado' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox')).toHaveValue(
      preencherMensagem(MENSAGENS.retorno_vencido, { nome: 'Lúcia', servico: 'Manutenção', negocio: 'Studio Aurora' }),
    );
  });

  it('5. "Ver e responder" abre o modal com a resposta, nota e comentário, e o WhatsApp do telefone da avaliação', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderizar(base({ pendencias: [avaliacao] }));
    expect(screen.getByText(/^Cliente Joana Lima · /)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver e responder' }));
    const dialog = await screen.findByRole('dialog');
    const mensagem = preencherMensagem(MENSAGENS.resposta_avaliacao, { nome: 'Joana', negocio: 'Studio Aurora' });
    expect(within(dialog).getByRole('textbox')).toHaveValue(mensagem);
    expect(within(dialog).getByText('Nota 2 de 5')).toBeInTheDocument();
    expect(within(dialog).getByText('Atrasou muito.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Abrir conversa no WhatsApp' }));
    expect(abrir).toHaveBeenCalledWith(linkWhatsapp('83988887777', mensagem), '_blank', 'noopener');
    abrir.mockRestore();
  });

  it('6. nenhum nome de exemplo (Camila, Bruna, Paula) aparece quando o DTO não traz', async () => {
    await renderizar(base({ pendencias: [sinais] }));
    expect(document.body.textContent).not.toMatch(/Camila|Bruna|Paula/);
    expect(document.body.textContent).not.toMatch(/profissionais ativas/);
  });

  it('o gráfico recebe a semana do DTO', async () => {
    await renderizar(base());
    expect(screen.getByTestId('grafico-semana')).toHaveTextContent('2026-10-07T00:00:00=900|2026-10-13T00:00:00=1460');
  });

  it('"Próximas 2 horas" mostra as próximas do DTO', async () => {
    await renderizar(
      base({
        proximas: [
          {
            id: 'a1', date: '2026-10-13', time: '09:30:00', status: 'confirmado',
            client_name: 'Marina Costa', client_phone: '83999990000', professional_name: 'Rita',
            service_name: 'Corte', service_price: 120, service_duration_minutes: 60, source: 'painel',
            deposit_amount: null, started_at: null, comanda_id: null, comanda_status: null,
            comanda_number: null, comanda_total_charged: null, comanda_deposit_applied: null,
          },
        ],
      }),
    );
    expect(screen.getByText('Marina Costa')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
  });
});
