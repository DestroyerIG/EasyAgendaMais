import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { ToastProvider } from '@/components/Toast';
import { CrmSettingsSection } from '@/components/settings/CrmSettingsSection';
import { EtiquetasSection } from '@/components/settings/EtiquetasSection';
import * as crm from '@/lib/crm';
import * as tags from '@/lib/tags';

vi.mock('@/lib/crm', async (orig) => ({
  ...(await orig<typeof import('@/lib/crm')>()),
  buscarCrmSettings: vi.fn(),
  salvarCrmSettings: vi.fn(),
}));
vi.mock('@/lib/tags', async (orig) => ({
  ...(await orig<typeof import('@/lib/tags')>()),
  listarEtiquetas: vi.fn(),
  criarEtiqueta: vi.fn(),
  atualizarEtiqueta: vi.fn(),
  removerEtiqueta: vi.fn(),
}));

const erro = (status: number, mensagem: string) =>
  new AxiosError('x', String(status), undefined, undefined, { status, data: { success: false, error: mensagem } } as AxiosResponse);

describe('CrmSettingsSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('salva o segmento e a meta digitada no formato brasileiro', async () => {
    const user = userEvent.setup();
    vi.mocked(crm.buscarCrmSettings).mockResolvedValue({ segment: 'unhas', dailyRevenueGoal: null });
    vi.mocked(crm.salvarCrmSettings).mockResolvedValue({ segment: 'cabelo', dailyRevenueGoal: 1800 });
    render(<ToastProvider><CrmSettingsSection /></ToastProvider>);

    const segmento = await screen.findByLabelText('Segmento do negócio');
    expect(segmento).toHaveValue('unhas');
    expect(screen.getByText('Define os campos sugeridos da ficha técnica')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cílios e sobrancelhas' })).toBeInTheDocument();
    await user.selectOptions(segmento, 'cabelo');
    await user.type(screen.getByLabelText('Meta de faturamento diária'), '1.800');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(crm.salvarCrmSettings).toHaveBeenCalledWith({ segment: 'cabelo', dailyRevenueGoal: 1800 }));
  });

  it('meta vazia remove a meta', async () => {
    const user = userEvent.setup();
    vi.mocked(crm.buscarCrmSettings).mockResolvedValue({ segment: 'barbearia', dailyRevenueGoal: 1500 });
    vi.mocked(crm.salvarCrmSettings).mockResolvedValue({ segment: 'barbearia', dailyRevenueGoal: null });
    render(<ToastProvider><CrmSettingsSection /></ToastProvider>);

    const meta = await screen.findByLabelText('Meta de faturamento diária');
    expect(meta).toHaveValue('1.500,00');
    await user.clear(meta);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(crm.salvarCrmSettings).toHaveBeenCalledWith({ segment: 'barbearia', dailyRevenueGoal: null }));
  });

  it('se a carga falhar, não mostra os campos, não deixa salvar e permite tentar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(crm.buscarCrmSettings)
      .mockRejectedValueOnce(erro(500, 'Servidor indisponível'))
      .mockResolvedValueOnce({ segment: 'cabelo', dailyRevenueGoal: 900 });
    render(<ToastProvider><CrmSettingsSection /></ToastProvider>);

    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
    expect(screen.queryByLabelText('Segmento do negócio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Segmento do negócio')).toHaveValue('cabelo');
    expect(screen.getByLabelText('Meta de faturamento diária')).toHaveValue('900,00');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(crm.salvarCrmSettings).not.toHaveBeenCalled();
  });

  it('meta inválida não salva e avisa', async () => {
    const user = userEvent.setup();
    vi.mocked(crm.buscarCrmSettings).mockResolvedValue({ segment: 'unhas', dailyRevenueGoal: null });
    render(<ToastProvider><CrmSettingsSection /></ToastProvider>);

    await user.type(await screen.findByLabelText('Meta de faturamento diária'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe a meta em reais, por exemplo 1.800,00.')).toBeInTheDocument();
    expect(crm.salvarCrmSettings).not.toHaveBeenCalled();
  });
});

