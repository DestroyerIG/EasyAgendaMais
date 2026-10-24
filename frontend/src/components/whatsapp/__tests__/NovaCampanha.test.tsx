import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const api = vi.hoisted(() => ({
  previaPublico: vi.fn(),
  opcoesCampanha: vi.fn(),
  criarCampanha: vi.fn(),
  salvarCampanha: vi.fn(),
}));
vi.mock('@/lib/whatsappCampanhas', async (original) => ({ ...(await original<object>()), ...api }));

import { NovaCampanha } from '../campanhas/NovaCampanha';
import {
  agoraNoFuso, campanhaIdDoErro, intervaloCampanha, nomeAutomatico, previsaoDuracao, somarDias,
  type CampanhaDto, type PublicoDto,
} from '@/lib/whatsappCampanhas';
import { inserirVariavel } from '@/lib/inserirVariavel';

const publico = (o: Partial<PublicoDto> = {}): PublicoDto => ({
  selecionadas: 42, receberao: 36, resguardadas: 6,
  amostra: { nome: 'Mariana Souza', telefone: '5583987241102', texto: 'Oi Mariana\n\nResponda SAIR para não receber novidades.' },
  ...o,
});

const camp = (o: Partial<CampanhaDto> = {}): CampanhaDto => ({
  id: 'c9', nome: 'Volta de maio', segmento: 'reativacao', professionalId: null, serviceId: null, texto: 'Olá {primeiro_nome}',
  data: somarDias(agoraNoFuso().ymd, 2), hora: '14:00', cadencia: 10, status: 'rascunho', total: 0, enviadas: 0,
  createdAt: '2026-10-20T10:00:00Z', ...o,
});

const resposta = (total = 36, jaNaFila = 0) => ({ campanha: camp({ status: 'agendada', total }), jaNaFila });

const erroCom = (data: unknown) => new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 400, statusText: '', headers: {}, config: {} as never, data,
});
// Forma que chega aos componentes depois do interceptor de `api` (error vira texto, details sobe para a raiz).
const erroComRascunho = () => erroCom({
  success: false, message: 'Nenhuma cliente neste público', error: 'Nenhuma cliente neste público',
  errorCode: 'VALIDATION_ERROR', details: [{ campanhaId: 'abc' }],
});

const caixa = () => screen.getByLabelText('Texto da mensagem') as HTMLTextAreaElement;
const botaoAgendar = () => screen.getByRole('button', { name: /Agendar Disparo para/ });

const renderizar = (props: { campanha?: CampanhaDto; conectado?: boolean; onFechar?: (r: boolean) => void } = {}) => {
  const onFechar = props.onFechar ?? vi.fn();
  render(<NovaCampanha campanha={props.campanha} nomeNegocio="Studio Aurora" conectado={props.conectado ?? true} onFechar={onFechar} />);
  return onFechar;
};

const escrever = (texto: string) => fireEvent.change(caixa(), { target: { value: texto } });

describe('regras espelhadas', () => {
  it('previsaoDuracao', () => {
    expect(previsaoDuracao(36, 25, '10:00')).toBe('1h 27min');
    expect(previsaoDuracao(300, 10, '10:00').endsWith('continua no dia seguinte às 08:00')).toBe(true);
  });
  it('intervaloCampanha com rand 0 e 1', () => {
    expect([intervaloCampanha(60, () => 0), intervaloCampanha(60, () => 1)]).toEqual([45, 75]);
    expect([intervaloCampanha(25, () => 0), intervaloCampanha(25, () => 1)]).toEqual([108, 180]);
    expect([intervaloCampanha(10, () => 0), intervaloCampanha(10, () => 1)]).toEqual([270, 450]);
  });
  it('campanhaIdDoErro acha o id depois e antes do interceptor', () => {
    expect(campanhaIdDoErro(erroComRascunho())).toBe('abc');
    expect(campanhaIdDoErro(erroCom({ error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ campanhaId: 'def' }] } }))).toBe('def');
    expect(campanhaIdDoErro(erroCom({ error: 'x', details: ['texto'] }))).toBeNull();
    expect(campanhaIdDoErro(new Error('x'))).toBeNull();
  });
  it('nomeAutomatico', () => {
    expect(nomeAutomatico('reativacao', '2026-10-21')).toBe('Reativação · 21/10');
  });
  it('inserirVariavel troca a seleção e respeita o limite', () => {
    expect(inserirVariavel('Oi! Tudo?', 3, 3, 'primeiro_nome', 100)).toEqual({ texto: 'Oi!{primeiro_nome} Tudo?', cursor: 18 });
    expect(inserirVariavel('abc', 0, 3, 'link', 100)).toEqual({ texto: '{link}', cursor: 6 });
    expect(inserirVariavel('abc', 3, 3, 'link', 5)).toBeNull();
  });
});

