import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import type { EstadoMaquininhas } from '@/lib/recebimentos';

const api = vi.hoisted(() => ({ maquininhas: vi.fn(), ativarPdv: vi.fn(), definirTerminalPadrao: vi.fn() }));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));

const { PointCard } = await import('../PointCard');

const T1 = { id: 'NEWLAND_N950__ABC12345', nome: 'Point final 2345', modo: 'PDV' as const };
const T2 = { id: 'PAX_A910__ZZ99', nome: 'Point final ZZ99', modo: 'STANDALONE' as const };
const estado = (over: Partial<EstadoMaquininhas> = {}): EstadoMaquininhas => ({ padrao: null, terminais: [T1, T2], ...over });

beforeEach(() => {
  vi.clearAllMocks();
  api.maquininhas.mockResolvedValue(estado());
  api.ativarPdv.mockResolvedValue(estado({ terminais: [T1, { ...T2, modo: 'PDV' }] }));
  api.definirTerminalPadrao.mockResolvedValue(estado({ padrao: T1.id }));
});

describe('PointCard', () => {
  it('lista as maquininhas com o modo de cada uma', async () => {
    render(<PointCard />);
    expect(await screen.findByText('Point final 2345')).toBeInTheDocument();
    expect(screen.getByText('Point final ZZ99')).toBeInTheDocument();
    expect(screen.getByText(/pronta para cobrar/i)).toBeInTheDocument();
    expect(screen.getByText(/precisa ativar o modo pdv/i)).toBeInTheDocument();
  });

  it('ativar o modo PDV chama a API e mostra a lista atualizada', async () => {
    const user = userEvent.setup();
    render(<PointCard />);
    await user.click(await screen.findByRole('button', { name: /ativar modo pdv de point final zz99/i }));
    expect(api.ativarPdv).toHaveBeenCalledWith(T2.id);
    expect(await screen.findAllByText(/pronta para cobrar/i)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /ativar modo pdv/i })).not.toBeInTheDocument();
  });

  it('escolher a maquininha chama a API e marca a escolhida; só as que estão em PDV podem ser escolhidas', async () => {
    const user = userEvent.setup();
    render(<PointCard />);
    expect(screen.queryByRole('button', { name: /usar point final zz99/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /usar point final 2345/i }));
    expect(api.definirTerminalPadrao).toHaveBeenCalledWith(T1.id);
    expect(await screen.findByText(/usada nas cobranças/i)).toBeInTheDocument();
  });

  it('"não usar nenhuma" limpa a escolha e relê a lista', async () => {
    api.maquininhas.mockResolvedValueOnce(estado({ padrao: T1.id }));
    api.definirTerminalPadrao.mockResolvedValue({ padrao: null, terminais: [] });
    api.maquininhas.mockResolvedValueOnce(estado());
    const user = userEvent.setup();
    render(<PointCard />);
    await user.click(await screen.findByRole('button', { name: /não usar nenhuma/i }));
    expect(api.definirTerminalPadrao).toHaveBeenCalledWith(null);
    expect(await screen.findByRole('button', { name: /usar point final 2345/i })).toBeInTheDocument();
  });

  it('sem maquininhas na conta: explica o passo a passo e deixa atualizar', async () => {
    api.maquininhas.mockResolvedValueOnce(estado({ terminais: [] }));
    const user = userEvent.setup();
    render(<PointCard />);
    expect(await screen.findByText(/crie uma loja e um caixa no app do mercado pago/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /atualizar/i }));
    expect(api.maquininhas).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Point final 2345')).toBeInTheDocument();
  });

  it('mostra o recado do servidor quando o PDV não pode ser ativado', async () => {
    api.ativarPdv.mockRejectedValueOnce(new AxiosError('conflito', '409', undefined, undefined, {
      status: 409, data: { success: false, error: 'Associe a maquininha a uma loja e a um caixa no app do Mercado Pago' },
    } as AxiosResponse));
    const user = userEvent.setup();
    render(<PointCard />);
    await user.click(await screen.findByRole('button', { name: /ativar modo pdv de point final zz99/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/associe a maquininha a uma loja/i);
  });

  it('falha ao carregar: mostra o aviso e deixa tentar de novo', async () => {
    api.maquininhas.mockRejectedValueOnce(new Error('rede'));
    const user = userEvent.setup();
    render(<PointCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar as maquininhas/i);
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Point final 2345')).toBeInTheDocument();
  });
});
