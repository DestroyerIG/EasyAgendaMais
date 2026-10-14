import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ProdutosTab } from '../ProdutosTab';
import * as produtos from '@/lib/produtos';

vi.mock('@/lib/produtos', () => ({ listarProdutos: vi.fn(), criarProduto: vi.fn(), atualizarProduto: vi.fn(), removerProduto: vi.fn() }));
const renderTab = () => render(<ToastProvider><ProdutosTab /></ToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('ProdutosTab', () => {
  it('estado vazio explica para que serve', async () => {
    vi.mocked(produtos.listarProdutos).mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText('Nenhum produto cadastrado')).toBeInTheDocument();
  });

  it('cria produto com preço em número', async () => {
    const user = userEvent.setup();
    vi.mocked(produtos.listarProdutos).mockResolvedValue([]);
    vi.mocked(produtos.criarProduto).mockResolvedValue({ id: 'pr1', name: 'Óleo', description: null, price: 25, active: true });
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Novo produto' }));
    await user.type(screen.getByLabelText('Nome'), 'Óleo');
    await user.type(screen.getByLabelText('Preço'), '25');
    await user.click(screen.getByRole('button', { name: 'Salvar produto' }));
    await waitFor(() => expect(produtos.criarProduto).toHaveBeenCalledWith({ name: 'Óleo', description: null, price: 25 }));
  });
});
