// Regras que impedem cores fixas nos arquivos já migrados para os tokens do DESIGN.md.
// Lista de bloqueio: qualquer nome de token (inclusive os da família Material 3 —
// surface-m3, brand-text-m3, tertiary, tertiary-container) passa por padrão, pois
// nenhuma regra abaixo o reconhece; só cor Tailwind padrão, hexadecimal solto e
// classes legadas (primary, dark, dark-light, dark-lighter) são reprovados.
const COLOR_WORDS =
  'gray|zinc|neutral|slate|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX =
  '(?:bg|text|border|ring|ring-offset|from|via|to|divide|placeholder|outline|fill|stroke|shadow|decoration|accent|caret)';
const BEFORE = '(?<![\\w-])';
const AFTER = '(?![\\w-])';

const RULES: readonly RegExp[] = [
  new RegExp(`${BEFORE}${PREFIX}-(?:${COLOR_WORDS})-\\d{2,3}(?:\\/\\d+)?${AFTER}`, 'g'),
  new RegExp(`${BEFORE}${PREFIX}-(?:white|black)(?:\\/\\d+)?${AFTER}`, 'g'),
  new RegExp(`${BEFORE}${PREFIX}-primary(?:\\/\\d+)?${AFTER}`, 'g'),
  new RegExp(`${BEFORE}${PREFIX}-dark(?:-light|-lighter)?(?:\\/\\d+)?${AFTER}`, 'g'),
  new RegExp(`${BEFORE}${PREFIX}-\\[(?:#|rgba?\\(|hsla?\\()[^\\]]*\\]`, 'g'),
  new RegExp(`${BEFORE}bg-\\[(?:radial|linear|conic)-gradient[^\\]]*\\]`, 'g'),
];

export interface ColorViolation {
  line: number;
  match: string;
}

export function findColorViolations(source: string): ColorViolation[] {
  const violations: ColorViolation[] = [];
  source.split('\n').forEach((text, index) => {
    for (const rule of RULES) {
      for (const found of text.matchAll(rule)) {
        violations.push({ line: index + 1, match: found[0] });
      }
    }
  });
  return violations;
}
