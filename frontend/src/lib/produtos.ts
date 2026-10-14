import api from '@/lib/api';

export interface Produto { id: string; name: string; description: string | null; price: number; active: boolean }
export interface ProdutoInput { name: string; description?: string | null; price: number }

export const listarProdutos = async () => (await api.get<Produto[]>('/products')).data;
export const criarProduto = async (p: ProdutoInput) => (await api.post<Produto>('/products', p)).data;
export const atualizarProduto = async (id: string, p: Partial<ProdutoInput>) => (await api.put<Produto>(`/products/${id}`, p)).data;
export const removerProduto = async (id: string) => { await api.delete(`/products/${id}`); };
