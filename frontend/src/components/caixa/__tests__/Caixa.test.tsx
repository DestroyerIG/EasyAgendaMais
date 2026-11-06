import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { FinanceModule } from '@/components/FinanceModule';
import * as caixa from '@/lib/caixa';
import { ExpenseModal } from '@/components/finance/ExpenseModal';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockImplementation((url: string) => {
  if (url === '/finance/summary') return Promise.resolve({ data: { today: { earnings: 0, expenses: 0 }, month: { earnings: 0, expenses: 0 } } });
  return Promise.resolve({ data: [] });
}), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/lib/caixa', async (orig) => ({ ...(await orig<typeof import('@/lib/caixa')>()), buscarCaixa: vi.fn(), abrirCaixa: vi.fn(), fecharCaixa: vi.fn(), reabrirCaixa: vi.fn(), registrarMovimento: vi.fn() }));

const acesso = { allowed: true } as never;
const dia = (over: Partial<caixa.CashDay> = {}): caixa.CashDay => ({
  date: '2026-10-13', isToday: true, responsavel: 'Carla',
  session: { id: 'cx1', openedAt: '2026-10-13T10:45:00Z', openingBalance: 150, closedAt: null, countedBalance: null, expectedBalance: null, difference: null },
  totals: { entradas: 340, entradasQtd: 4, saidas: 120, saidasQtd: 2, saldo: 220 },
  comandasResumo: { total: 4, fechadas: 3, abertas: 0, falta: 1 },
  formas: [
    { chave: 'pix', valor: 115, quantidade: 1 }, { chave: 'sinal_pix', valor: 30, quantidade: 1 },
    { chave: 'sinal_cartao', valor: 0, quantidade: 0 },
    { chave: 'debito', valor: 75, quantidade: 1 }, { chave: 'credito', valor: 0, quantidade: 0 }, { chave: 'dinheiro', valor: 120, quantidade: 1 },
  ],
  linhas: [{ appointmentId: 'a9', comandaId: null, numero: null, hora: '12:30', cliente: 'Camila Prado', telefone: '83991208844', profissional: 'Paula', servicos: 'Corte', pagamento: 'faltou', depositApplied: 0, total: 140, status: 'Falta' }],
  despesas: [], movimentos: [],
  gaveta: { fundoInicial: 150, entradasDinheiro: 120, suprimentos: 0, sangrias: 50, saidasDinheiro: 40, esperado: 180 },
  ...over,
});

