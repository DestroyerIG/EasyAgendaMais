import type { CSSProperties } from 'react';

// Tema do negócio (DESIGN.md): na página pública, a cor escolhida substitui o brand. O texto sobre
// ela e o texto na cor dela são calculados para manter o contraste mínimo AA.

type Rgb = [number, number, number];

const INK: Rgb = [26, 24, 23];
const BRANCO: Rgb = [255, 255, 255];
const FUNDO: Rgb = [246, 245, 244];
const CONTRASTE_AA = 4.5;

const paraRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const luminancia = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contraste = (a: Rgb, b: Rgb): number => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};

/** Escurece a cor aos poucos até ela atingir o contraste AA com a referência. */
const escurecerAte = (cor: Rgb, referencia: Rgb): Rgb => {
  let atual = cor;
  while (contraste(atual, referencia) < CONTRASTE_AA) {
    atual = atual.map((canal) => Math.floor(canal * 0.97)) as Rgb;
  }
  return atual;
};

const comoToken = (rgb: Rgb): string => rgb.join(' ');

/** Variáveis de cor do negócio; sem cor válida, a página segue com o brand padrão. */
export function temaDoNegocio(cor: string | null | undefined): CSSProperties | undefined {
  if (!cor || !/^#[0-9a-f]{6}$/i.test(cor)) return undefined;
  const rgb = paraRgb(cor);
  const textoSobreCor = contraste(rgb, INK) >= contraste(rgb, BRANCO) ? INK : BRANCO;
  // Tons médios não chegam a AA com texto claro nem escuro: escurece só o necessário para o texto claro.
  const legivel = contraste(rgb, textoSobreCor) >= CONTRASTE_AA;
  return {
    '--color-brand': comoToken(legivel ? rgb : escurecerAte(rgb, BRANCO)),
    '--color-on-brand': comoToken(legivel ? textoSobreCor : BRANCO),
    '--color-brand-text': comoToken(escurecerAte(rgb, FUNDO)),
  } as CSSProperties;
}
