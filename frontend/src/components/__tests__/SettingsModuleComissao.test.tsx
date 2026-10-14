import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ComissaoPadraoSection } from '@/components/settings/ComissaoPadraoSection';
import * as comanda from '@/lib/comanda';

vi.mock('@/lib/comanda', async (orig) => ({ ...(await orig<typeof import('@/lib/comanda')>()), buscarRegraComissao: vi.fn(), salvarRegraComissao: vi.fn() }));

it('carrega e salva a comissão padrão', async () => {
  const user = userEvent.setup();
  vi.mocked(comanda.buscarRegraComissao).mockResolvedValue({ serviceCommissionPct: 0, productCommissionPct: 0 });
  vi.mocked(comanda.salvarRegraComissao).mockResolvedValue({ serviceCommissionPct: 50, productCommissionPct: 20 });
  render(<ToastProvider><ComissaoPadraoSection /></ToastProvider>);
  const serv = await screen.findByLabelText('% sobre serviços');
  await user.clear(serv); await user.type(serv, '50');
  const prod = screen.getByLabelText('% sobre produtos');
  await user.clear(prod); await user.type(prod, '20');
  await user.click(screen.getByRole('button', { name: 'Salvar comissão' }));
  await waitFor(() => expect(comanda.salvarRegraComissao).toHaveBeenCalledWith({ serviceCommissionPct: 50, productCommissionPct: 20 }));
});
