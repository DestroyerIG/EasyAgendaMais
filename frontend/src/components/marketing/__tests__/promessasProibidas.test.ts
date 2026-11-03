import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Frases que as páginas de venda já prometeram e o sistema não cumpre (H3). Cada linha
// trava a volta da promessa falsa, inclusive por cópia de um arquivo para outro.
const PROIBIDAS: { arquivo: string; frases: RegExp[] }[] = [
  {
    arquivo: 'src/app/page.tsx',
    frases: [
      /valor fixo/, /confirmado em segundos/, /simultâneo/, /Preenchido em/, /24h e 2h/, /Radar de Retorno/,
      /todos os recursos da plataforma/, /praticamente zera/, /Junte-se a/,
    ],
  },
  { arquivo: 'src/components/marketing/PublicFooter.tsx', frases: [/Conformidade LGPD/, /Radar de Retorno/] },
  { arquivo: 'src/components/marketing/landing/Hero.tsx', frases: [/Dados protegidos LGPD/] },
  { arquivo: 'src/components/marketing/PricingPlansSection.tsx', frases: [/Suporte prioritário/, /Radar de Retorno/] },
  { arquivo: 'src/components/marketing/landing/RoiCalculator.tsx', frases: [/24h e 2h/, /recupera até/] },
];

const raiz = resolve(__dirname, '../../../..');
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf-8');

function arquivosEm(pasta: string): string[] {
  return readdirSync(join(raiz, pasta)).flatMap((nome) => {
    const caminho = `${pasta}/${nome}`;
    if (statSync(join(raiz, caminho)).isDirectory()) return nome === '__tests__' ? [] : arquivosEm(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const ARQUIVOS_DE_VENDA = [
  'src/app/page.tsx',
  'src/app/nail-designers/page.tsx',
  'src/app/pagamento/page.tsx',
  ...arquivosEm('src/components/marketing'),
];

describe('páginas de venda', () => {
  it.each(PROIBIDAS)('$arquivo não traz promessa que o sistema não cumpre', ({ arquivo, frases }) => {
    const texto = ler(arquivo);
    for (const frase of frases) expect(texto, `${arquivo}: ${frase}`).not.toMatch(frase);
  });

  it.todo('nenhum arquivo de venda usa ícones lucide');
});
