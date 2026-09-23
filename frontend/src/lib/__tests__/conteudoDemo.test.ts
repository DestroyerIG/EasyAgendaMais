import { describe, expect, it } from 'vitest';
import { conteudoDemo } from '../conteudoDemo';

describe('conteudoDemo', () => {
  it('cobre as seis áreas do painel', () => {
    expect(Object.keys(conteudoDemo).sort()).toEqual(
      ['agenda', 'caixa', 'clientes', 'hoje', 'plano', 'whatsapp'],
    );
  });

  it('não usa nomes de plano proibidos', () => {
    expect(JSON.stringify(conteudoDemo)).not.toMatch(/\bPro\b/);
  });

  it('não traz datas fora de 2026', () => {
    const anos = JSON.stringify(conteudoDemo).match(/\b20\d{2}\b/g) ?? [];
    expect([...new Set(anos)]).toEqual(expect.arrayContaining([]));
    expect(anos.filter((ano) => ano !== '2026')).toEqual([]);
  });
});
