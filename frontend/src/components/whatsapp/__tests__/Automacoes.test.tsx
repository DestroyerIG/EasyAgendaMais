import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const api = vi.hoisted(() => ({
  listarRegras: vi.fn(),
  atualizarRegra: vi.fn(),
  testarRegra: vi.fn(),
  painel: vi.fn(),
  historico: vi.fn(),
}));
vi.mock('@/lib/whatsappAutomacoes', async (original) => ({ ...(await original<object>()), ...api }));

import { Automacoes } from '../automacoes/Automacoes';
import type { PainelAutomacoesDto, RegraDto } from '@/lib/whatsappAutomacoes';

const base = { texto: 'Olá {nome}!', textoPadrao: 'Olá {nome}!', personalizado: false, variaveis: ['nome'] };
const regras = (): RegraDto[] => [
  { ...base, regra: 'confirmacao', ativa: false, config: { hora: '09:00' } },
  { ...base, regra: 'sinal_pix', ativa: false, config: { toleranciaMin: 30 } },
  { ...base, regra: 'retorno', ativa: false, config: { modo: 'dias', dias: 21 } },
  { ...base, regra: 'lista_espera', ativa: false, config: { quantas: 3 } },
  { ...base, regra: 'lembrete', ativa: true, config: { modo: 'vespera', hora: '18:00' } },
  { ...base, regra: 'aniversario', ativa: false, config: { presente: '' } },
  { ...base, regra: 'avaliacao', ativa: false, config: { horas: 2, linkGoogle: null } },
];

const painelMock: PainelAutomacoesDto = {
  receitaMes: 2870, receitaVariacaoPct: 14, faltasEvitadas: 38,
  taxaResposta: { pct: 91, mediaMin: 3, selo: 'Excelente' },
  porRegra: {
    confirmacao: { faltasEvitadas: 38 },
    sinal_pix: { recebido: 1230 },
    retorno: { recuperado: 1640 },
    lista_espera: { vagasPreenchidas: 11 },
    lembrete: { enviados: 142, lidosPct: 99 },
    aniversario: { aniversariantes: 8, agendamentos: 5 },
    avaliacao: { notaMedia: 4.9, novas: 27 },
  },
  conexao: { conectado: true, numero: '5583981204000' },
};

const TITULOS = [
  'Confirmação 24h antes', 'Cobrança de sinal Pix', 'Radar de Retorno', 'Lista de espera automática',
  'Lembrete na véspera', 'Aniversário da cliente', 'Pedido de avaliação',
];

const renderizar = (p: Partial<{ conectado: boolean; onAbrirConexao: () => void }> = {}) =>
  render(<Automacoes conectado={p.conectado ?? true} onAbrirConexao={p.onAbrirConexao ?? vi.fn()} />);

const cartao = async (titulo: string) => (await screen.findByRole('heading', { name: titulo })).closest('article') as HTMLElement;

