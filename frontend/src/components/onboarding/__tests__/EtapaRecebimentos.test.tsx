import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Onboarding } from '@/lib/onboarding';

const mocks = vi.hoisted(() => ({ conectar: vi.fn() }));

vi.mock('@/lib/recebimentos', async (orig) => {
  const real = await orig<typeof import('@/lib/recebimentos')>();
  return { ...real, recebimentosApi: { ...real.recebimentosApi, conectar: mocks.conectar } };
});

const { EtapaRecebimentos, erroDosRecebimentos } = await import('../EtapaRecebimentos');

const SERVICOS: Onboarding['servicos'] = [
  { id: 's1', nome: 'Corte', duracaoMinutos: 30, preco: 50, sinalPct: null },
  { id: 's2', nome: 'Barba', duracaoMinutos: 20, preco: 30, sinalPct: null },
];

const SEM_NADA: Onboarding['recebimentos'] = { conexao: null, temChavePix: false };

function renderEtapa(over: Partial<Parameters<typeof EtapaRecebimentos>[0]> = {}) {
  const props = {
    servicos: SERVICOS,
    recebimentos: SEM_NADA,
    salvando: false,
    onVoltar: vi.fn(),
    onPular: vi.fn(),
    onSalvar: vi.fn(),
    onConexaoMudou: vi.fn(),
    ...over,
  };
  render(<EtapaRecebimentos {...props} />);
  return props;
}

beforeEach(() => {
  mocks.conectar.mockReset();
});

describe('erroDosRecebimentos', () => {
  it('cobre cada caso', () => {
    expect(erroDosRecebimentos({ escolha: null, conectado: false, chave: '', servicosComSinal: 0 }))
      .toBe('Escolha como receber ou toque em Configurar depois.');
    expect(erroDosRecebimentos({ escolha: 'pix', conectado: false, chave: '  ', servicosComSinal: 0 }))
      .toBe('Informe a chave Pix.');
    expect(erroDosRecebimentos({ escolha: 'pix', conectado: false, chave: 'a@b.com', servicosComSinal: 1 })).toBeNull();
    expect(erroDosRecebimentos({ escolha: 'mercadopago', conectado: false, chave: '', servicosComSinal: 1 }))
      .toBe('Conecte a conta para cobrar o sinal.');
    expect(erroDosRecebimentos({ escolha: 'infinitepay', conectado: false, chave: '', servicosComSinal: 2 }))
      .toBe('Conecte a conta para cobrar o sinal.');
    expect(erroDosRecebimentos({ escolha: 'mercadopago', conectado: false, chave: '', servicosComSinal: 0 })).toBeNull();
    expect(erroDosRecebimentos({ escolha: 'mercadopago', conectado: true, chave: '', servicosComSinal: 2 })).toBeNull();
    expect(erroDosRecebimentos({ escolha: 'nenhum', conectado: false, chave: '', servicosComSinal: 0 })).toBeNull();
  });
});

describe('EtapaRecebimentos', () => {
  it('sem conexão mostra as opções, com Asaas e PagBank em breve e desabilitados', () => {
    renderEtapa();
    expect(screen.getByRole('heading', { name: 'Como você quer receber o sinal?' })).toBeInTheDocument();
    for (const nome of [/Mercado Pago/, /InfinitePay/, /Asaas/, /PagBank/, /Pix manual/, /Não vou cobrar sinal agora/]) {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument();
    }
    for (const nome of [/Asaas/, /PagBank/]) {
      const b = screen.getByRole('button', { name: nome });
      expect(b).toBeDisabled();
      expect(b).toHaveTextContent('Em breve');
    }
    expect(screen.getByRole('button', { name: /Mercado Pago/ })).toBeEnabled();
    expect(screen.queryByText('Quais serviços exigem sinal?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  it('Pix com chave mostra a lista de sinal e salva chave e sinais', async () => {
    const user = userEvent.setup();
    const p = renderEtapa();
    await user.click(screen.getByRole('button', { name: /Pix manual/ }));
    expect(screen.queryByText('Quais serviços exigem sinal?')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a chave Pix.');

    await user.selectOptions(screen.getByLabelText('Tipo de chave'), 'email');
    await user.type(screen.getByLabelText('Chave Pix'), ' ana@studio.com ');
    expect(screen.getByText('Quais serviços exigem sinal?')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Exigir sinal em Corte/ }));
    expect(screen.getByLabelText(/Sinal de Corte/)).toHaveValue(30);
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(p.onSalvar).toHaveBeenCalledWith({
      chavePix: { chave: 'ana@studio.com', tipo: 'email' },
      servicos: [{ id: 's1', sinalPct: 30 }, { id: 's2', sinalPct: null }],
    });
  });

  it('com o Mercado Pago conectado mostra Conectado e a lista de sinal, sem chave Pix', async () => {
    const user = userEvent.setup();
    const p = renderEtapa({
      recebimentos: { conexao: { gateway: 'mercadopago', contaNome: 'Ana MP', situacao: 'ativa' }, temChavePix: false },
      servicos: [SERVICOS[0], { ...SERVICOS[1], sinalPct: 50 }],
    });
    expect(screen.getByText('Ana MP')).toBeInTheDocument();
    expect(screen.getAllByText('Conectado').length).toBeGreaterThan(0);
    expect(screen.getByText('Quais serviços exigem sinal?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chave Pix')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /InfinitePay/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(p.onSalvar).toHaveBeenCalledWith({ servicos: [{ id: 's1', sinalPct: null }, { id: 's2', sinalPct: 50 }] });
  });

  it('Configurar depois chama onPular', async () => {
    const user = userEvent.setup();
    const p = renderEtapa();
    await user.click(screen.getByRole('button', { name: 'Configurar depois' }));
    expect(p.onPular).toHaveBeenCalled();
    expect(p.onSalvar).not.toHaveBeenCalled();
  });

  it('Conectar com o Mercado Pago pede a URL com a origem onboarding', async () => {
    const user = userEvent.setup();
    mocks.conectar.mockResolvedValue({ url: 'https://mp.example/auth' });
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      renderEtapa();
      await user.click(screen.getByRole('button', { name: /Mercado Pago/ }));
      await user.click(screen.getByRole('button', { name: 'Conectar com o Mercado Pago' }));
      expect(mocks.conectar).toHaveBeenCalledWith('onboarding');
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mp.example/auth'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