describe('EtiquetasSection', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('lista as etiquetas com a contagem de clientes', async () => {
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([
      { id: 't1', name: 'Noiva', color: 'brand', clientes: 3 },
      { id: 't2', name: 'Alérgica', color: 'danger', clientes: 1 },
    ]);
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    const noiva = await screen.findByRole('listitem', { name: 'Noiva' });
    expect(within(noiva).getByText('3 clientes')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Alérgica' })).getByText('1 cliente')).toBeInTheDocument();
  });

  it('cria uma etiqueta com a cor escolhida', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([]);
    vi.mocked(tags.criarEtiqueta).mockResolvedValue({ id: 't3', name: 'Madrinha', color: 'success' });
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    await user.type(await screen.findByLabelText('Nova etiqueta'), 'Madrinha');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Cor da nova etiqueta' })).getByRole('radio', { name: 'Verde' }));
    await user.click(screen.getByRole('button', { name: 'Criar etiqueta' }));

    await waitFor(() => expect(tags.criarEtiqueta).toHaveBeenCalledWith({ name: 'Madrinha', color: 'success' }));
  });

  it('nome repetido (409) mostra o aviso', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([{ id: 't1', name: 'Noiva', color: 'brand', clientes: 3 }]);
    vi.mocked(tags.criarEtiqueta).mockRejectedValue(erro(409, 'Conflict'));
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    await user.type(await screen.findByLabelText('Nova etiqueta'), 'Noiva');
    await user.click(screen.getByRole('button', { name: 'Criar etiqueta' }));

    expect(await screen.findByText('Já existe uma etiqueta com esse nome')).toBeInTheDocument();
  });

  it('renomeia e muda a cor', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([{ id: 't1', name: 'Noiva', color: 'brand', clientes: 3 }]);
    vi.mocked(tags.atualizarEtiqueta).mockResolvedValue({ id: 't1', name: 'Noivas', color: 'warning' });
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    await user.click(await screen.findByRole('button', { name: 'Editar Noiva' }));
    const nome = screen.getByLabelText('Nome da etiqueta');
    await user.clear(nome);
    await user.type(nome, 'Noivas');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Cor da etiqueta' })).getByRole('radio', { name: 'Amarelo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar etiqueta' }));

    await waitFor(() => expect(tags.atualizarEtiqueta).toHaveBeenCalledWith('t1', { name: 'Noivas', color: 'warning' }));
  });

  it('erro ao carregar não vira "nenhuma etiqueta" e permite tentar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas)
      .mockRejectedValueOnce(erro(500, 'Servidor indisponível'))
      .mockResolvedValueOnce([{ id: 't1', name: 'Noiva', color: 'brand', clientes: 3 }]);
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma etiqueta criada ainda.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('listitem', { name: 'Noiva' })).toBeInTheDocument();
  });

  it('o botão de apagar fica desligado enquanto a etiqueta é apagada', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([{ id: 't1', name: 'Noiva', color: 'brand', clientes: 3 }]);
    let concluir: () => void = () => {};
    vi.mocked(tags.removerEtiqueta).mockReturnValue(new Promise<void>((r) => { concluir = r; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    const apagar = await screen.findByRole('button', { name: 'Apagar Noiva' });
    await user.click(apagar);
    expect(apagar).toBeDisabled();
    concluir();
    await waitFor(() => expect(apagar).toBeEnabled());
    expect(tags.removerEtiqueta).toHaveBeenCalledTimes(1);
  });

  it('apaga só depois de confirmar', async () => {
    const user = userEvent.setup();
    vi.mocked(tags.listarEtiquetas).mockResolvedValue([{ id: 't1', name: 'Noiva', color: 'brand', clientes: 3 }]);
    vi.mocked(tags.removerEtiqueta).mockResolvedValue();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ToastProvider><EtiquetasSection /></ToastProvider>);

    const apagar = await screen.findByRole('button', { name: 'Apagar Noiva' });
    await user.click(apagar);
    expect(confirmar).toHaveBeenCalledWith('Remover a etiqueta de todas as clientes?');
    expect(tags.removerEtiqueta).not.toHaveBeenCalled();
    await user.click(apagar);
    await waitFor(() => expect(tags.removerEtiqueta).toHaveBeenCalledWith('t1'));
  });
});
