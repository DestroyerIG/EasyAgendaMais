import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

const { PainelCobrarPix } = await import('../PainelCobrarPix');

const CODIGO = '00020126360014br.gov.bcb.pix0111839999900005204000053039865405';
const erro409 = (errorCode: string) =>
  new AxiosError('conflito', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { errorCode } } as AxiosResponse);

describe('PainelCobrarPix', () => {
  const gerar = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    gerar.mockResolvedValue({ pixPayload: CODIGO, valor: 80 });
  });

  it('mostra o valor a cobrar e só gera o código quando a pessoa pede', async () => {
    render(<PainelCobrarPix total={80} gerar={gerar} />);
    expect(screen.getByText(/R\$\s*80,00/)).toBeInTheDocument();
    expect(gerar).not.toHaveBeenCalled();
    expect(screen.queryByRole('img', { name: /qr code do pix/i })).not.toBeInTheDocument();
  });

  it('gera o QR Code e o copia-e-cola, e copia o código', async () => {
    const user = userEvent.setup();
    render(<PainelCobrarPix total={80} gerar={gerar} />);
    await user.click(screen.getByRole('button', { name: /gerar qr code/i }));

    expect(await screen.findByRole('img', { name: /qr code do pix/i })).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(gerar).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /copiar código/i }));
    expect(await navigator.clipboard.readText()).toBe(CODIGO);
    expect(await screen.findByText(/código copiado/i)).toBeInTheDocument();
  });

  it('se o valor da comanda muda depois de gerado, esconde o QR velho e pede para gerar de novo', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PainelCobrarPix total={80} gerar={gerar} />);
    await user.click(screen.getByRole('button', { name: /gerar qr code/i }));
    await screen.findByRole('img', { name: /qr code do pix/i });

    rerender(<PainelCobrarPix total={95} gerar={gerar} />);
    await waitFor(() => expect(screen.queryByRole('img', { name: /qr code do pix/i })).not.toBeInTheDocument());
    expect(screen.getByText(/o valor mudou/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar qr code/i })).toBeInTheDocument();
  });

  it('negócio sem chave Pix: explica e manda para Recebimentos', async () => {
    const user = userEvent.setup();
    gerar.mockRejectedValue(erro409('PIX_KEY_MISSING'));
    render(<PainelCobrarPix total={80} gerar={gerar} />);
    await user.click(screen.getByRole('button', { name: /gerar qr code/i }));

    expect(await screen.findByText(/chave pix do negócio/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /recebimentos/i })).toHaveAttribute('href', '/configuracoes/recebimentos');
  });

  it('outro erro: mostra o recado e deixa tentar de novo', async () => {
    const user = userEvent.setup();
    gerar.mockRejectedValueOnce(new Error('falha de rede'));
    render(<PainelCobrarPix total={80} gerar={gerar} />);
    await user.click(screen.getByRole('button', { name: /gerar qr code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível gerar o pix/i);
    await user.click(screen.getByRole('button', { name: /gerar qr code/i }));
    expect(await screen.findByRole('img', { name: /qr code do pix/i })).toBeInTheDocument();
  });
});
