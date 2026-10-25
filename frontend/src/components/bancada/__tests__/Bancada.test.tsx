import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComandaBancada, Hoje, ItemAgenda } from '@/lib/bancada';
import { bancadaApi, podeCancelar, podeReagendar, rotuloEmMinutos } from '@/lib/bancada';
import { HojeBancada } from '../HojeBancada';
import { AtendimentoBancada } from '../AtendimentoBancada';
import { CancelarModal } from '../AlterarAgendamento';

const showToast = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const busca = vi.hoisted(() => ({ atual: new URLSearchParams() }));

vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/components/push/AtivarNotificacoes', () => ({ AtivarNotificacoes: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => busca.atual,
  usePathname: () => '/bancada',
}));
vi.mock('@/lib/bancada', async (orig) => {
  const real = await orig<typeof import('@/lib/bancada')>();
  return {
    ...real,
    bancadaApi: {
      hoje: vi.fn(), iniciar: vi.fn(), horarios: vi.fn(), reagendar: vi.fn(), cancelar: vi.fn(),
      atalhos: vi.fn(), comanda: vi.fn(), salvarComanda: vi.fn(), enviarParaRecepcao: vi.fn(), fecharComanda: vi.fn(),
      enviarFoto: vi.fn(),
    },
  };
});

const api = bancadaApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const item = (over: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'a1', time: '23:30', status: 'confirmado', source: 'painel', deposito: 0, confirmouWhatsapp: false,
  cliente: { id: 'c1', name: 'Mariana Souza', phone: '5583999990000' },
  servico: { id: 's1', nome: 'Manicure', duracao: 60, preco: 50 }, comanda: null, ...over,
});

const hoje = (over: Partial<Hoje> = {}): Hoje => ({
  profissional: { id: 'p1', nome: 'Camila Rocha' }, data: '2026-10-25', hoje: '2026-10-25', profissionalCobra: false,
  resumo: { total: 1, emAndamento: 0, concluidos: 0 },
  destaque: {
    agendamentoId: 'a1', emMinutos: 20, fase: 'recorrente', visitas: 4, alergias: 'Acetona',
    ficha: [{ rotulo: 'Formato', valor: 'Amendoado' }], ultimoTrabalho: { id: 'x', data: '2026-10-01', servicos: 'Manicure + Esmaltação', valor: 70 },
  },
  agenda: [item()], ...over,
});

const comanda = (over: Partial<ComandaBancada> = {}): ComandaBancada => ({
  id: 'k1', number: 12, status: 'rascunho',
  appointment: { id: 'a1', date: '2026-10-25', time: '10:00', status: 'em_atendimento', source: 'painel' },
  client: { id: 'c1', name: 'Mariana Souza', phone: '55' },
  professional: { id: 'p1', name: 'Camila Rocha' },
  items: [{ id: 'i1', kind: 'servico', refId: 's1', name: 'Manicure', unitPrice: 50, quantity: 1, durationMinutes: 60, isMain: true, coveredValue: null }],
  depositAvailable: 0, discount: 0, tip: 0, paymentMethod: null,
  commission: { servicePct: 40, productPct: 10, origem: 'negocio' },
  cobertura: { disponivel: null, bloqueio: null, usando: false, descontoSociaPct: 0 },
  calc: {
    servicesTotal: 50, productsTotal: 0, subtotal: 50, depositApplied: 0, discount: 0, tip: 0, totalCharged: 50, revenue: 50,
    commissionService: 20, commissionProduct: 0, commissionTotal: 20, houseRetention: 30, serviceBase: 50, productBase: 0,
    coveredTotal: 0, memberDiscount: 0,
  },
  whatsappConnected: true, closedAt: null, receiptSentAt: null, profissionalCobra: false, enviadaRecepcaoEm: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  busca.atual = new URLSearchParams();
  api.atalhos.mockResolvedValue([{ kind: 'produto', id: 'pr1', name: 'Óleo de cutícula', price: 25 }]);
});

describe('regras de tela', () => {
  it('rótulo do tempo até a próxima', () => {
    expect(rotuloEmMinutos(null)).toBeNull();
    expect(rotuloEmMinutos(0)).toBe('Agora');
    expect(rotuloEmMinutos(20)).toBe('Em 20 min');
    expect(rotuloEmMinutos(65)).toBe('Em 1h05');
    expect(rotuloEmMinutos(120)).toBe('Em 2h');
  });

  it('reagendar e cancelar espelham o backend', () => {
    expect(podeReagendar({ status: 'confirmado', time: '10:00' }, '2026-10-25', '2026-10-25', '09:00')).toBe(true);
    expect(podeReagendar({ status: 'confirmado', time: '08:00' }, '2026-10-25', '2026-10-25', '09:00')).toBe(false);
    expect(podeReagendar({ status: 'aguardando_pagamento', time: '10:00' }, '2026-10-26', '2026-10-25', '09:00')).toBe(false);
    expect(podeCancelar({ status: 'aguardando_pagamento' }, '2026-10-25', '2026-10-25')).toBe(true);
    expect(podeCancelar({ status: 'em_atendimento' }, '2026-10-25', '2026-10-25')).toBe(false);
    expect(podeCancelar({ status: 'confirmado' }, '2026-10-24', '2026-10-25')).toBe(false);
  });
});

