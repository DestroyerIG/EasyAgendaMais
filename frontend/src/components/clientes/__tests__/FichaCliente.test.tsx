import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClientProfileDto, TimelineEvento } from '@/lib/crm';
import { SEGMENTOS } from '@/lib/technicalSheetTemplates';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const mockBuscarPerfil = vi.hoisted(() => vi.fn());
const mockBuscarTimeline = vi.hoisted(() => vi.fn());
const mockSalvarFicha = vi.hoisted(() => vi.fn());
const mockRegistrarConsentimento = vi.hoisted(() => vi.fn());
vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  buscarPerfil: (...a: unknown[]) => mockBuscarPerfil(...a),
  buscarTimeline: (...a: unknown[]) => mockBuscarTimeline(...a),
  salvarFichaTecnica: (...a: unknown[]) => mockSalvarFicha(...a),
  registrarConsentimento: (...a: unknown[]) => mockRegistrarConsentimento(...a),
}));

const mockListarFotos = vi.hoisted(() => vi.fn());
const mockEnviarFoto = vi.hoisted(() => vi.fn());
vi.mock('@/lib/clientPhotos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clientPhotos')>()),
  listarFotos: (...a: unknown[]) => mockListarFotos(...a),
  enviarFoto: (...a: unknown[]) => mockEnviarFoto(...a),
  removerFoto: vi.fn().mockResolvedValue(undefined),
}));

const mockDefinirEtiquetas = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tags')>()),
  listarEtiquetas: vi.fn().mockResolvedValue([{ id: 't1', name: 'Pé e mão', color: 'brand', clientes: 3 }]),
  definirEtiquetasCliente: (...a: unknown[]) => mockDefinirEtiquetas(...a),
}));

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockShowToast = vi.hoisted(() => vi.fn());
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const { FichaCliente } = await import('../FichaCliente');

const ANO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date());

const perfil = (partes: Partial<ClientProfileDto> = {}): ClientProfileDto => ({
  cliente: {
    id: 'c1', name: 'Mariana Souza', phone: '83998765432', email: null, birthDate: null, notes: null,
    createdAt: '2026-01-10T13:00:00.000Z', avatarUrl: null,
  },
  fase: 'fiel',
  etiquetas: [{ id: 't1', name: 'Pé e mão', color: 'brand' }],
  etiquetasAuto: ['Aniversário em 3 dias'],
  indicadores: {
    cicloMedio: 21, ticketMedio: 130, visitasNoAno: 14, faltasECancelamentos: 2,
    ultimaVisita: null, retornoPrevisto: { data: null, venceuHa: null, texto: '—' },
  },
  consentimento: { estado: 'consentido', desde: '2026-03-12T15:00:00.000Z', canal: 'publico' },
  fichaTecnica: {
    allergies: 'Sensível a primer ácido', fields: { formato: 'Amendoado', antigo: 'campo velho' }, customFields: [],
    updatedAt: '2026-09-01T18:30:00.000Z', updatedBy: 'Camila Rocha', segmento: 'unhas', campos: SEGMENTOS.unhas.campos,
  },
  ...partes,
});

const eventos: TimelineEvento[] = [
  { tipo: 'concluido', data: '2026-09-12T13:00:00.000Z', titulo: 'Manutenção em gel', descricao: 'Com Camila', valor: 130 },
  { tipo: 'avaliacao', data: '2026-09-13T13:00:00.000Z', titulo: 'Avaliação recebida', descricao: null, valor: null, nota: 4 },
];

const renderizar = () => render(<FichaCliente clienteId="c1" nomeNegocio="Studio Aurora" />);

