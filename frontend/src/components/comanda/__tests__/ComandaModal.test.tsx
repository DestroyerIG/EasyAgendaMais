import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { ToastProvider } from '@/components/Toast';
import { ComandaModal } from '../ComandaModal';
import * as comanda from '@/lib/comanda';
import * as caixa from '@/lib/caixa';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [
  { id: 's1', name: 'Manutenção Fibra de Vidro', price: 110, duration_minutes: 90, active: true },
  { id: 's9', name: 'Remoção Express', price: 30, duration_minutes: 20, active: true },
] }) } }));
vi.mock('@/lib/produtos', () => ({ listarProdutos: vi.fn().mockResolvedValue([
  { id: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', description: 'Produto Home Care', price: 25, active: true },
]) }));
vi.mock('@/lib/caixa', async (orig) => ({ ...(await orig<typeof import('@/lib/caixa')>()), abrirCaixa: vi.fn() }));
vi.mock('@/lib/comanda', async (orig) => ({
  ...(await orig<typeof import('@/lib/comanda')>()),
  abrirComanda: vi.fn(), salvarComanda: vi.fn(), fecharComanda: vi.fn(), buscarAtalhos: vi.fn(),
}));

const dto = (over: Partial<comanda.ComandaDetail> = {}): comanda.ComandaDetail => ({
  id: 'k1', number: 1042, status: 'rascunho',
  appointment: { id: 'a1', date: '2026-10-13', time: '10:00', status: 'em_atendimento', source: 'publico' },
  client: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
  professional: { id: 'p1', name: 'Camila Rocha' },
  items: [{ id: 'i1', kind: 'servico', refId: 's1', name: 'Manutenção Fibra de Vidro', unitPrice: 110, quantity: 1, durationMinutes: 90, isMain: true }],
  depositAvailable: 30, discount: 0, tip: 0, paymentMethod: null,
  commission: { servicePct: 50, productPct: 20, origem: 'negocio' },
  calc: comanda.calcularComanda({ items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }], depositAvailable: 30, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 }),
  whatsappConnected: true, closedAt: null, receiptSentAt: null,
  ...over,
});

const abrir = () => {
  const onAtualizada = vi.fn();
  const onClose = vi.fn();
  render(<ToastProvider><ComandaModal appointmentId="a1" onClose={onClose} onAtualizada={onAtualizada} /></ToastProvider>);
  return { onAtualizada, onClose };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(comanda.abrirComanda).mockResolvedValue(dto());
  vi.mocked(comanda.buscarAtalhos).mockResolvedValue([{ kind: 'servico', id: 's9', name: 'Remoção Express', price: 30 }]);
});

describe('ComandaModal', () => {
  it('mostra a comanda com sinal descontado e total a cobrar', async () => {
    abrir();
    expect(await screen.findByText('Comanda #1042')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Sinal já pago via Pix')).toBeInTheDocument();
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 80,00');
    expect(screen.queryByText(/mesa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/clube/i)).not.toBeInTheDocument();
  });

  it('adicionar produto pela busca e aumentar a quantidade recalcula total e repasse', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.type(screen.getByPlaceholderText('Buscar serviço ou produto'), 'oleo');
    await user.click(screen.getByRole('button', { name: /Óleo Hidratante de Cutícula 10ml/ }));
    await user.click(screen.getByRole('button', { name: 'Aumentar quantidade de Óleo Hidratante de Cutícula 10ml' }));
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 130,00');
    expect(screen.getByText('Produto (20% de R$ 50,00)')).toBeInTheDocument();
  });

  it('atalho adiciona o item', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(await screen.findByRole('button', { name: /Remoção Express \(R\$ 30\)/ }));
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 110,00');
  });

  it('desconto em percentual', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.click(screen.getByRole('button', { name: 'Adicionar desconto' }));
    await user.click(screen.getByRole('button', { name: 'Desconto em percentual' }));
    await user.type(screen.getByLabelText('Valor do desconto'), '10');
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 69,00');
  });

  it('gorjeta "Outro"', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByText('Comanda #1042');
    await user.click(screen.getByRole('button', { name: 'Outro' }));
    await user.type(screen.getByLabelText('Valor da gorjeta'), '7');
    expect(screen.getByTestId('total-a-cobrar')).toHaveTextContent('R$ 87,00');
    expect(screen.getByText('Gorjeta integral')).toBeInTheDocument();
  });

  it('sem WhatsApp conectado o botão não promete envio', async () => {
    vi.mocked(comanda.abrirComanda).mockResolvedValue(dto({ whatsappConnected: false }));
    abrir();
    expect(await screen.findByRole('button', { name: /Fechar comanda \(R\$ 80,00\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/enviar WhatsApp/i)).not.toBeInTheDocument();
  });

  it('não fecha sem forma de pagamento quando há valor a cobrar', async () => {
    abrir();
    expect(await screen.findByRole('button', { name: /Fechar comanda e enviar WhatsApp/ })).toBeDisabled();
  });

  it('caixa fechado: abre o caixa ali mesmo e conclui o fechamento', async () => {
    const user = userEvent.setup();
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_CLOSED' } } as AxiosResponse);
    vi.mocked(comanda.fecharComanda).mockRejectedValueOnce(erro).mockResolvedValueOnce(dto({ status: 'fechada', receiptSentAt: '2026-10-13T13:00:00Z' }));
    vi.mocked(caixa.abrirCaixa).mockResolvedValue({} as caixa.CashDay);
    const { onAtualizada, onClose } = abrir();
    await screen.findByText('Comanda #1042');
    await user.click(within(screen.getByRole('radiogroup')).getByLabelText(/Pix/));
    await user.click(screen.getByRole('button', { name: /Fechar comanda e enviar WhatsApp/ }));
    expect(await screen.findByText('O caixa de hoje ainda não foi aberto')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Saldo inicial em dinheiro'), '150');
    await user.click(screen.getByRole('button', { name: 'Abrir caixa e fechar comanda' }));
    await waitFor(() => expect(caixa.abrirCaixa).toHaveBeenCalledWith(150));
    await waitFor(() => expect(comanda.fecharComanda).toHaveBeenCalledTimes(2));
    expect(onAtualizada).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('salvar rascunho envia extras, desconto, gorjeta e forma', async () => {
    const user = userEvent.setup();
    vi.mocked(comanda.salvarComanda).mockResolvedValue(dto());
    abrir();
    await user.click(await screen.findByRole('button', { name: /Remoção Express \(R\$ 30\)/ }));
    await user.click(screen.getByRole('button', { name: 'R$ 10' }));
    await user.click(screen.getByRole('button', { name: 'Salvar como rascunho' }));
    await waitFor(() => expect(comanda.salvarComanda).toHaveBeenCalledWith('k1', {
      extras: [{ kind: 'servico', id: 's9', quantity: 1 }], discount: 0, tip: 10, paymentMethod: null,
    }));
  });
});