describe('Hoje na bancada', () => {
  it('destaca a próxima cliente com o alerta de alergia e a ficha', async () => {
    api.hoje.mockResolvedValue(hoje());
    render(<HojeBancada />);
    const destaque = await screen.findByRole('region', { name: 'Próxima cliente' });
    expect(within(destaque).getByText('Mariana Souza')).toBeInTheDocument();
    expect(within(destaque).getByText('Em 20 min')).toBeInTheDocument();
    expect(within(destaque).getByRole('alert')).toHaveTextContent('Alergia: Acetona');
    expect(within(destaque).getByText('Amendoado')).toBeInTheDocument();
    expect(within(destaque).getByText(/Manicure \+ Esmaltação/)).toBeInTheDocument();
  });

  it('iniciar abre a comanda e vai para o atendimento', async () => {
    api.hoje.mockResolvedValue(hoje());
    api.iniciar.mockResolvedValue(comanda());
    render(<HojeBancada />);
    const destaque = await screen.findByRole('region', { name: 'Próxima cliente' });
    await userEvent.click(within(destaque).getByRole('button', { name: /Iniciar/ }));
    expect(api.iniciar).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/bancada/atendimento?comanda=k1'));
  });

  it('outro dia: sem destaque nem iniciar, e a agenda livre avisa', async () => {
    api.hoje.mockResolvedValue(hoje({ data: '2026-10-26', destaque: null, agenda: [] }));
    render(<HojeBancada />);
    expect(await screen.findByText('Agenda livre')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Amanhã' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Próxima cliente' })).not.toBeInTheDocument();
  });

  it('atendimento concluído não mostra reagendar nem cancelar', async () => {
    api.hoje.mockResolvedValue(hoje({ destaque: null, agenda: [item({ status: 'concluido' })] }));
    render(<HojeBancada />);
    await screen.findByText('Mariana Souza');
    expect(screen.queryByRole('button', { name: /Reagendar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
  });
});

describe('Cancelar pelo app', () => {
  it('avisa do sinal e manda o motivo com o aviso à cliente', async () => {
    api.cancelar.mockResolvedValue({ cancelado: true, avisoEnviado: true });
    const onDone = vi.fn();
    render(<CancelarModal agendamento={item({ deposito: 30 })} data="2026-10-25" hoje="2026-10-25" onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByText(/O sinal pago fica com o salão/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Avisar Mariana/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Pedido da cliente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));
    expect(api.cancelar).toHaveBeenCalledWith('a1', { motivo: 'Pedido da cliente', avisarCliente: true });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe('Fechar atendimento', () => {
  it('sem a chave: mostra a comissão estimada e envia para a recepção', async () => {
    busca.atual = new URLSearchParams('comanda=k1');
    api.comanda.mockResolvedValue(comanda());
    api.enviarParaRecepcao.mockResolvedValue(comanda({ enviadaRecepcaoEm: '2026-10-25T13:00:00Z' }));
    render(<AtendimentoBancada />);
    expect(await screen.findByText('Sua comissão estimada')).toBeInTheDocument();
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pix' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Enviar para a recepção/ }));
    expect(api.enviarParaRecepcao).toHaveBeenCalledWith('k1', { extras: [] });
    expect(await screen.findByText(/Enviada para a recepção/)).toBeInTheDocument();
  });

  it('adicionar produto salva o rascunho com o extra', async () => {
    busca.atual = new URLSearchParams('comanda=k1');
    api.comanda.mockResolvedValue(comanda());
    api.salvarComanda.mockResolvedValue(comanda());
    render(<AtendimentoBancada />);
    await userEvent.type(await screen.findByPlaceholderText('Adicionar serviço ou produto'), 'óleo');
    await userEvent.click(await screen.findByRole('button', { name: /Óleo de cutícula/ }));
    expect(api.salvarComanda).toHaveBeenCalledWith('k1', { extras: [{ kind: 'produto', id: 'pr1', quantity: 1 }] });
  });

  it('com a chave: exige a forma de pagamento e fecha', async () => {
    busca.atual = new URLSearchParams('comanda=k1');
    api.comanda.mockResolvedValue(comanda({ profissionalCobra: true }));
    api.fecharComanda.mockResolvedValue(comanda({ profissionalCobra: true, status: 'fechada', receiptSentAt: 'x' }));
    render(<AtendimentoBancada />);
    const fechar = await screen.findByRole('button', { name: /Fechar e cobrar/ });
    expect(fechar).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Pix' }));
    await userEvent.click(fechar);
    expect(api.fecharComanda).toHaveBeenCalledWith('k1', { extras: [], discount: 0, tip: 0, paymentMethod: 'pix' });
    expect(await screen.findByText(/Comanda fechada/)).toBeInTheDocument();
  });

  it('sem atendimento em andamento: convida a iniciar pela agenda', async () => {
    api.hoje.mockResolvedValue(hoje({ agenda: [item()] }));
    render(<AtendimentoBancada />);
    expect(await screen.findByText('Nenhum atendimento em andamento')).toBeInTheDocument();
  });
});
