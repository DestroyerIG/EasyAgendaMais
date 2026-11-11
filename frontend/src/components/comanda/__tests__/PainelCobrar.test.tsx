import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { CobrancaSaldo, EstadoCobranca } from '@/lib/comanda';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

const { PainelCobrar } = await import('../PainelCobrar');

const PIX = '000201MP';
const cobranca = (over: Partial<CobrancaSaldo> = {}): CobrancaSaldo => ({
  id: 'c1', via: 'pix', situacao: 'pendente', valor: 80, codigoPix: PIX,
  venceEm: new Date(Date.now() + 10 * 60_000).toISOString(), pagoEm: null, ...over,
});
const estado = (c: CobrancaSaldo | null, gateway: EstadoCobranca['gateway'] = 'mercadopago'): EstadoCobranca => ({ gateway, cobranca: c });
const erro409 = (errorCode: string) =>
  new AxiosError('conflito', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { errorCode } } as AxiosResponse);

const api = { estado: vi.fn(), cobrar: vi.fn(), cancelar: vi.fn() };
const gerarPixManual = vi.fn();
const onPendente = vi.fn();
const onPaga = vi.fn();

const montar = (forma: 'pix' | 'debito' | 'credito' | 'dinheiro' | null = 'pix', total = 80) =>
  render(<PainelCobrar forma={forma} total={total} gerarPixManual={gerarPixManual} api={api} onPendente={onPendente} onPaga={onPaga} />);

beforeEach(() => {
  vi.clearAllMocks();
  api.estado.mockResolvedValue(estado(null));
  api.cobrar.mockResolvedValue(cobranca());
  api.cancelar.mockResolvedValue(estado(cobranca({ situacao: 'cancelada' })));
  gerarPixManual.mockResolvedValue({ pixPayload: '000201MANUAL', valor: 80 });
});
afterEach(() => { vi.useRealTimers(); });

describe('PainelCobrar: Pix com Mercado Pago', () => {
  it('gera o Pix do gateway, mostra QR e copia-e-cola, e avisa que há cobrança pendente', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: /^gerar pix$/i }));

    expect(api.cobrar).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('img', { name: /qr code do pix/i })).toBeInTheDocument();
    expect(screen.getByText(PIX)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar cobrança/i })).toBeInTheDocument();
    expect(onPendente).toHaveBeenLastCalledWith(true);
  });

  it('enquanto aguarda, consulta a cada 3 s e, ao pagar, avisa uma vez e libera a comanda', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    api.estado.mockResolvedValue(estado(cobranca()));
    montar();
    await screen.findByRole('button', { name: /cancelar cobrança/i });

    api.estado.mockResolvedValue(estado(cobranca({ situacao: 'paga', pagoEm: new Date().toISOString() })));
    await act(async () => { vi.advanceTimersByTime(3000); });

    await waitFor(() => expect(onPaga).toHaveBeenCalledTimes(1));
    expect(onPendente).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/pagamento recebido/i)).toBeInTheDocument();
  });

  it('cobrança vencida ou recusada: explica e oferece tentar de novo', async () => {
    api.estado.mockResolvedValue(estado(cobranca({ situacao: 'expirada' })));
    const { unmount } = montar();
    expect(await screen.findByText(/pix venceu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    unmount();

    api.estado.mockResolvedValue(estado(cobranca({ situacao: 'recusada' })));
    montar();
    expect(await screen.findByText(/recusado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('cancelar a cobrança destrava a comanda e volta a oferecer o Pix', async () => {
    api.estado.mockResolvedValue(estado(cobranca()));
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: /cancelar cobrança/i }));

    expect(api.cancelar).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /^gerar pix$/i })).toBeInTheDocument();
    expect(onPendente).toHaveBeenLastCalledWith(false);
  });

  it('"usar minha chave Pix" troca para o Pix manual do negócio', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: /usar minha chave pix/i }));
    expect(await screen.findByRole('button', { name: /gerar qr code/i })).toBeInTheDocument();
  });

  it('comanda travada (409 COBRANCA_EM_ANDAMENTO): pede para cancelar a cobrança', async () => {
    api.cobrar.mockRejectedValue(erro409('COBRANCA_EM_ANDAMENTO'));
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: /^gerar pix$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancele a cobrança para alterar/i);
  });

  it('outro erro ao gerar: recado e deixa tentar de novo', async () => {
    api.cobrar.mockRejectedValueOnce(new Error('rede'));
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: /^gerar pix$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível gerar o pix/i);
    await user.click(screen.getByRole('button', { name: /^gerar pix$/i }));
    expect(await screen.findByRole('img', { name: /qr code do pix/i })).toBeInTheDocument();
  });
});

describe('PainelCobrar: sem gateway, maquininha e outras formas', () => {
  it('sem Mercado Pago conectado, o Pix é o manual na chave do negócio', async () => {
    api.estado.mockResolvedValue(estado(null, null));
    montar();
    expect(await screen.findByRole('button', { name: /gerar qr code/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^gerar pix$/i })).not.toBeInTheDocument();
  });

  it('se o estado não carrega, cai no Pix manual em vez de travar a cobrança', async () => {
    api.estado.mockRejectedValue(new Error('rede'));
    montar();
    expect(await screen.findByRole('button', { name: /gerar qr code/i })).toBeInTheDocument();
  });

  it('débito e crédito mostram o guia da maquininha com o valor e o botão de copiar', async () => {
    const user = userEvent.setup();
    montar('debito');
    expect(screen.getByText(/digite na maquininha/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*80,00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /copiar valor/i }));
    expect(await navigator.clipboard.readText()).toBe('80,00');
    expect(api.estado).not.toHaveBeenCalled();
  });

  it('dinheiro ou sem forma: nada a mostrar', () => {
    const { container, rerender } = montar('dinheiro');
    expect(container).toBeEmptyDOMElement();
    rerender(<PainelCobrar forma={null} total={80} gerarPixManual={gerarPixManual} api={api} onPendente={onPendente} onPaga={onPaga} />);
    expect(container).toBeEmptyDOMElement();
  });
});
