import { describe, expect, it } from 'vitest';
import { conteudoDemo } from '../conteudoDemo';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** Uma string "parece data" se traz nome de mês, "de 20xx" ou o padrão dd/mm/aaaa. */
const pareceData = (valor: string): boolean => {
  const valorMinusculo = valor.toLowerCase();
  const temMes = MESES.some((mes) => valorMinusculo.includes(mes));
  const temDeAno = /\bde 20\d{2}\b/.test(valorMinusculo);
  const temDataNumerica = /\b\d{2}\/\d{2}\/\d{4}\b/.test(valor);
  return temMes || temDeAno || temDataNumerica;
};

/** Percorre o módulo (objetos e arrays) e junta todos os valores string encontrados. */
const coletarStrings = (valor: unknown, acc: string[] = []): string[] => {
  if (typeof valor === 'string') {
    acc.push(valor);
  } else if (Array.isArray(valor)) {
    valor.forEach((item) => coletarStrings(item, acc));
  } else if (valor !== null && typeof valor === 'object') {
    Object.values(valor).forEach((item) => coletarStrings(item, acc));
  }
  return acc;
};

describe('conteudoDemo', () => {
  it('cobre as quatro áreas do painel', () => {
    expect(Object.keys(conteudoDemo).sort()).toEqual(
      ['clientes', 'hoje', 'plano', 'whatsapp'],
    );
  });

  it('não usa nomes de plano proibidos', () => {
    expect(JSON.stringify(conteudoDemo)).not.toMatch(/\bPro\b/);
  });

  it('não traz datas fora de 2026', () => {
    const datas = coletarStrings(conteudoDemo).filter(pareceData);
    const anosForaDe2026 = datas
      .flatMap((data) => data.match(/\b20\d{2}\b/g) ?? [])
      .filter((ano) => ano !== '2026');
    expect(anosForaDe2026).toEqual([]);
  });
});
