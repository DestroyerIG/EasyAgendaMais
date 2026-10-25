import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { conviteApi, equipeApi, rotuloAcesso } from '@/lib/equipe';
import { avaliacaoPublicaApi } from '@/lib/avaliacoes';
import { ConviteProfissional } from '../ConviteProfissional';
import { AvaliarAtendimento } from '@/components/avaliacao/AvaliarAtendimento';
import { AcessoAppProfissional } from '@/components/services/AcessoAppProfissional';

const showToast = vi.hoisted(() => vi.fn());
const usuario = vi.hoisted(() => ({ role: 'tenant_admin', plan: 'profissional' }));

vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: usuario.role, plan: usuario.plan, subscriptionStatus: 'active' } }),
}));
vi.mock('@/lib/equipe', async (orig) => {
  const real = await orig<typeof import('@/lib/equipe')>();
  return {
    ...real,
    conviteApi: { ver: vi.fn(), aceitar: vi.fn() },
    equipeApi: { acessos: vi.fn(), convidar: vi.fn(), revogar: vi.fn(), remover: vi.fn(), reativar: vi.fn() },
  };
});
vi.mock('@/lib/avaliacoes', async (orig) => {
  const real = await orig<typeof import('@/lib/avaliacoes')>();
  return { ...real, avaliacaoPublicaApi: { ver: vi.fn(), enviar: vi.fn() } };
});

const erro410 = (mensagem: string) => {
  const e = new AxiosError('gone', '410', undefined, undefined, {
    status: 410, statusText: 'Gone', headers: {}, config: { headers: new AxiosHeaders() }, data: { error: mensagem },
  });
  return e;
};

const convite = conviteApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const equipe = equipeApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const avaliacao = avaliacaoPublicaApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  usuario.role = 'tenant_admin';
  usuario.plan = 'profissional';
});

describe('convite da profissional', () => {
  it('saúda pelo nome e só libera Entrar com a senha forte e conferida', async () => {
    convite.ver.mockResolvedValue({ negocio: 'Studio Aurora', profissional: 'Camila Rocha', email: 'camila@x.com' });
    convite.aceitar.mockResolvedValue(undefined);
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<ConviteProfissional token={'t'.repeat(43)} />);
    expect(await screen.findByRole('heading', { name: 'Camila, o Studio Aurora te convidou para o EasyAgenda+' })).toBeInTheDocument();
    const entrar = screen.getByRole('button', { name: /Entrar/ });
    const [senha, confirmacao] = screen.getAllByLabelText(/senha/i).filter((el) => el.tagName === 'INPUT');
    await userEvent.type(senha!, 'fraca');
    expect(entrar).toBeDisabled();
    await userEvent.clear(senha!);
    await userEvent.type(senha!, 'Unhas2026');
    await userEvent.type(confirmacao!, 'Unhas2025');
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
    await userEvent.clear(confirmacao!);
    await userEvent.type(confirmacao!, 'Unhas2026');
    await userEvent.click(entrar);
    expect(convite.aceitar).toHaveBeenCalledWith('t'.repeat(43), 'Unhas2026');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/bancada'));
    vi.unstubAllGlobals();
  });

  it('convite vencido: mostra a mensagem do servidor', async () => {
    convite.ver.mockRejectedValue(erro410('Este convite expirou. Peça um novo convite ao salão.'));
    render(<ConviteProfissional token="x" />);
    expect(await screen.findByText('Este convite expirou. Peça um novo convite ao salão.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar/ })).not.toBeInTheDocument();
  });
});

describe('avaliação pelo link', () => {
  it('escolhe as estrelas, comenta e agradece', async () => {
    avaliacao.ver.mockResolvedValue({ negocio: 'Studio Aurora', profissional: 'Camila', cliente: 'Mariana', servico: 'Manicure', data: '2026-10-24' });
    avaliacao.enviar.mockResolvedValue(undefined);
    render(<AvaliarAtendimento token="t" />);
    expect(await screen.findByRole('heading', { name: 'Como foi seu atendimento com Camila?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: '4 estrelas' }));
    expect(screen.getByText('Bom')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'Adorei o formato');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(avaliacao.enviar).toHaveBeenCalledWith('t', 4, 'Adorei o formato');
    expect(await screen.findByText('Obrigada pela avaliação!')).toBeInTheDocument();
  });

  it('link já usado: mostra o aviso e nenhuma estrela', async () => {
    avaliacao.ver.mockRejectedValue(erro410('Obrigada! Esta avaliação já foi registrada.'));
    render(<AvaliarAtendimento token="t" />);
    expect(await screen.findByText('Obrigada! Esta avaliação já foi registrada.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('Acesso ao app no cadastro da profissional', () => {
  it('rótulos do estado', () => {
    expect(rotuloAcesso(null)).toBe('Sem acesso ao app');
    expect(rotuloAcesso({ professionalId: 'p', estado: 'convite_enviado', email: 'a@x', desde: '2026-10-20T10:00:00Z' })).toBe('Convite enviado em 20/10');
    expect(rotuloAcesso({ professionalId: 'p', estado: 'ativo', email: 'a@x', desde: '2026-10-21T10:00:00Z' })).toBe('Ativo desde 21/10');
    expect(rotuloAcesso({ professionalId: 'p', estado: 'removido', email: 'a@x', desde: null })).toBe('Acesso removido');
  });

  it('convida e mostra o link para copiar quando o e-mail não sai', async () => {
    equipe.acessos.mockResolvedValue([]);
    equipe.convidar.mockResolvedValue({
      professionalId: 'p1', estado: 'convite_enviado', email: 'camila@x.com', desde: '2026-10-25T10:00:00Z',
      link: 'https://app.test/convite/abc', emailEnviado: false,
    });
    render(<AcessoAppProfissional professionalId="p1" />);
    await waitFor(() => expect(equipe.acessos).toHaveBeenCalled());
    await userEvent.type(screen.getByRole('textbox', { name: 'E-mail da profissional' }), 'camila@x.com');
    await userEvent.click(screen.getByRole('button', { name: /Convidar para o app/ }));
    expect(equipe.convidar).toHaveBeenCalledWith('p1', 'camila@x.com');
    expect(await screen.findByDisplayValue('https://app.test/convite/abc')).toBeInTheDocument();
    expect(screen.getByText('Convite enviado em 25/10')).toBeInTheDocument();
  });

  it('ativo: oferece remover o acesso', async () => {
    equipe.acessos.mockResolvedValue([{ professionalId: 'p1', estado: 'ativo', email: 'camila@x.com', desde: '2026-10-21T10:00:00Z' }]);
    equipe.remover.mockResolvedValue({ professionalId: 'p1', estado: 'removido', email: 'camila@x.com', desde: null });
    render(<AcessoAppProfissional professionalId="p1" />);
    await userEvent.click(await screen.findByRole('button', { name: /Remover acesso/ }));
    expect(equipe.remover).toHaveBeenCalledWith('p1');
    expect(await screen.findByRole('button', { name: /Reativar acesso/ })).toBeInTheDocument();
  });

  it('plano Solo: explica e não chama a API', () => {
    usuario.plan = 'basico';
    render(<AcessoAppProfissional professionalId="p1" />);
    expect(screen.getByText(/Disponível nos planos Equipe e Salão/)).toBeInTheDocument();
    expect(equipe.acessos).not.toHaveBeenCalled();
  });

  it('recepção não vê o bloco', () => {
    usuario.role = 'employee';
    const { container } = render(<AcessoAppProfissional professionalId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
