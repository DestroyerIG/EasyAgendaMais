import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
const showToast = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));

import { RoboAtendimento } from '../RoboAtendimento';
import type { MenuOption } from '../MenuOptionsPanel';
import type { TextoDto } from '@/lib/roboTextos';

const opcao = (parcial: Partial<MenuOption>): MenuOption => ({
  id: 'o1', option_order: 1, label: 'Agendar', emoji: '📅', type: 'system', handler: 'schedule',
  response_message: null, active: true, numero: 1, motivoOculta: null, ...parcial,
});

const OPCOES: MenuOption[] = [
  opcao({}),
  opcao({ id: 'o2', option_order: 2, label: 'Serviços', emoji: '✂️', handler: 'view_services', active: false, numero: null, motivoOculta: 'desligada' }),
  opcao({ id: 'o3', option_order: 3, label: 'Promoções', emoji: '🎉', handler: 'promotions', numero: null, motivoOculta: 'sem_promocao' }),
  opcao({ id: 'o4', option_order: 4, label: 'Instagram', emoji: '📱', handler: 'instagram', numero: null, motivoOculta: 'sem_instagram' }),
  opcao({ id: 'o5', option_order: 5, label: 'Equipe', emoji: '💬', handler: 'attendant', numero: 2 }),
];

const t = (chave: string, caminho: TextoDto['caminho'], rotulo: string, valor: string, extra: Partial<TextoDto> = {}): TextoDto => ({
  chave, caminho, rotulo, variaveis: ['nome_negocio'], valor, padrao: valor, personalizado: false, ...extra,
});

const TEXTOS: TextoDto[] = [
  t('welcome_header', 'geral', 'Boas-vindas', 'Olá! Bem-vindo ao {nome_negocio}'),
  t('invalid_option_message', 'geral', 'Opção inválida', 'Não entendi essa opção'),
  t('politica_message', 'geral', 'Resposta rápida: Política', '', { variaveis: [], permiteVazio: true, max: 1000 }),
  t('choose_service_title', 'schedule', 'Título da escolha de serviços', 'Escolha o serviço', { variaveis: [] }),
  t('slot_taken_message', 'schedule', 'Horário recém-reservado', 'Esse horário acabou de ser reservado', { variaveis: [] }),
  t('confirmation_message', 'schedule', 'Agendamento confirmado', 'Marcado: {servico} {data} {horario}', {
    variaveis: ['servico', 'data', 'horario'], importantes: ['horario', 'data'],
  }),
  t('promotions_message', 'promotions', 'Promoções', '', { permiteVazio: true }),
  t('instagram_message', 'instagram', 'Instagram', 'Siga {instagram_handle}', { variaveis: ['nome_negocio', 'instagram_handle'] }),
];

const montar = (extra: Partial<React.ComponentProps<typeof RoboAtendimento>> = {}) => {
  const props = {
    options: OPCOES, loading: false, actionLoading: false,
    onToggle: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), onCreate: vi.fn(), onReorder: vi.fn(), onReset: vi.fn(),
    instagramHandle: null, onSalvarInstagram: vi.fn().mockResolvedValue(true),
    onSendMessage: vi.fn().mockResolvedValue(['oi']), onLimpar: vi.fn().mockResolvedValue(undefined),
    onTextosSalvos: vi.fn(),
    ...extra,
  };
  render(<RoboAtendimento {...props} />);
  return props;
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: TEXTOS });
  put.mockImplementation(async (_url: string, corpo: { textos: Record<string, string | null> }) => ({
    data: TEXTOS.map((x) => (x.chave in corpo.textos ? { ...x, valor: corpo.textos[x.chave] ?? x.padrao } : x)),
  }));
});

/** A linha do menu cujo nome (primeiro parágrafo) termina com `nome`. */
const linhaDe = (nome: string) =>
  screen.getAllByRole('listitem').find((li) => li.querySelector('p')?.textContent?.trim().endsWith(nome)) as HTMLElement;

