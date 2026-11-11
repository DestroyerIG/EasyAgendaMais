import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { CobrancaSaldo, EstadoCobranca } from '@/lib/comanda';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

const { PainelCobrar } = await import('../PainelCobrar');

const PIX = '000201MP';
const TERMINAL = { id: 'NEWLAND_N950__ABC12345', nome: 'Point final 2345' };
const cobranca = (over: Partial<CobrancaSaldo> = {}): CobrancaSaldo => ({
  id: 'c1', via: 'pix', situacao: 'pendente', valor: 80, codigoPix: PIX,
  venceEm: new Date(Date.now() + 10 * 60_000).toISOString(), pagoEm: null, ...over,
});
const naMaquininha = (over: Partial<CobrancaSaldo> = {}) => cobranca({ via: 'maquininha', codigoPix: null, ...over });
const estado = (
  c: CobrancaSaldo | null, gateway: EstadoCobranca['gateway'] = 'mercadopago', terminal: EstadoCobranca['terminal'] = null, aviso = false,
): EstadoCobranca => ({ gateway, cobranca: c, terminal, avisoMaquininha: aviso });
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

    expect(api.cobrar).toHaveBeenCalledWith({ via: 'pix' });
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

  it('cobrança da maquininha vencida não vira aviso no painel do Pix', async () => {
    api.estado.mockResolvedValue(estado(naMaquininha({ situacao: 'expirada' }), 'mercadopago', TERMINAL));
    montar('pix');
    expect(await screen.findByRole('button', { name: /^gerar pix$/i })).toBeInTheDocument();
    expect(screen.queryByText(/pix venceu/i)).not.toBeInTheDocument();
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

describe('PainelCobrar: sem gateway e outras formas', () => {
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

  it('débito sem maquininha configurada mostra o guia com o valor e o botão de copiar', async () => {
    api.estado.mockResolvedValue(estado(null, null));
    const user = userEvent.setup();
    montar('debito');
    expect(await screen.findByText(/digite na maquininha/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*80,00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /copiar valor/i }));
    expect(await navigator.clipboard.readText()).toBe('80,00');
  });

  it('dinheiro ou sem forma: nada a mostrar', () => {
    const { container, rerender } = montar('dinheiro');
    expect(container).toBeEmptyDOMElement();
    rerender(<PainelCobrar forma={null} total={80} gerarPixManual={gerarPixManual} api={api} onPendente={onPendente} onPaga={onPaga} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.estado).not.toHaveBeenCalled();
  });
});

describe('PainelCobrar: maquininha Point', () => {
  beforeEach(() => {
    api.estado.mockResolvedValue(estado(null, 'mercadopago', TERMINAL));
    api.cobrar.mockResolvedValue(naMaquininha());
    api.cancelar.mockResolvedValue(estado(naMaquininha({ situacao: 'cancelada' }), 'mercadopago', TERMINAL));
  });

  it('débito: oferece a maquininha escolhida, envia a cobrança e espera o cartão (sem QR)', async () => {
    const user = userEvent.setup();
    montar('debito');
    expect(await screen.findByText(/point final 2345/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enviar para a maquininha/i }));

    expect(api.cobrar).toHaveBeenCalledWith({ via: 'maquininha', forma: 'debito' });
    expect(await screen.findByText(/aguardando o cliente passar o cartão/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar cobrança/i })).toBeInTheDocument();
    expect(onPendente).toHaveBeenLastCalledWith(true);
  });

  it('crédito manda a forma crédito', async () => {
    const user = userEvent.setup();
    montar('credito');
    await user.click(await screen.findByRole('button', { name: /enviar para a maquininha/i }));
    expect(api.cobrar).toHaveBeenCalledWith({ via: 'maquininha', forma: 'credito' });
  });

  it('ao pagar na maquininha, avisa uma vez e libera a comanda', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    api.estado.mockResolvedValue(estado(naMaquininha(), 'mercadopago', TERMINAL));
    montar('debito');
    await screen.findByRole('button', { name: /cancelar cobrança/i });

    api.estado.mockResolvedValue(estado(naMaquininha({ situacao: 'paga', pagoEm: new Date().toISOString() }), 'mercadopago', TERMINAL));
    await act(async () => { vi.advanceTimersByTime(3000); });

    await waitFor(() => expect(onPaga).toHaveBeenCalledTimes(1));
    expect(onPendente).toHaveBeenLastCalledWith(false);
  });

  it('cancelar uma ordem que a maquininha não deixa cancelar pela API pede para cancelar lá também', async () => {
    api.estado.mockResolvedValue(estado(naMaquininha(), 'mercadopago', TERMINAL));
    api.cancelar.mockResolvedValue(estado(naMaquininha({ situacao: 'cancelada' }), 'mercadopago', TERMINAL, true));
    const user = userEvent.setup();
    montar('debito');
    await user.click(await screen.findByRole('button', { name: /cancelar cobrança/i }));
    expect(await screen.findByText(/cancele também na maquininha/i)).toBeInTheDocument();
    expect(onPendente).toHaveBeenLastCalledWith(false);
  });

  it('maquininha ocupada (409 MAQUININHA_OCUPADA): explica que já há cobrança aguardando', async () => {
    api.cobrar.mockRejectedValue(erro409('MAQUININHA_OCUPADA'));
    const user = userEvent.setup();
    montar('debito');
    await user.click(await screen.findByRole('button', { name: /enviar para a maquininha/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/já tem uma cobrança aguardando/i);
  });

  it('cobrança vencida ou recusada na maquininha: explica e oferece tentar de novo', async () => {
    api.estado.mockResolvedValue(estado(naMaquininha({ situacao: 'recusada' }), 'mercadopago', TERMINAL));
    montar('debito');
    expect(await screen.findByText(/recusado na maquininha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('Mercado Pago sem maquininha escolhida: cai no guia manual', async () => {
    api.estado.mockResolvedValue(estado(null, 'mercadopago', null));
    montar('debito');
    expect(await screen.findByText(/digite na maquininha/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar para a maquininha/i })).not.toBeInTheDocument();
  });

  it('"digitar manualmente" mostra o guia mesmo com a maquininha escolhida', async () => {
    const user = userEvent.setup();
    montar('credito');
    await user.click(await screen.findByRole('button', { name: /digitar manualmente/i }));
    expect(screen.getByText(/digite na maquininha/i)).toBeInTheDocument();
  });
});