const abrir = () => render(<ToastProvider><FinanceModule reportAccess={acesso} exportAccess={acesso} onUpgrade={vi.fn()} onManageBilling={vi.fn()} /></ToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('Caixa com dado real', () => {
  it('mostra abertura, formas e gaveta reais, sem "(exemplo)"', async () => {
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    abrir();
    expect(await screen.findByText(/por Carla/)).toBeInTheDocument();
    expect(screen.getByText('Sinais Pix')).toBeInTheDocument();
    expect(screen.getByText('Sinais cartão')).toBeInTheDocument();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText('Não compareceu')).toBeInTheDocument();
    expect(screen.queryByText(/exemplo/i)).not.toBeInTheDocument();
  });

  it('sem caixa aberto oferece abrir', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ session: null }));
    vi.mocked(caixa.abrirCaixa).mockResolvedValue(dia());
    abrir();
    await user.type(await screen.findByLabelText('Saldo inicial em dinheiro'), '150');
    await user.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await waitFor(() => expect(caixa.abrirCaixa).toHaveBeenCalledWith(150));
  });

  it('fechamento mostra a diferença e o selo "Bate 100%" quando zera', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    vi.mocked(caixa.fecharCaixa).mockResolvedValue(dia({ session: { ...dia().session!, closedAt: '2026-10-13T22:00:00Z', countedBalance: 180, expectedBalance: 180, difference: 0 } }));
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Fechar caixa' }));
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '175');
    expect(screen.getByText('Diferença: -R$ 5,00')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Valor contado na gaveta'));
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '180');
    await user.click(screen.getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(caixa.fecharCaixa).toHaveBeenCalledWith({ countedBalance: 180, notes: '', date: '2026-10-13' }));
    expect(await screen.findByText('Bate 100%')).toBeInTheDocument();
  });

  it('dia passado já fechado é somente leitura', async () => {
    const fechada = { ...dia().session!, closedAt: '2026-10-12T22:00:00Z', countedBalance: 180, expectedBalance: 180, difference: 0 };
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ date: '2026-10-12', isToday: false, session: fechada }));
    abrir();
    await screen.findByText(/por Carla/);
    expect(screen.queryByRole('button', { name: 'Fechar caixa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir caixa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sangria/i })).not.toBeInTheDocument();
  });

  it('caixa de dia passado esquecido aberto pode ser fechado (com a data daquele dia)', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ date: '2026-10-12', isToday: false }));
    vi.mocked(caixa.fecharCaixa).mockResolvedValue(dia({ date: '2026-10-12', isToday: false }));
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Fechar caixa' }));
    expect(screen.queryByRole('button', { name: /sangria/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '180');
    await user.click(screen.getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(caixa.fecharCaixa).toHaveBeenCalledWith({ countedBalance: 180, notes: '', date: '2026-10-12' }));
  });

  it('caixa de hoje fechado oferece reabrir', async () => {
    const user = userEvent.setup();
    const fechada = { ...dia().session!, closedAt: '2026-10-13T22:00:00Z', countedBalance: 180, expectedBalance: 180, difference: 0 };
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia({ session: fechada }));
    vi.mocked(caixa.reabrirCaixa).mockResolvedValue(dia());
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Reabrir caixa' }));
    await waitFor(() => expect(caixa.reabrirCaixa).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Fechar caixa' })).toBeInTheDocument();
  });

  it('valor contado com milhar no padrão brasileiro: "1.250,00" vira 1250', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    vi.mocked(caixa.fecharCaixa).mockResolvedValue(dia());
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Fechar caixa' }));
    await user.type(screen.getByLabelText('Valor contado na gaveta'), '1.250,00');
    expect(screen.getByText('Diferença: R$ 1.070,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar fechamento' }));
    await waitFor(() => expect(caixa.fecharCaixa).toHaveBeenCalledWith({ countedBalance: 1250, notes: '', date: '2026-10-13' }));
  });

  it('sangria com milhar: "1.250" vira 1250, não 1,25', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    vi.mocked(caixa.registrarMovimento).mockResolvedValue(dia());
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Registrar sangria/suprimento' }));
    await user.type(screen.getByLabelText('Valor'), '1.250');
    await user.type(screen.getByLabelText('Descrição'), 'Cofre');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(caixa.registrarMovimento).toHaveBeenCalledWith({ kind: 'sangria', amount: 1250, description: 'Cofre' }));
  });

  it('registra suprimento pelo modal de movimento', async () => {
    const user = userEvent.setup();
    vi.mocked(caixa.buscarCaixa).mockResolvedValue(dia());
    vi.mocked(caixa.registrarMovimento).mockResolvedValue(dia({ movimentos: [{ id: 'm1', kind: 'suprimento', valor: 20, descricao: 'Troco', criadoEm: '2026-10-13T12:00:00Z' }] }));
    abrir();
    await user.click(await screen.findByRole('button', { name: 'Registrar sangria/suprimento' }));
    await user.click(screen.getByLabelText(/Suprimento/));
    await user.type(screen.getByLabelText('Valor'), '20');
    await user.type(screen.getByLabelText('Descrição'), 'Troco');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(caixa.registrarMovimento).toHaveBeenCalledWith({ kind: 'suprimento', amount: 20, description: 'Troco' }));
    expect(await screen.findByText('Sangrias e suprimentos')).toBeInTheDocument();
  });
});

describe('ExpenseModal', () => {
  it('envia a forma de pagamento escolhida', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseModal isOpen onClose={vi.fn()} onSubmit={onSubmit} editingExpense={null} defaultDate="2026-10-13" />);
    await user.type(screen.getByLabelText('Descrição'), 'Café');
    await user.selectOptions(screen.getByLabelText('Categoria'), screen.getAllByRole('option')[1]);
    await user.type(screen.getByLabelText('Valor (R$)'), '12');
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'pix');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pix', date: '2026-10-13', amount: 12 })));
  });
});
