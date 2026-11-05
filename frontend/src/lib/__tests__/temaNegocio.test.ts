import { describe, expect, it } from 'vitest';
import { contraste, temaDoNegocio } from '../temaNegocio';

const rgbDe = (tema: ReturnType<typeof temaDoNegocio>, token: string) =>
  String((tema as Record<string, string>)[token]).split(' ').map(Number) as [number, number, number];

describe('temaDoNegocio', () => {
  it('sem cor válida mantém o brand padrão', () => {
    expect(temaDoNegocio(null)).toBeUndefined();
    expect(temaDoNegocio('')).toBeUndefined();
    expect(temaDoNegocio('laranja')).toBeUndefined();
    expect(temaDoNegocio('#FFF')).toBeUndefined();
  });

  it('aplica a cor do negócio no token brand', () => {
    expect(temaDoNegocio('#1B3A6B')).toMatchObject({ '--color-brand': '27 58 107' });
  });

  it('escurece só um pouco os tons médios, que não têm contraste com nenhum texto', () => {
    const tema = temaDoNegocio('#C2554D');
    const [vermelho] = rgbDe(tema, '--color-brand');
    expect(vermelho).toBeLessThan(194);
    expect(vermelho).toBeGreaterThan(170);
    expect(tema).toMatchObject({ '--color-on-brand': '255 255 255' });
  });

  it('usa texto escuro sobre cor clara e texto claro sobre cor escura', () => {
    expect(temaDoNegocio('#FFD400')).toMatchObject({ '--color-on-brand': '26 24 23' });
    expect(temaDoNegocio('#1B3A6B')).toMatchObject({ '--color-on-brand': '255 255 255' });
  });

  it.each(['#FFD400', '#FF7A00', '#7FE3C2', '#FFFFFF', '#C2554D', '#1B3A6B'])(
    'mantém contraste AA no texto sobre %s e no texto nessa cor',
    (cor) => {
      const tema = temaDoNegocio(cor);
      expect(contraste(rgbDe(tema, '--color-brand'), rgbDe(tema, '--color-on-brand'))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(rgbDe(tema, '--color-brand-text'), [246, 245, 244])).toBeGreaterThanOrEqual(4.5);
    },
  );
});
