import { describe, it, expect } from 'vitest';
import { linhaCsv } from '../modules/crm/csv.js';

describe('linhaCsv', () => {
  it('separa por ponto e vírgula', () => {
    expect(linhaCsv(['Ana', '83999990000', 120.5])).toBe('Ana;83999990000;120,50');
  });
  it('protege ; aspas e quebra de linha', () => {
    expect(linhaCsv(['Ana; Maria', 'diz "oi"', 'linha1\nlinha2'])).toBe('"Ana; Maria";"diz ""oi""";"linha1\nlinha2"');
  });
  it('neutraliza fórmulas com apóstrofo antes do escape', () => {
    expect(linhaCsv(['=1+1', '+55', '-2', '@SOMA(A1)'])).toBe("'=1+1;'+55;'-2;'@SOMA(A1)");
    expect(linhaCsv(['\tx'])).toBe("'\tx");
    expect(linhaCsv(['\rx'])).toBe('"\'\rx"');
    expect(linhaCsv(['=HYPERLINK("http://x";"Clique")'])).toBe('"\'=HYPERLINK(""http://x"";""Clique"")"');
  });
  it('vazio para null', () => {
    expect(linhaCsv([null, 'x'])).toBe(';x');
  });
});
