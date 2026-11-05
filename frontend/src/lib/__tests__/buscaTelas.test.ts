import { describe, expect, it } from 'vitest';
import { filtrarTelas } from '../buscaTelas';

describe('filtrarTelas', () => {
  it('acha pelo rótulo', () => {
    expect(filtrarTelas('caixa', 'Clientes')[0].href).toBe('/financeiro');
  });
  it('acha por sinônimo', () => {
    expect(filtrarTelas('financeiro', 'Clientes')[0].titulo).toBe('Caixa');
  });
  it('ignora acento', () => {
    expect(filtrarTelas('configuracoes', 'Clientes')[0].titulo).toBe('Ajustes');
  });
  it('acha a ação de novo agendamento', () => {
    expect(filtrarTelas('novo', 'Clientes')[0].href).toBe('/agendamentos?novo=1');
  });
  it('corta em 4', () => {
    expect(filtrarTelas('a', 'Clientes').length).toBeLessThanOrEqual(4);
  });
  it('usa o vocabulário do segmento', () => {
    expect(filtrarTelas('clientes', 'Clientas')[0].titulo).toBe('Clientas');
  });
  it('termo vazio não devolve telas', () => {
    expect(filtrarTelas('  ', 'Clientes')).toEqual([]);
  });
});
