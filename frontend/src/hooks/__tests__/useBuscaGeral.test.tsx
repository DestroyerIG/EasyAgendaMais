import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoBusca } from '@/lib/busca';
import { useBuscaGeral } from '../useBuscaGeral';

const m = vi.hoisted(() => ({ push: vi.fn(), buscar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/lib/busca', async (orig) => {
  const real = await orig<typeof import('@/lib/busca')>();
  return { ...real, buscaApi: { buscar: m.buscar } };
});

const vazio: ResultadoBusca = { clientes: [], agendamentos: [] };
const comCliente: ResultadoBusca = { clientes: [{ id: 'c1', nome: 'Carla', telefone: '83999998888' }], agendamentos: [] };

const tecla = (key: string) => ({ key, preventDefault: vi.fn() }) as never;

function montar(aoEscolher?: () => void) {
  return renderHook(() => useBuscaGeral({ aoEscolher }));
}
const digitar = (r: ReturnType<typeof montar>, v: string) => act(() => r.result.current.setTermo(v));
const passar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useBuscaGeral', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    m.push.mockReset();
    m.buscar.mockReset().mockResolvedValue(vazio);
  });
  afterEach(() => vi.useRealTimers());

  it('não busca abaixo do mínimo', async () => {
    const r = montar();
    digitar(r, 'a');
    await passar(500);
    expect(m.buscar).not.toHaveBeenCalled();
    expect(r.result.current.status).toBe('ocioso');
  });

  it('faz um pedido só para vários toques seguidos, 250 ms depois do último', async () => {
    const r = montar();
    digitar(r, 'ca');
    await passar(200);
    digitar(r, 'car');
    await passar(200);
    digitar(r, 'carl');
    await passar(249);
    expect(m.buscar).not.toHaveBeenCalled();
    await passar(1);
    expect(m.buscar).toHaveBeenCalledTimes(1);
    expect(m.buscar.mock.calls[0][0]).toBe('carl');
  });

  it('mostra as telas na hora, antes da resposta do servidor', () => {
    const r = montar();
    digitar(r, 'caixa');
    expect(r.result.current.itens[0].href).toBe('/financeiro');
    expect(r.result.current.status).toBe('buscando');
  });

  it('resposta antiga não sobrescreve a nova', async () => {
    let resolverA!: (v: ResultadoBusca) => void;
    m.buscar.mockImplementationOnce(() => new Promise((res) => { resolverA = res; }));
    m.buscar.mockResolvedValueOnce(comCliente);
    const r = montar();
    digitar(r, 'ca');
    await passar(250);
    digitar(r, 'car');
    await passar(250);
    expect(r.result.current.itens.map((i) => i.titulo)).toContain('Carla');
    await act(async () => resolverA({ clientes: [{ id: 'x', nome: 'Velho', telefone: '1' }], agendamentos: [] }));
    expect(r.result.current.itens.map((i) => i.titulo)).toContain('Carla');
    expect(r.result.current.itens.map((i) => i.titulo)).not.toContain('Velho');
  });

  it('apagar para abaixo do mínimo cancela o pedido e limpa a lista', async () => {
    m.buscar.mockResolvedValue(comCliente);
    const r = montar();
    digitar(r, 'car');
    await passar(250);
    expect(r.result.current.itens.some((i) => i.grupo === 'clientes')).toBe(true);
    digitar(r, 'c');
    expect(r.result.current.itens.some((i) => i.grupo === 'clientes')).toBe(false);
    expect(r.result.current.status).toBe('ocioso');
    digitar(r, 'ca');
    digitar(r, 'c');
    await passar(500);
    expect(m.buscar).toHaveBeenCalledTimes(1);
  });

  it('corta o termo em 80 caracteres', () => {
    const r = montar();
    digitar(r, 'a'.repeat(120));
    expect(r.result.current.termo).toHaveLength(80);
  });

  it('falha vira status erro e mantém as telas', async () => {
    m.buscar.mockRejectedValue(new Error('rede'));
    const r = montar();
    digitar(r, 'caixa');
    await passar(250);
    expect(r.result.current.status).toBe('erro');
    expect(r.result.current.itens[0].href).toBe('/financeiro');
  });

  it('402 vira status bloqueada e mantém as telas', async () => {
    m.buscar.mockRejectedValue({ response: { status: 402 } });
    const r = montar();
    digitar(r, 'caixa');
    await passar(250);
    expect(r.result.current.status).toBe('bloqueada');
    expect(r.result.current.itens[0].href).toBe('/financeiro');
  });

  it('setas andam em volta da lista e o ativo volta a 0 quando o termo muda', () => {
    const r = montar();
    digitar(r, 'ag');
    const total = r.result.current.itens.length;
    expect(total).toBeGreaterThan(1);
    act(() => r.result.current.aoTeclar(tecla('ArrowUp')));
    expect(r.result.current.ativo).toBe(total - 1);
    act(() => r.result.current.aoTeclar(tecla('ArrowDown')));
    expect(r.result.current.ativo).toBe(0);
    act(() => r.result.current.aoTeclar(tecla('ArrowDown')));
    expect(r.result.current.ativo).toBe(1);
    digitar(r, 'cai');
    expect(r.result.current.ativo).toBe(0);
  });

  it('Enter abre o item ativo, limpa o termo, fecha e chama aoEscolher', () => {
    const aoEscolher = vi.fn();
    const r = montar(aoEscolher);
    digitar(r, 'caixa');
    act(() => r.result.current.aoTeclar(tecla('Enter')));
    expect(m.push).toHaveBeenCalledWith('/financeiro');
    expect(r.result.current.termo).toBe('');
    expect(r.result.current.aberta).toBe(false);
    expect(aoEscolher).toHaveBeenCalledTimes(1);
  });

  it('Enter sem itens não faz nada', () => {
    const aoEscolher = vi.fn();
    const r = montar(aoEscolher);
    digitar(r, 'zzzz');
    act(() => r.result.current.aoTeclar(tecla('Enter')));
    expect(m.push).not.toHaveBeenCalled();
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('Esc fecha a lista e mantém o termo', () => {
    const r = montar();
    digitar(r, 'caixa');
    expect(r.result.current.aberta).toBe(true);
    act(() => r.result.current.aoTeclar(tecla('Escape')));
    expect(r.result.current.aberta).toBe(false);
    expect(r.result.current.termo).toBe('caixa');
  });

  it('um caractere deixa a lista fechada e sem itens', () => {
    const r = montar();
    digitar(r, 'a');
    expect(r.result.current.aberta).toBe(false);
    expect(r.result.current.itens).toEqual([]);
    expect(r.result.current.status).toBe('ocioso');
  });

  it('ao mudar o termo, os resultados do termo anterior saem e Enter não abre o cliente antigo', async () => {
    m.buscar.mockResolvedValue(comCliente);
    const r = montar();
    digitar(r, 'carla');
    await passar(250);
    expect(r.result.current.itens[0].href).toBe('/clientes/c1');
    digitar(r, 'carlo');
    expect(r.result.current.status).toBe('buscando');
    expect(r.result.current.itens.every((i) => i.grupo === 'telas')).toBe(true);
    act(() => r.result.current.aoTeclar(tecla('Enter')));
    expect(m.push).not.toHaveBeenCalledWith('/clientes/c1');
  });
});