describe('Automacoes', () => {
  beforeEach(() => {
    showToast.mockReset();
    api.listarRegras.mockReset().mockResolvedValue(regras());
    api.painel.mockReset().mockResolvedValue(painelMock);
    api.atualizarRegra.mockReset();
  });

  it('renderiza os 7 títulos na ordem do Stitch', async () => {
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(TITULOS);
  });

  it('mostra os resultados do mês com o painel carregado', async () => {
    renderizar();
    expect(await screen.findByText('R$ 2.870')).toBeInTheDocument();
    expect(screen.getByText('+14%')).toBeInTheDocument();
    expect(screen.getByText('Receita recuperada no mês')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('Excelente')).toBeInTheDocument();
    expect(screen.getByText('Média de 3 minutos para retorno do cliente')).toBeInTheDocument();
    expect(screen.getByText('38 faltas evitadas este mês')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.230 recebidos em sinais')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.640 recuperados')).toBeInTheDocument();
    expect(screen.getByText('11 vagas preenchidas')).toBeInTheDocument();
    expect(screen.getByText('142 lembretes (99% lidos)')).toBeInTheDocument();
    expect(screen.getByText('8 aniversariantes · 5 agendamentos')).toBeInTheDocument();
    expect(screen.getByText('Nota média 4,9 · 27 novas avaliações')).toBeInTheDocument();
  });

  it('mostra "—" nos resultados enquanto o painel carrega', async () => {
    api.painel.mockReturnValue(new Promise(() => {}));
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    const resultados = screen.getByRole('region', { name: 'Resultados do mês' });
    expect(within(resultados).getAllByText('—')).toHaveLength(3);
  });

  it('mostra a linha de quando dispara a partir da config', async () => {
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    for (const t of ['24h antes · 09:00', 'Tolerância de 30 min', 'Aos 21 dias (personalizado)', 'Disparo para as 3 primeiras',
      'Véspera às 18:00', 'Dia do aniversário às 08:00', '2h após o checkout']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it('com a config padrão, as descrições são as do Stitch', async () => {
    api.listarRegras.mockResolvedValue(regras().map((r) =>
      (r.regra === 'aniversario' ? { ...r, config: { presente: 'R$ 20 OFF em qualquer serviço' } } : r)));
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    expect(screen.getByText('Ao surgir cancelamento, dispara para as 3 primeiras clientes compatíveis na fila de espera por estrita ordem de solicitação.')).toBeInTheDocument();
    expect(screen.getByText('Dispara às 18:00 do dia anterior com endereço completo, link do GPS e recomendações prévias para o procedimento.')).toBeInTheDocument();
    expect(screen.getByText('Envia felicitações às 08:00 com cupom de R$ 20 ou mimo de hidratação para agendamentos realizados na semana festiva.')).toBeInTheDocument();
    expect(screen.getByText('Disparado 2 horas após a comanda ser finalizada no balcão, solicitando nota de 1 a 5 e direcionando 5 estrelas ao Google Meu Negócio.')).toBeInTheDocument();
  });

  it('fora do padrão, título e descrição acompanham a config', async () => {
    const fora: Partial<Record<string, object>> = {
      lista_espera: { quantas: 5 },
      lembrete: { modo: '2h', hora: '18:00' },
      avaliacao: { horas: 4, linkGoogle: null },
      aniversario: { presente: 'uma escova grátis' },
    };
    api.listarRegras.mockResolvedValue(regras().map((r) => (fora[r.regra] ? { ...r, config: fora[r.regra] } : r)));
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    expect(screen.getByText('Ao surgir cancelamento, dispara para as 5 primeiras clientes compatíveis na fila de espera por estrita ordem de solicitação.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lembrete antes do horário' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lembrete na véspera' })).toBeNull();
    expect(screen.getByText('Dispara 2 horas antes do horário com endereço completo, link do GPS e recomendações prévias para o procedimento.')).toBeInTheDocument();
    expect(screen.getByText('2 horas antes')).toBeInTheDocument();
    expect(screen.getByText('Disparado 4 horas após a comanda ser finalizada no balcão, solicitando nota de 1 a 5 e direcionando 5 estrelas ao Google Meu Negócio.')).toBeInTheDocument();
    expect(screen.getByText('Envia felicitações às 08:00 com uma escova grátis para agendamentos realizados na semana festiva.')).toBeInTheDocument();
  });

  it('lembrete na véspera em outro horário, avaliação em 1 hora, uma só da lista e aniversário sem presente', async () => {
    const fora: Partial<Record<string, object>> = {
      lista_espera: { quantas: 1 },
      lembrete: { modo: 'vespera', hora: '19:30' },
      avaliacao: { horas: 1, linkGoogle: null },
      aniversario: { presente: '' },
    };
    api.listarRegras.mockResolvedValue(regras().map((r) => (fora[r.regra] ? { ...r, config: fora[r.regra] } : r)));
    renderizar();
    await screen.findByRole('heading', { name: TITULOS[0] });
    expect(screen.getByText('Ao surgir cancelamento, dispara para a primeira cliente compatível na fila de espera por estrita ordem de solicitação.')).toBeInTheDocument();
    expect(screen.getByText('Dispara às 19:30 do dia anterior com endereço completo, link do GPS e recomendações prévias para o procedimento.')).toBeInTheDocument();
    expect(screen.getByText(/^Disparado 1 hora após a comanda/)).toBeInTheDocument();
    expect(screen.getByText('Envia felicitações às 08:00 e convida a cliente para comemorar com um agendamento na semana festiva.')).toBeInTheDocument();
  });

  it('conta as regras ativas', async () => {
    renderizar();
    expect(await screen.findByText('1 ativa')).toBeInTheDocument();
  });

  it('o interruptor da Confirmação chama atualizarRegra e o selo vira "Ativo"', async () => {
    api.atualizarRegra.mockImplementation(async (regra: string, patch: { ativa: boolean }) => ({ ...regras()[0], regra, ...patch }));
    renderizar();
    const c = await cartao('Confirmação 24h antes');
    expect(within(c).getByText('Pausado')).toBeInTheDocument();
    await userEvent.click(within(c).getByRole('switch'));
    expect(api.atualizarRegra).toHaveBeenCalledWith('confirmacao', { ativa: true });
    expect(within(c).getByText('Ativo')).toBeInTheDocument();
    expect(within(c).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('2 ativas')).toBeInTheDocument();
  });

  it('erro no PATCH devolve o interruptor e avisa', async () => {
    api.atualizarRegra.mockRejectedValue(new Error('falhou'));
    renderizar();
    const c = await cartao('Confirmação 24h antes');
    await userEvent.click(within(c).getByRole('switch'));
    await waitFor(() => expect(within(c).getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    expect(within(c).getByText('Pausado')).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('"Configurações de envio" chama onAbrirConexao', async () => {
    const onAbrirConexao = vi.fn();
    renderizar({ onAbrirConexao });
    await userEvent.click(await screen.findByRole('button', { name: 'Configurações de envio' }));
    expect(onAbrirConexao).toHaveBeenCalled();
  });

  it('cartão lateral mostra o número conectado', async () => {
    renderizar();
    expect(await screen.findByText('WhatsApp conectado')).toBeInTheDocument();
    expect(screen.getByText('+55 (83) 98120-4000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Testar envio' })).toBeInTheDocument();
  });

  it('desconectado, o cartão lateral oferece "Conectar"', async () => {
    const onAbrirConexao = vi.fn();
    renderizar({ conectado: false, onAbrirConexao });
    expect(await screen.findByText('WhatsApp desconectado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(onAbrirConexao).toHaveBeenCalled();
  });

  it('mostra os botões do cabeçalho', async () => {
    renderizar();
    expect(await screen.findByRole('button', { name: 'Histórico de disparos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova automação' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Configurar regra' })).toHaveLength(7);
  });
});