describe('RoboAtendimento - menu e mensagens', () => {
  it('tem as duas áreas e não tem mais abas nem reset geral', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Menu e mensagens' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Mensagens gerais' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resetar para o padrão/ })).not.toBeInTheDocument();
  });

  it('a lista mostra o número real e o motivo da opção oculta', async () => {
    montar();
    expect(await screen.findByText('Não aparece: cadastre seu Instagram')).toBeInTheDocument();
    expect(screen.queryByText(/view_services/)).not.toBeInTheDocument();
    expect(within(linhaDe('Agendar')).getByLabelText('Número no menu')).toHaveTextContent('1');
    expect(within(linhaDe('Equipe')).getByLabelText('Número no menu')).toHaveTextContent('2');
    expect(within(linhaDe('Serviços')).queryByLabelText('Número no menu')).not.toBeInTheDocument();
    expect(screen.getByText('Mostra seus serviços e preços')).toBeInTheDocument();
    expect(within(linhaDe('Serviços')).getByText('Não aparece: opção desligada')).toBeInTheDocument();
  });

  it('o motivo da promoção aponta para o editor da própria opção', async () => {
    montar();
    const linha = linhaDe('Promoções');
    expect(within(linha).getByText('Não aparece: escreva sua promoção')).toBeInTheDocument();
    expect(screen.queryByText(/em Mensagens/)).not.toBeInTheDocument();
    await userEvent.click(within(linha).getByRole('button', { name: 'Resolver' }));
    expect(await screen.findByRole('textbox', { name: 'Promoções' })).toBeInTheDocument();
  });

  it('abrir a opção mostra as mensagens do caminho, na ordem do catálogo', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Mensagens gerais' });
    await userEvent.click(within(linhaDe('Agendar')).getByRole('button', { name: 'Editar opção' }));
    const dialogo = await screen.findByRole('dialog');
    const campos = within(dialogo).getAllByRole('textbox').map((c) => c.getAttribute('id'));
    const rotulos = campos.map((id) => dialogo.querySelector(`label[for="${id}"]`)?.textContent);
    expect(rotulos).toEqual(['Emoji', 'Nome da opção *', 'Título da escolha de serviços', 'Horário recém-reservado', 'Agendamento confirmado']);
    expect(within(dialogo).queryByText('Boas-vindas')).not.toBeInTheDocument();
  });

  it('apagar variável importante avisa mas deixa salvar, e só o campo alterado é enviado', async () => {
    const props = montar();
    await screen.findByRole('heading', { name: 'Mensagens gerais' });
    await userEvent.click(within(linhaDe('Agendar')).getByRole('button', { name: 'Editar opção' }));
    const dialogo = await screen.findByRole('dialog');
    const campo = within(dialogo).getByRole('textbox', { name: 'Agendamento confirmado' });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Marcado: ok');
    expect(within(dialogo).getByText(/Você apagou/)).toHaveTextContent('{horario}');
    const salvar = within(dialogo).getByRole('button', { name: /Salvar/ });
    expect(salvar).toBeEnabled();
    await userEvent.click(salvar);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/whatsapp/config/textos', { textos: { confirmation_message: 'Marcado: ok' } }));
    await waitFor(() => expect(props.onTextosSalvos).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('o editor da opção não deixa salvar texto vazio, menos o que permite vazio', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Mensagens gerais' });
    await userEvent.click(within(linhaDe('Agendar')).getByRole('button', { name: 'Editar opção' }));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.clear(within(dialogo).getByRole('textbox', { name: 'Horário recém-reservado' }));
    expect(within(dialogo).getByRole('button', { name: /Salvar/ })).toBeDisabled();
  });

  it('o editor traz o campo do perfil do Instagram na opção do Instagram', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Mensagens gerais' });
    await userEvent.click(within(linhaDe('Instagram')).getByRole('button', { name: 'Editar opção' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByLabelText('Perfil do Instagram')).toBeInTheDocument();
    expect(within(dialogo).getByRole('textbox', { name: 'Instagram' })).toBeInTheDocument();
  });
});

describe('RoboAtendimento - mensagens gerais', () => {
  it('mostra os textos gerais, com a política como resposta rápida', async () => {
    montar();
    expect(await screen.findByRole('textbox', { name: 'Boas-vindas' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Resposta rápida: Política' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Título da escolha de serviços' })).not.toBeInTheDocument();
  });

  it('Salvar mensagens envia só os campos alterados e restaurar vai como null', async () => {
    const props = montar();
    const campo = await screen.findByRole('textbox', { name: 'Boas-vindas' });
    const salvar = screen.getByRole('button', { name: 'Salvar mensagens' });
    expect(salvar).toBeDisabled();
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Oi!');
    await userEvent.click(salvar);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/whatsapp/config/textos', { textos: { welcome_header: 'Oi!' } }));
    await waitFor(() => expect(props.onTextosSalvos).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/salvas/i), 'success');
  });

  it('restaurar o padrão de um texto personalizado envia null', async () => {
    get.mockResolvedValue({ data: TEXTOS.map((x) => (x.chave === 'welcome_header' ? { ...x, valor: 'Meu oi', personalizado: true } : x)) });
    montar();
    const campo = await screen.findByRole('textbox', { name: 'Boas-vindas' });
    expect(campo).toHaveValue('Meu oi');
    await userEvent.click(within(campo.parentElement as HTMLElement).getByRole('button', { name: /Restaurar padrão/ }));
    expect(campo).toHaveValue('Olá! Bem-vindo ao {nome_negocio}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar mensagens' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/whatsapp/config/textos', { textos: { welcome_header: null } }));
  });

  it('bloqueia salvar com texto vazio, mas deixa a política em branco', async () => {
    montar();
    const campo = await screen.findByRole('textbox', { name: 'Boas-vindas' });
    await userEvent.clear(campo);
    expect(screen.getByRole('button', { name: 'Salvar mensagens' })).toBeDisabled();
    await userEvent.type(campo, 'a');
    await userEvent.type(screen.getByRole('textbox', { name: 'Resposta rápida: Política' }), 'x');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Resposta rápida: Política' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar mensagens' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/whatsapp/config/textos', { textos: { welcome_header: 'a' } }));
  });

  it('erro ao salvar avisa e mantém o que foi digitado', async () => {
    put.mockRejectedValue(new Error('falhou'));
    montar();
    const campo = await screen.findByRole('textbox', { name: 'Boas-vindas' });
    await userEvent.type(campo, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar mensagens' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(campo).toHaveValue('Olá! Bem-vindo ao {nome_negocio}!');
  });
});

describe('RoboAtendimento - simulador', () => {
  it('em tela pequena abre pelo botão Testar e avisa das alterações não salvas', async () => {
    montar();
    expect(screen.queryByPlaceholderText('Envie uma mensagem...')).not.toBeInTheDocument();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Boas-vindas' }), '!');
    await userEvent.click(screen.getByRole('button', { name: /Testar/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByPlaceholderText('Envie uma mensagem...')).toBeInTheDocument();
    expect(within(dialogo).getByText(/O teste usa as mensagens salvas/)).toBeInTheDocument();
  });

  it('em computador mostra o simulador ao lado, sem botão Testar', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as never;
    try {
      montar();
      expect(await screen.findByPlaceholderText('Envie uma mensagem...')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Testar/ })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('RoboAtendimento - carga dos textos', () => {
  it('erro ao carregar mostra aviso e tenta de novo', async () => {
    get.mockRejectedValueOnce(new Error('rede'));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('textbox', { name: 'Boas-vindas' })).toBeInTheDocument();
  });
});
