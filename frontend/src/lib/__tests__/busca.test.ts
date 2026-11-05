import { describe, expect, it } from 'vitest';
import { montarItens, podeBuscar, rotuloQuando } from '../busca';

describe('podeBuscar', () => {
  it('exige 2 caracteres, ou 3 para telefone', () => {
    expect(podeBuscar('a')).toBe(false);
    expect(podeBuscar('an')).toBe(true);
    expect(podeBuscar('  a  ')).toBe(false);
    expect(podeBuscar('83')).toBe(false);
    expect(podeBuscar('839')).toBe(true);
    expect(podeBuscar('(83')).toBe(false);
  });
});

describe('rotuloQuando', () => {
  it('usa Hoje, Amanhã e datas curtas', () => {
    expect(rotuloQuando('2026-11-05', '14:30', '2026-11-05')).toBe('Hoje, 14:30');
    expect(rotuloQuando('2026-11-06', '14:30', '2026-11-05')).toBe('Amanhã, 14:30');
    expect(rotuloQuando('2026-10-12', '09:00', '2026-11-05')).toBe('12/10, 09:00');
    expect(rotuloQuando('2025-10-12', '09:00', '2026-11-05')).toBe('12/10/2025, 09:00');
  });
  it('amanhã vira o mês', () => {
    expect(rotuloQuando('2026-12-01', '10:00', '2026-11-30')).toBe('Amanhã, 10:00');
  });
});

describe('montarItens', () => {
  const tela = { chave: 't', grupo: 'telas' as const, titulo: 'Caixa', href: '/financeiro' };
  const itens = montarItens(
    {
      clientes: [{ id: 'c1', nome: 'Carla Souza', telefone: '83999998888' }],
      agendamentos: [{ id: 'a1', data: '2026-11-06', hora: '14:30', status: 'confirmed', clienteNome: 'Carla Souza', servicoNome: 'Corte', profissionalNome: 'João' }],
    },
    [tela],
    '2026-11-05',
  );
  it('ordena clientes, agendamentos e telas', () => {
    expect(itens.map((i) => i.grupo)).toEqual(['clientes', 'agendamentos', 'telas']);
  });
  it('monta cliente', () => {
    expect(itens[0]).toMatchObject({ href: '/clientes/c1', detalhe: '(83) 99999-8888' });
  });
  it('monta agendamento', () => {
    expect(itens[1]).toMatchObject({
      href: '/agendamentos?data=2026-11-06&agendamento=a1',
      titulo: 'Carla Souza · Corte',
      detalhe: 'Amanhã, 14:30 · João',
    });
  });
});