describe('FichaCliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuscarPerfil.mockResolvedValue(perfil());
    mockBuscarTimeline.mockResolvedValue(eventos);
    mockListarFotos.mockResolvedValue([]);
    mockSalvarFicha.mockImplementation(async (_id: string, f: unknown) => ({ ...perfil().fichaTecnica, ...(f as object) }));
    mockRegistrarConsentimento.mockResolvedValue({ estado: 'consentido', desde: '2026-10-15T12:00:00.000Z', canal: 'painel' });
    mockDefinirEtiquetas.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra cabeçalho com breadcrumb, fase e etiquetas', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { level: 1, name: 'Mariana Souza' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/clientes');
    expect(screen.getByText('Fiel / VIP')).toBeInTheDocument();
    expect(screen.getByText('Pé e mão')).toBeInTheDocument();
    expect(screen.getByText('Aniversário em 3 dias')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Novo agendamento/ })).toHaveAttribute('href', '/agendamentos?novo=1&cliente=c1');
  });

  it('mostra os indicadores reais', async () => {
    renderizar();
    const ciclo = await screen.findByTestId('indicador-ciclo');
    expect(ciclo).toHaveTextContent('Ciclo médio de retorno');
    expect(ciclo).toHaveTextContent('21 dias');
    expect(screen.getByTestId('indicador-ticket')).toHaveTextContent(/R\$\s130,00/);
    expect(screen.getByTestId('indicador-frequencia')).toHaveTextContent(`14 visitas em ${ANO}`);
    expect(screen.getByTestId('indicador-faltas')).toHaveTextContent('Faltas / cancelamentos');
    expect(screen.getByTestId('indicador-faltas')).toHaveTextContent('2');
  });

  it('mostra "—" quando não há ciclo nem ticket', async () => {
    const p = perfil();
    mockBuscarPerfil.mockResolvedValue({ ...p, indicadores: { ...p.indicadores, cicloMedio: null, ticketMedio: null } });
    renderizar();
    expect(await screen.findByTestId('indicador-ciclo')).toHaveTextContent('—');
    expect(screen.getByTestId('indicador-ticket')).toHaveTextContent('—');
  });

  it('consentimento ativo mostra data, canal e "Revogar"', async () => {
    renderizar();
    expect(await screen.findByText('Consentimento ativo para WhatsApp e lembretes')).toBeInTheDocument();
    expect(screen.getByText('Autorizado em 12/03/2026 · Página pública')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revogar' })).toBeInTheDocument();
  });

  it('consentimento revogado oferece "Registrar novo consentimento"', async () => {
    mockBuscarPerfil.mockResolvedValue(perfil({ consentimento: { estado: 'revogado', desde: '2026-05-02T15:00:00.000Z', canal: 'painel' } }));
    renderizar();
    expect(await screen.findByText('Consentimento revogado em 02/05/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar novo consentimento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revogar' })).not.toBeInTheDocument();
  });

  it('consentimento não informado registra pela API depois da confirmação', async () => {
    mockBuscarPerfil.mockResolvedValue(perfil({ consentimento: { estado: 'nao_informado', desde: null, canal: null } }));
    renderizar();
    expect(await screen.findByText('Consentimento não informado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar consentimento' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('A cliente autorizou receber mensagens e lembretes pelo WhatsApp?')).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sim, autorizou' }));
    await waitFor(() => expect(mockRegistrarConsentimento).toHaveBeenCalledWith('c1', true));
    expect(await screen.findByText('Consentimento ativo para WhatsApp e lembretes')).toBeInTheDocument();
  });

  it('ficha técnica de unhas: "Formato preferido" é select e salva só as chaves do modelo', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Ficha técnica — Unhas' })).toBeInTheDocument();
    expect(await screen.findByText('Sensível a primer ácido')).toBeInTheDocument();
    const formato = screen.getByLabelText('Formato preferido');
    expect(formato.tagName).toBe('SELECT');
    expect(screen.getByLabelText('Comprimento').tagName).toBe('INPUT');
    fireEvent.change(formato, { target: { value: 'Stiletto' } });
    fireEvent.change(screen.getByLabelText('Comprimento'), { target: { value: 'Tamanho 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar ficha técnica' }));
    await waitFor(() => expect(mockSalvarFicha).toHaveBeenCalledTimes(1));
    const [id, enviado] = mockSalvarFicha.mock.calls[0];
    expect(id).toBe('c1');
    expect(Object.keys(enviado.fields).sort()).toEqual(['formato', 'comprimento'].sort());
    expect(enviado.fields).toEqual({ formato: 'Stiletto', comprimento: 'Tamanho 2' });
    expect(enviado.allergies).toBe('Sensível a primer ácido');
    expect(await screen.findByText(/Atualizada em \d{2}\/\d{2}\/\d{4} por Camila Rocha/)).toBeInTheDocument();
  });

  it('campo livre adicionado vai em customFields', async () => {
    renderizar();
    await screen.findByRole('heading', { name: 'Ficha técnica — Unhas' });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar campo' }));
    fireEvent.change(screen.getByLabelText('Rótulo do campo 1'), { target: { value: 'Tom de pele' } });
    fireEvent.change(screen.getByLabelText('Valor do campo 1'), { target: { value: 'Claro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar ficha técnica' }));
    await waitFor(() => expect(mockSalvarFicha).toHaveBeenCalled());
    expect(mockSalvarFicha.mock.calls[0][1].customFields).toEqual([{ label: 'Tom de pele', value: 'Claro' }]);
  });

  it('alergia vazia mostra "Nenhuma alergia registrada"', async () => {
    const p = perfil();
    mockBuscarPerfil.mockResolvedValue({ ...p, fichaTecnica: { ...p.fichaTecnica, allergies: null } });
    renderizar();
    expect(await screen.findByText('Nenhuma alergia registrada')).toBeInTheDocument();
  });

  it('foto acima de 5 MB não é enviada e mostra o aviso', async () => {
    renderizar();
    expect(await screen.findByText('Nenhuma foto ainda')).toBeInTheDocument();
    const input = screen.getByLabelText('Anexar foto') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const grande = new File(['x'], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [grande] } });
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('A foto precisa ter até 5MB', 'error'));
    expect(mockEnviarFoto).not.toHaveBeenCalled();
  });

  it('mostra as fotos com o link assinado da API', async () => {
    mockListarFotos.mockResolvedValue([
      { id: 'f1', url: 'https://assinado.example/f1?token=abc', caption: 'Manutenção', serviceName: null, takenAt: '2026-09-12' },
    ]);
    renderizar();
    const img = await screen.findByRole('img', { name: 'Manutenção' });
    expect(img).toHaveAttribute('src', 'https://assinado.example/f1?token=abc');
    // Data pura do backend: sem voltar um dia por causa do fuso.
    expect(screen.getByText('12/09/2026')).toBeInTheDocument();
  });

  it('abas da linha do tempo pedem o filtro certo', async () => {
    renderizar();
    expect(await screen.findByText('Manutenção em gel')).toBeInTheDocument();
    expect(mockBuscarTimeline).toHaveBeenCalledWith('c1', 'todos');
    expect(screen.getByLabelText('4 de 5 estrelas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Agendamentos' }));
    await waitFor(() => expect(mockBuscarTimeline).toHaveBeenCalledWith('c1', 'agendamentos'));
    fireEvent.click(screen.getByRole('tab', { name: 'Financeiro' }));
    await waitFor(() => expect(mockBuscarTimeline).toHaveBeenCalledWith('c1', 'financeiro'));
  });

  it('cliente inexistente mostra "Cliente não encontrada"', async () => {
    mockBuscarPerfil.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderizar();
    expect(await screen.findByText('Cliente não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para clientes' })).toHaveAttribute('href', '/clientes');
  });

  it('"Assinante Clube" nunca aparece', async () => {
    renderizar();
    await screen.findByRole('heading', { level: 1, name: 'Mariana Souza' });
    await screen.findByText('Manutenção em gel');
    expect(document.body.textContent).not.toMatch(/Assinante Clube/i);
  });

  it('revogar pede confirmação e chama a API com false', async () => {
    mockRegistrarConsentimento.mockResolvedValue({ estado: 'revogado', desde: '2026-10-15T12:00:00.000Z', canal: 'painel' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Revogar consentimento' }));
    await waitFor(() => expect(mockRegistrarConsentimento).toHaveBeenCalledWith('c1', false));
    expect(await screen.findByText('Consentimento revogado em 15/10/2026')).toBeInTheDocument();
  });

  it('erro do backend ao anexar foto mostra a mensagem da API', async () => {
    mockEnviarFoto.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: { status: 400, data: { error: 'Imagem inválida' } },
    });
    renderizar();
    await screen.findByText('Nenhuma foto ainda');
    const foto = new File(['x'], 'unha.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Anexar foto'), { target: { files: [foto] } });
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar foto' }));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Imagem inválida', 'error'));
    expect(mockShowToast).not.toHaveBeenCalledWith('Request failed with status code 400', 'error');
  });

  it('aba que falha não deixa a lista da aba anterior na tela', async () => {
    renderizar();
    expect(await screen.findByText('Manutenção em gel')).toBeInTheDocument();
    mockBuscarTimeline.mockRejectedValueOnce(new Error('falhou'));
    fireEvent.click(screen.getByRole('tab', { name: 'Financeiro' }));
    expect(await screen.findByText('Não foi possível carregar a linha do tempo')).toBeInTheDocument();
    expect(screen.queryByText('Manutenção em gel')).not.toBeInTheDocument();
  });

  it('link de foto vencido recarrega a lista uma vez e libera de novo depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockListarFotos.mockResolvedValue([
      { id: 'f1', url: 'https://assinado.example/f1', caption: 'Manutenção', serviceName: null, takenAt: '2026-09-12' },
    ]);
    renderizar();
    fireEvent.error(await screen.findByRole('img', { name: 'Manutenção' }));
    await waitFor(() => expect(mockListarFotos).toHaveBeenCalledTimes(2));
    // Falha logo em seguida: não entra em laço.
    fireEvent.error(screen.getByRole('img', { name: 'Manutenção' }));
    expect(mockListarFotos).toHaveBeenCalledTimes(2);
    // Próximo vencimento, mais tarde: recarrega de novo.
    await vi.advanceTimersByTimeAsync(61_000);
    fireEvent.error(screen.getByRole('img', { name: 'Manutenção' }));
    await waitFor(() => expect(mockListarFotos).toHaveBeenCalledTimes(3));
  });

  it('recarregar o perfil depois de salvar etiquetas não apaga a ficha em edição', async () => {
    renderizar();
    await screen.findByRole('heading', { name: 'Ficha técnica — Unhas' });
    fireEvent.change(screen.getByLabelText('Comprimento'), { target: { value: 'Tamanho 3' } });
    mockBuscarPerfil.mockResolvedValue(perfil({ etiquetas: [{ id: 't2', name: 'Noiva', color: 'success' }] }));
    const menu = screen.getByRole('button', { name: 'Mais opções da cliente' });
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Etiquetas' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar etiquetas' }));
    expect(await screen.findByText('Noiva')).toBeInTheDocument();
    expect(screen.getByLabelText('Comprimento')).toHaveValue('Tamanho 3');
  });

  it('o cabeçalho mostra a foto da cliente', async () => {
    mockBuscarPerfil.mockResolvedValue(perfil({ cliente: { ...perfil().cliente, avatarUrl: 'https://cdn.exemplo/m.jpg' } }));
    renderizar();
    await screen.findByRole('heading', { level: 1, name: 'Mariana Souza' });
    expect(screen.getByRole('img', { name: 'Mariana Souza' })).toHaveAttribute('src', 'https://cdn.exemplo/m.jpg');
  });
});
