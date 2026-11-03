import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { ApuracaoComissoes, LinhaComissao } from '@/lib/relatorios';

const api = vi.hoisted(() => ({
  comissoes: vi.fn(), pagar: vi.fn(), desfazerPagamento: vi.fn(), salvarModelo: vi.fn(),
  adiantamentos: vi.fn(), lancarAdiantamento: vi.fn(), excluirAdiantamento: vi.fn(), exportarCsv: vi.fn(),
}));
const pdf = vi.hoisted(() => ({ pdfComissoes: vi.fn(), pdfComprovante: vi.fn() }));
const usuario = vi.hoisted(() => ({ role: 'tenant_admin' }));
const showToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/relatorios', async (orig) => ({ ...(await orig<typeof import('@/lib/relatorios')>()), relatoriosApi: api }));
vi.mock('@/lib/relatoriosPdf', () => pdf);
vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Camila Rocha' }] }) } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: usuario.role, businessName: 'Studio Aurora' } }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));

const { ComissoesModule } = await import('../ComissoesModule');

const linha = (over: Partial<LinhaComissao> = {}): LinhaComissao => ({
  professional: { id: 'p1', nome: 'Camila Rocha', foto: null, ativa: true, cnpj: null, especialidade: 'Nail designer' },
  atendimentos: 64, servicos: 9800, produtos: 650, faturamento: 10450,
  comissaoServico: 4900, comissaoProduto: 130, comissao: 5030, cotaSalao: 5420, gorjetas: 180,
  adiantamentos: 100, adiantamentosAbertos: 100, aPagar: 5110, status: 'pendente', repasse: null, diferencaDesdePagamento: 0,
  ...over,
});

const apuracao = (over: Partial<ApuracaoComissoes> = {}): ApuracaoComissoes => ({
  periodo: { inicio: '2026-10-16', fim: '2026-10-31' },
  modelo: 'comissao', modeloSalvo: 'comissao', salaoParceiroLiberado: false,
  totais: { faturamento: 10450, cotaSalao: 5420, cotaProfissionais: 5030, gorjetas: 180, retencaoMedia: 52, aPagar: 5110 },
  itens: [linha()],
  ...over,
});

const onUpgrade = vi.fn();
const abrir = () => render(<ComissoesModule onUpgrade={onUpgrade} />);

beforeEach(() => {
  // O período inicial é a quinzena de hoje: o relógio fica fixo na quinzena da apuração de exemplo.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00-03:00'));
  vi.clearAllMocks();
  usuario.role = 'tenant_admin';
  api.comissoes.mockResolvedValue(apuracao());
  api.adiantamentos.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Comissões', () => {
  it('mostra totais e a linha da profissional com dado real', async () => {
    abrir();
    expect((await screen.findAllByText('Camila Rocha')).length).toBeGreaterThan(0);
    expect(screen.getByText('Retenção média de 52%')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s*5\.110,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Lei 13\.352/)).not.toBeInTheDocument();
  });

  it('período vazio mostra o aviso real', async () => {
    api.comissoes.mockResolvedValue(apuracao({ itens: [] }));
    abrir();
    expect(await screen.findByText('Nenhuma comanda fechada neste período.')).toBeInTheDocument();
  });

  it('marcar como pago envia profissional, período e forma', async () => {
    api.pagar.mockResolvedValue({ id: 'r1' });
    abrir();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Marcar como pago' }))[0]!);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/R\$\s*5\.110,00/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText('Como você pagou'), { target: { value: 'dinheiro' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(api.pagar).toHaveBeenCalledWith({
      professionalId: 'p1', inicio: '2026-10-16', fim: '2026-10-31', forma: 'dinheiro', observacao: null,
    }));
    expect(showToast).toHaveBeenCalledWith('Repasse marcado como pago.', 'success');
  });

  it('linha paga oferece comprovante e avisa a diferença', async () => {
    api.comissoes.mockResolvedValue(apuracao({
      itens: [linha({ status: 'pago', diferencaDesdePagamento: 40, repasse: { id: 'r1', pagoEm: '2026-11-01T12:00:00Z', forma: 'pix', observacao: null, valorPago: 5110 } })],
    }));
    abrir();
    fireEvent.click((await screen.findAllByRole('button', { name: /Comprovante/ }))[0]!);
    expect(pdf.pdfComprovante).toHaveBeenCalled();
    expect(screen.getAllByText(/Diferença de R\$\s*40,00 desde o pagamento/).length).toBeGreaterThan(0);
  });

  it('funcionária não vê "Marcar como pago" nem "Lançar adiantamento"', async () => {
    usuario.role = 'employee';
    abrir();
    await screen.findAllByText('Camila Rocha');
    expect(screen.queryByRole('button', { name: 'Marcar como pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lançar adiantamento/ })).not.toBeInTheDocument();
  });

  it('no Equipe, salão-parceiro tem cadeado e leva à comparação', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('radio', { name: /Salão-parceiro/ }));
    expect(onUpgrade).toHaveBeenCalledWith('salao_parceiro');
    expect(api.salvarModelo).not.toHaveBeenCalled();
  });

  it('no modo salão-parceiro mostra as cotas, o aviso da lei e "Sem CNPJ"', async () => {
    api.comissoes.mockResolvedValue(apuracao({ modelo: 'salao_parceiro', modeloSalvo: 'salao_parceiro', salaoParceiroLiberado: true }));
    abrir();
    expect(await screen.findByText('Cota-parte do salão')).toBeInTheDocument();
    expect(screen.getByText(/Lei 13\.352\/2016/)).toBeInTheDocument();
    expect(screen.getAllByText('Sem CNPJ: cadastrar').length).toBeGreaterThan(0);
  });

  it('trocar para salão-parceiro no plano Salão salva e recarrega', async () => {
    api.comissoes.mockResolvedValue(apuracao({ salaoParceiroLiberado: true }));
    api.salvarModelo.mockResolvedValue({ modelo: 'salao_parceiro' });
    abrir();
    fireEvent.click(await screen.findByRole('radio', { name: /Salão-parceiro/ }));
    await waitFor(() => expect(api.salvarModelo).toHaveBeenCalledWith('salao_parceiro'));
    await waitFor(() => expect(api.comissoes).toHaveBeenCalledTimes(2));
  });

  it('lançar adiantamento valida valor e envia', async () => {
    api.lancarAdiantamento.mockResolvedValue({ id: 'ad1' });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Lançar adiantamento/ }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Lançar' }));
    expect(await within(dialogo).findByText('Informe um valor maior que zero.')).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText('Valor (R$)'), { target: { value: '150,50' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Lançar' }));
    await waitFor(() => expect(api.lancarAdiantamento).toHaveBeenCalledWith(expect.objectContaining({ professionalId: 'p1', valor: 150.5 })));
  });
});