describe('NovaCampanha', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    showToast.mockReset();
    api.opcoesCampanha.mockResolvedValue({ profissionais: [{ id: 'p1', nome: 'Camila' }], servicos: [{ id: 's1', nome: 'Corte' }] });
    api.previaPublico.mockResolvedValue(publico());
  });

  it('abre com Em risco, cadência 25, amanhã às 10:00 e nome automático', async () => {
    renderizar();
    const hoje = agoraNoFuso().ymd;
    expect((screen.getByLabelText('Segmento inteligente de clientes') as HTMLSelectElement).value).toBe('em_risco');
    expect(screen.getByRole('radio', { name: '25 msgs/h (Recomendado)' })).toHaveAttribute('aria-checked', 'true');
    expect((screen.getByLabelText('Data do início') as HTMLSelectElement).value).toBe(somarDias(hoje, 1));
    expect((screen.getByLabelText('Horário sugerido') as HTMLSelectElement).value).toBe('10:00');
    expect((screen.getByLabelText('Nome da campanha') as HTMLInputElement).value).toBe(nomeAutomatico('em_risco', hoje));
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
  });

  it('trocar o segmento chama a prévia com o novo segmento e mostra os números da resposta', async () => {
    renderizar();
    await waitFor(() => expect(api.previaPublico).toHaveBeenCalled());
    api.previaPublico.mockResolvedValue(publico({ selecionadas: 42, receberao: 36 }));
    fireEvent.change(screen.getByLabelText('Segmento inteligente de clientes'), { target: { value: 'vips' } });
    await waitFor(() => expect(api.previaPublico).toHaveBeenLastCalledWith(expect.objectContaining({ segmento: 'vips' })));
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
    expect(screen.getByText(/36 clientes com consentimento ativo/)).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza · (83) 98724-1102')).toBeInTheDocument();
    expect((screen.getByLabelText('Nome da campanha') as HTMLInputElement).value).toBe(nomeAutomatico('vips', agoraNoFuso().ymd));
  });

  it('resposta antiga da prévia não sobrescreve a nova', async () => {
    let resolverAntiga: (p: PublicoDto) => void = () => {};
    api.previaPublico.mockReturnValueOnce(new Promise((r) => { resolverAntiga = r; }));
    api.previaPublico.mockResolvedValueOnce(publico({ selecionadas: 7 }));
    renderizar();
    fireEvent.change(screen.getByLabelText('Segmento inteligente de clientes'), { target: { value: 'vips' } });
    expect(await screen.findByText('7 selecionadas')).toBeInTheDocument();
    resolverAntiga(publico({ selecionadas: 99 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('99 selecionadas')).toBeNull();
  });

  it('clicar no chip {primeiro_nome} insere no cursor', async () => {
    renderizar();
    escrever('Oi! Tudo?');
    caixa().focus();
    caixa().setSelectionRange(3, 3);
    await userEvent.click(screen.getByRole('button', { name: '{primeiro_nome}' }));
    expect(caixa().value).toBe('Oi!{primeiro_nome} Tudo?');
  });

  it('com receberao 0 o agendamento fica desabilitado', async () => {
    api.previaPublico.mockResolvedValue(publico({ selecionadas: 3, receberao: 0, resguardadas: 3, amostra: null }));
    renderizar();
    escrever('Oi {primeiro_nome}');
    expect(await screen.findByText('3 selecionadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendar Disparo para 0 Clientes' })).toBeDisabled();
    expect(screen.getByText('Nenhuma cliente neste público')).toBeInTheDocument();
  });

  it('texto vazio desabilita o agendamento', async () => {
    renderizar();
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
    expect(botaoAgendar()).toBeDisabled();
  });

  it('agendar envia data, hora e cadência escolhidas; dois cliques rápidos fazem uma chamada', async () => {
    let resolver: (r: ReturnType<typeof resposta>) => void = () => {};
    api.criarCampanha.mockReturnValue(new Promise((r) => { resolver = r; }));
    const onFechar = renderizar();
    escrever('Oi {primeiro_nome}');
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
    const data = somarDias(agoraNoFuso().ymd, 3);
    fireEvent.change(screen.getByLabelText('Data do início'), { target: { value: data } });
    fireEvent.change(screen.getByLabelText('Horário sugerido'), { target: { value: '15:30' } });
    await userEvent.click(screen.getByRole('radio', { name: '60 msgs/h (Agressivo)' }));
    const botao = screen.getByRole('button', { name: 'Agendar Disparo para 36 Clientes' });
    fireEvent.click(botao);
    fireEvent.click(botao);
    resolver(resposta(36, 2));
    await waitFor(() => expect(onFechar).toHaveBeenCalledWith(true));
    expect(api.criarCampanha).toHaveBeenCalledTimes(1);
    expect(api.criarCampanha).toHaveBeenCalledWith(expect.objectContaining({
      acao: 'agendar', data, hora: '15:30', cadencia: 60, segmento: 'em_risco', texto: 'Oi {primeiro_nome}',
      professionalId: null, serviceId: null,
    }));
    expect(showToast).toHaveBeenCalledWith('Campanha agendada para 36 clientes. 2 já estavam em outra campanha na fila.', 'success');
  });

  it('se o agendamento falha depois de criar o rascunho, a próxima tentativa usa o rascunho', async () => {
    api.criarCampanha.mockRejectedValueOnce(erroComRascunho());
    api.salvarCampanha.mockResolvedValue(resposta());
    const onFechar = renderizar();
    escrever('Oi {primeiro_nome}');
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
    await userEvent.click(botaoAgendar());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Nenhuma cliente neste público', 'error'));
    expect(onFechar).not.toHaveBeenCalled();
    await userEvent.click(botaoAgendar());
    await waitFor(() => expect(api.salvarCampanha).toHaveBeenCalledWith('abc', expect.objectContaining({ acao: 'agendar' })));
    expect(api.criarCampanha).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenLastCalledWith('Campanha agendada para 36 clientes.', 'success');
  });

  it('"Salvar como Rascunho" com campanha existente chama salvarCampanha(id, …)', async () => {
    api.salvarCampanha.mockResolvedValue({ campanha: camp(), jaNaFila: 0 });
    const c = camp();
    const onFechar = renderizar({ campanha: c });
    expect(caixa().value).toBe('Olá {primeiro_nome}');
    expect((screen.getByLabelText('Nome da campanha') as HTMLInputElement).value).toBe('Volta de maio');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar como Rascunho' }));
    await waitFor(() => expect(api.salvarCampanha).toHaveBeenCalledWith('c9', expect.objectContaining({
      acao: 'rascunho', nome: 'Volta de maio', segmento: 'reativacao', data: c.data, hora: '14:00', cadencia: 10,
    })));
    expect(showToast).toHaveBeenCalledWith('Rascunho salvo.', 'success');
    expect(onFechar).toHaveBeenCalledWith(true);
  });

  it('escolher 60/h mostra a faixa real do intervalo', async () => {
    renderizar();
    expect(screen.getByText('108 a 180 segundos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '60 msgs/h (Agressivo)' }));
    expect(screen.getByText('45 a 75 segundos')).toBeInTheDocument();
  });

  it('mostra a previsão de entrega e o rodapé fixo fora da caixa', async () => {
    renderizar();
    expect(await screen.findByText('Previsão: 1h 27min')).toBeInTheDocument();
    expect(caixa().value).not.toContain('SAIR');
    expect(screen.getByTestId('rodape-fixo')).toHaveTextContent('Responda SAIR para não receber novidades.');
  });

  it('WhatsApp desconectado mostra o aviso e ainda deixa agendar', async () => {
    renderizar({ conectado: false });
    escrever('Oi');
    expect(screen.getByText('O WhatsApp está desconectado. As mensagens saem quando a conexão voltar.')).toBeInTheDocument();
    expect(await screen.findByText('42 selecionadas')).toBeInTheDocument();
    expect(botaoAgendar()).toBeEnabled();
  });
});
