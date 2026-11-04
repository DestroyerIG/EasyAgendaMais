import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Frases que as páginas de venda já prometeram e o sistema não cumpre (H3). Todas valem para
// todos os arquivos de venda: uma promessa falsa não volta nem por cópia de um arquivo para outro.
const PROIBIDAS: RegExp[] = [
  /valor fixo/, /confirmado em segundos/, /simultâneo/, /Preenchido em/, /24h e 2h/, /Radar de Retorno/,
  /todos os recursos da plataforma/, /praticamente zera/, /Junte-se a/,
  /comprovante/, /taxa de deslocamento por região/, /18 a 21 dias/, /pelo WhatsApp\. Sem dados/,
  /Inovação exclusiva/, /R\$ 20, R\$ 30/, /também pode agendar/, /vai direto para o cadastro/,
  /Conformidade LGPD/, /Dados protegidos LGPD/, /Suporte prioritário/, /recupera até/,
  /Te avisamos 24h antes/, /Pix Copia e Cola/, /Sinal confirmado/,
  // Salão sob consulta: nenhum preço fixo do Salão nas telas de venda.
  /199[,.]9/,
  // Teste grátis: 7 dias sem cartão ou 14 com cartão; nunca "14 dias" sem cartão.
  /14 dias grátis no cadastro/, /sem cartão obrigatório/, /14 dias de acesso gratuito/, /Teste grátis de 14 dias/, /Testar 14 dias/,
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
  it.each(ARQUIVOS_DE_VENDA)('%s não traz promessa que o sistema não cumpre', (arquivo) => {
    const texto = ler(arquivo);
    for (const frase of PROIBIDAS) expect(texto, `${arquivo}: ${frase}`).not.toMatch(frase);
  });

  it('nenhum arquivo de venda usa ícones lucide', () => {
    for (const arquivo of ARQUIVOS_DE_VENDA) expect(ler(arquivo), arquivo).not.toMatch(/from 'lucide-react'/);
  });
});
