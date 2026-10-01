# Telas idênticas ao Stitch — plano de implementação

> **Para quem executa:** SUB-HABILIDADE OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas de seleção (`- [ ]`).

**Objetivo:** reimplementar as dez telas do painel que têm referência no Stitch, de modo que, abertas lado a lado com o HTML de referência, a diferença seja imperceptível.

**Arquitetura:** os arquivos em `docs/design/stitch/*.html` são a fonte da verdade visual. A camada de tokens ganha a família Material 3 dos exports, ao lado dos tokens atuais. Todo valor que o sistema ainda não calcula vem de um módulo único de conteúdo de exemplo. Comportamento, rotas, chamadas à API e validações não mudam.

**Tecnologias:** Next.js 15 (App Router), React 18, Tailwind 3.4 com tokens em variáveis CSS, Radix, Vitest, Material Symbols Outlined hospedada localmente.

**Especificação:** `docs/superpowers/specs/2026-09-23-telas-stitch-design.md`
**Levantamento das telas:** `docs/design/stitch/INVENTARIO.md` (estrutura, blocos, textos, ícones, cores, estados de cada tela)

## Global Constraints

- A forma, a paleta, a tipografia, os ícones, os rótulos e o espaçamento vêm do arquivo do Stitch da tela. Abra o HTML; o `INVENTARIO.md` é atalho, não substituto.
- O texto visível é copiado palavra por palavra do arquivo de referência, exceto o que as regras de conteúdo abaixo mandam mudar.
- Regras de conteúdo que vencem o Stitch: planos são **Solo**, **Equipe** e **Salão** (nunca "Pro"); **não existe item "Funil CRM"** no menu; nada específico de um segmento (unhas, cabelo, barba); datas em **2026**; sem emoji; português do Brasil.
- Maiúsculas com espaçamento entre letras **são permitidas** onde o arquivo de referência usa. A regra contrária no `DESIGN.md` é corrigida na Tarefa 12.
- Nenhum valor inventado fora de `frontend/src/lib/conteudoDemo.ts`.
- Comportamento preservado: mesmas chamadas à API, mesmos handlers, mesmos estados, mesmas validações, mesmas rotas. Só a apresentação muda.
- Sem cor fixa: todo hexadecimal do arquivo de referência vira token antes de entrar no código.
- Tema claro e escuro seguindo o aparelho, usando os pares claro/escuro que os próprios exports declaram.
- Ícones: Material Symbols Outlined, fonte local, sem chamada ao Google. Vale também para a tela de Caixa, cujo export usa ícones em traço.
- Checagem padrão de cada tarefa, dentro de `frontend/`:
  - `npx vitest run`
  - `npx tsc --noEmit`
  - `npm run build`
  - diferença de comportamento: `git diff <BASE> -- <arquivos> | grep -E '^[-+][^-+].*(api\.|await |fetch\(|useEffect\(|set[A-Z][A-Za-z]*\()'` — cada ocorrência precisa ser movimentação ou reembrulho, justificada no relatório.
- Commits em inglês, no imperativo, como no restante do repositório.

---

### Tarefa 1: Camada de tokens e fonte de ícones

**Arquivos:**
- Modificar: `frontend/src/styles/globals.css`, `frontend/tailwind.config.js`, `frontend/src/lib/colorRules.ts`, `frontend/src/__tests__/themeCompliance.test.ts`, `frontend/package.json`
- Criar: `frontend/src/components/ui/Icon.tsx`, `frontend/src/components/ui/__tests__/Icon.test.tsx`

**Interfaces:**
- Produz: `<Icon name="today" size={20} filled />` — componente único de ícone usado por todas as telas; `name` é o nome do Material Symbol, `size` o tamanho em pixels (padrão 20), `filled` liga o eixo `FILL` da fonte.

- [ ] **Passo 1: Instalar a fonte de ícones**

```bash
cd frontend && npm install material-symbols@^0.47.5
```

O pacote traz os arquivos `.woff2`. A fonte é carregada localmente, nunca pelo Google.

- [ ] **Passo 2: Declarar a fonte**

Em `frontend/src/styles/globals.css`, antes das camadas, com o caminho do pacote instalado:

```css
@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  font-display: block;
  src: url('material-symbols/material-symbols-outlined.woff2') format('woff2');
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}

.material-symbols-outlined.fill {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

Se o caminho do `url()` não resolver pelo bundler, importe o CSS do pacote em `globals.css` com `@import 'material-symbols/outlined.css';` e mantenha só as duas classes acima. Registre no relatório qual das duas formas funcionou.

- [ ] **Passo 3: Escrever o teste do componente de ícone**

Em `frontend/src/components/ui/__tests__/Icon.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon';

describe('Icon', () => {
  it('renderiza o nome do símbolo como conteúdo e esconde de leitores de tela', () => {
    render(<Icon name="today" />);
    const icon = screen.getByText('today');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('material-symbols-outlined');
  });

  it('aplica tamanho e preenchimento', () => {
    render(<Icon name="loyalty" size={24} filled />);
    const icon = screen.getByText('loyalty');
    expect(icon).toHaveClass('fill');
    expect(icon).toHaveStyle({ fontSize: '24px' });
  });
});
```

- [ ] **Passo 4: Rodar o teste e ver falhar**

Rode: `cd frontend && npx vitest run src/components/ui/__tests__/Icon.test.tsx`
Esperado: falha por não encontrar `../Icon`.

- [ ] **Passo 5: Implementar o componente**

Em `frontend/src/components/ui/Icon.tsx`:

```tsx
import { cn } from '@/lib/cn';

export interface IconProps {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}

// Ícone Material Symbols. O nome do símbolo é o conteúdo do elemento (ligadura da fonte).
export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: `${size}px` }}
      className={cn('material-symbols-outlined leading-none', filled && 'fill', className)}
    >
      {name}
    </span>
  );
}
```

Exporte `Icon` e `IconProps` em `frontend/src/components/ui/index.ts`.

- [ ] **Passo 6: Rodar o teste e ver passar**

Rode: `cd frontend && npx vitest run src/components/ui/__tests__/Icon.test.tsx`
Esperado: 2 testes passando.

- [ ] **Passo 7: Acrescentar a família Material 3 aos tokens**

Em `globals.css`, dentro de `:root`, acrescente os tokens que os exports declaram e que ainda não existem, em canais RGB. Os valores estão na seção 0.1 do `INVENTARIO.md`; os pares claro/escuro vêm dos próprios arquivos:

```css
    --color-surface-m3: 255 248 246;
    --color-brand-text-m3: 153 71 0;
    --color-tertiary: 0 99 153;
    --color-tertiary-container: 0 168 255;
```

E em `.dark`, os valores escuros correspondentes declarados nos exports (`surface-dark` `#181615`, `bg-dark` `#0E0D0C`, `ink-dark` `#F3F1EF`, `muted-dark` `#A39D97`, `line-dark` `#2E2B28`). Onde um token da família Material 3 tiver o mesmo valor de um token existente, **não crie um token novo**: use o que já existe. Só entram os que divergem, listados acima.

Em `tailwind.config.js`, mapeie cada token novo como os atuais: `'surface-m3': 'rgb(var(--color-surface-m3) / <alpha-value>)'` e assim por diante.

- [ ] **Passo 8: Liberar os tokens novos na conformidade**

Em `frontend/src/lib/colorRules.ts`, acrescente os nomes novos à lista de classes permitidas, mantendo a reprovação de hexadecimal solto e de classe padrão do Tailwind (`text-gray-400`, `bg-white`, `bg-black`, `text-red-600`...). Acrescente um caso de teste por token novo em `frontend/src/lib/__tests__/colorRules.test.ts`, no mesmo formato dos casos existentes.

- [ ] **Passo 9: Checagem e commit**

Rode a checagem padrão.

```bash
git add -A
git commit -m "feat(design): add the material symbols icon font and the reference palette tokens"
```

---

### Tarefa 2: Módulo de conteúdo de exemplo

**Arquivos:**
- Criar: `frontend/src/lib/conteudoDemo.ts`, `frontend/src/lib/__tests__/conteudoDemo.test.ts`

**Interfaces:**
- Produz: `conteudoDemo`, objeto congelado com uma chave por área (`hoje`, `agenda`, `clientes`, `caixa`, `whatsapp`, `plano`), consumido pelas Tarefas 4 a 11.

- [ ] **Passo 1: Levantar os valores**

Percorra o ponto 8 ("Dados que o sistema não tem") de cada seção do `INVENTARIO.md` e o ponto 3 ("Textos"), e reúna cada valor marcado `[dado]` que nenhuma função atual calcula. São cerca de 26 itens.

- [ ] **Passo 2: Escrever o módulo**

Em `frontend/src/lib/conteudoDemo.ts`, com este cabeçalho, palavra por palavra:

```ts
/**
 * Conteúdo de exemplo das telas do painel.
 *
 * NADA AQUI VEM DO BANCO. São os valores que as telas de referência do Stitch
 * mostram, usados nos blocos cujas funções ainda não existem (sub-projetos D a I:
 * clube e pacotes, relatórios, página pública, sinal Pix, automações de WhatsApp).
 *
 * Quando a função correspondente existir, troque o uso deste módulo pelo dado real
 * e apague a chave. Antes de publicar para clientes, decida bloco a bloco: ou o dado
 * é real, ou o bloco sai da tela.
 */
```

Depois, um objeto por área, com os valores exatos do arquivo de referência — por exemplo, para `hoje`, a meta de faturamento (`R$ 1.800`), o percentual (`81%`), a taxa de ocupação (`84%`), a comparação (`+6%`), a receita recuperada (`R$ 2.980`) e as quatro pendências do painel "Precisa de você", cada uma com ícone, título, descrição e rótulo do botão. Tipe tudo explicitamente e feche com `as const`.

- [ ] **Passo 3: Escrever o teste**

Em `frontend/src/lib/__tests__/conteudoDemo.test.ts`, verifique o que protege o módulo de virar bagunça:

```ts
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
```

- [ ] **Passo 4: Rodar e ver passar**

Rode: `cd frontend && npx vitest run src/lib/__tests__/conteudoDemo.test.ts`
Esperado: 3 testes passando.

- [ ] **Passo 5: Checagem e commit**

```bash
git add -A
git commit -m "feat(design): add the sample content module for blocks without real data"
```

---

### Tarefa 3: Casca do painel

**Arquivos:**
- Modificar: `frontend/src/lib/navigation.ts`, `frontend/src/components/shell/Sidebar.tsx`, `frontend/src/components/shell/TopBar.tsx`, `frontend/src/components/shell/BottomNav.tsx`, `frontend/src/components/shell/AppShell.tsx`, `frontend/src/components/shell/AccountMenu.tsx`, `frontend/src/components/shell/MoreSheet.tsx`
- Criar: `frontend/src/app/dashboard/clube/page.tsx`, `frontend/src/app/dashboard/relatorios/page.tsx`, `frontend/src/app/dashboard/minha-pagina/page.tsx`, `frontend/src/components/shell/EmBreve.tsx`
- Modificar: `frontend/src/lib/themedPaths.ts`, `frontend/src/components/shell/__tests__/` (testes existentes da casca)
- Referência: seções 0.3 e 0.4 do `INVENTARIO.md`, `hoje-desktop.html` e `hoje-mobile.html`

**Interfaces:**
- Consome: `Icon` (Tarefa 1).
- Produz: `NAV_ITEMS` com nove itens, cada um com `icon` (nome do Material Symbol); `EmBreve` com props `{ icon: string; titulo: string; descricao: string }`.

- [ ] **Passo 1: Atualizar a navegação**

Em `frontend/src/lib/navigation.ts`, o array passa a ter nove itens, nesta ordem, com estes ícones e destinos:

```ts
{ id: 'hoje', label: 'Hoje', icon: 'today', href: '/dashboard' },
{ id: 'agenda', label: 'Agenda', icon: 'calendar_month', href: '/agendamentos' },
{ id: 'clientes', label: 'Clientes', icon: 'group', href: '/clientes' },
{ id: 'caixa', label: 'Caixa', icon: 'point_of_sale', href: '/financeiro' },
{ id: 'clube', label: 'Clube e pacotes', icon: 'loyalty', href: '/clube' },
{ id: 'whatsapp', label: 'WhatsApp', icon: 'chat', href: '/whatsapp' },
{ id: 'relatorios', label: 'Relatórios', icon: 'bar_chart', href: '/relatorios' },
{ id: 'minha-pagina', label: 'Minha página', icon: 'storefront', href: '/minha-pagina' },
{ id: 'ajustes', label: 'Ajustes', icon: 'settings', href: '/configuracoes' },
```

Os campos existentes (`matches`, `BOTTOM_NAV_IDS`, `MORE_MENU_IDS`, `NEW_APPOINTMENT_HREF`, `SETTINGS_TABS`, `normalizePath`, `getActiveNavItem`, `getNavItem`) continuam com o mesmo formato. Atualize `BOTTOM_NAV_IDS` e `MORE_MENU_IDS` conforme `hoje-mobile.html`: a barra inferior do celular mostra os itens que o arquivo mostra, e o resto vai para o "mais".

Atualize os testes em `frontend/src/lib/__tests__/navigation.test.ts` para os nove itens, mantendo as asserções de ordem e de destino.

- [ ] **Passo 2: Portar a barra lateral**

`Sidebar.tsx` passa a seguir `hoje-desktop.html`: largura fixa `w-[248px]`, `bg-surface`, `border-r border-line`, `flex flex-col justify-between`. Cabeçalho de `h-16` com `border-b border-line` e `px-5`, logo quadrado `w-8 h-8 rounded-xl bg-brand/10 border border-brand/20` com o "+" em `text-brand`, nome "EasyAgenda" com o "+" destacado e subtítulo "Gestão de Beleza" em `text-[11px] text-muted`. Navegação em `flex flex-col gap-1 p-3`, item `flex items-center gap-3 px-3 py-2.5 rounded-xl`, ícone de 20px, rótulo de 14px; item ativo com `bg-surface-2 text-ink font-bold` e ícone em `text-brand fill`; inativo com `text-muted hover:text-ink hover:bg-surface-2/60 font-semibold`. Rodapé em `p-3 border-t border-line` com o cartão do negócio: inicial, nome do negócio, nome do plano (vindo do plano real do usuário, traduzido para Solo, Equipe ou Salão) e ícone `unfold_more`.

- [ ] **Passo 3: Portar a barra superior**

`TopBar.tsx` segue a seção 0.3 do `INVENTARIO.md`: `h-16`, `bg-surface` com `backdrop-blur`, `border-b border-line`, deslocada `pl-[248px]` no computador. À esquerda, caminho de navegação com o nome do negócio, separador e a página atual. À direita, busca de `w-64` com ícone `search` e o placeholder que o arquivo da tela usa, sino `notifications` em botão `w-9 h-9 rounded-xl` com ponto de não lida, e a pílula do usuário: avatar de 32px com as iniciais, nome e cargo ("Administradora" para `tenant_admin`).

A busca e o sino ainda não têm função. Ligue a busca ao filtro da tela onde ele já existe (Clientes e Agenda) e, onde não existir, deixe o campo desabilitado com `title` explicando que a busca da tela chega junto com a área. O sino abre o menu da conta existente. Nada de botão que não faz nada e não se explica.

- [ ] **Passo 4: Criar as três páginas "em breve"**

`EmBreve.tsx` renderiza, centralizado na área de conteúdo, um ícone de 40px em `text-muted`, um título de 24px peso 700 e uma frase em `text-muted`. As três páginas usam:

- `/clube`: ícone `loyalty`, título "Clube e pacotes", frase "Assinaturas, pacotes de sessões e benefícios para clientes fiéis chegam em breve."
- `/relatorios`: ícone `bar_chart`, título "Relatórios", frase "Relatórios de faturamento, ocupação e desempenho da equipe chegam em breve."
- `/minha-pagina`: ícone `storefront`, título "Minha página", frase "A página pública do seu negócio, com agendamento online, chega em breve."

Cada página usa o mesmo `AppShell` das demais.

- [ ] **Passo 5: Registrar e verificar**

Acrescente a `frontend/src/lib/themedPaths.ts`: `'src/app/dashboard/clube'`, `'src/app/dashboard/relatorios'`, `'src/app/dashboard/minha-pagina'`. Rode a checagem padrão com `<BASE>` no commit anterior.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "feat(shell): rebuild the sidebar and top bar from the reference screens"
```

---

### Tarefa 4: Hoje

**Arquivos:**
- Modificar: `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/DashboardCards.tsx`, `frontend/src/components/WeeklyChart.tsx`, `frontend/src/components/ProfitBar.tsx`
- Criar: `frontend/src/components/dashboard/SaudacaoDia.tsx`, `frontend/src/components/dashboard/PainelPendencias.tsx`
- Referência: `hoje-desktop.html`, `hoje-mobile.html`, seções 1 e 2 do `INVENTARIO.md`

- [ ] **Passo 1: Saudação**

`SaudacaoDia.tsx` mostra "Bom dia", "Boa tarde" ou "Boa noite" conforme a hora, com o primeiro nome do usuário logado, e abaixo a data por extenso em `text-muted`, no formato do arquivo de referência ("terça, 17 de setembro de 2026" vira a data de hoje). Nenhum dado de exemplo: nome e data são reais.

- [ ] **Passo 2: Cartões de métrica**

`DashboardCards.tsx` passa à anatomia do arquivo: título de 13px peso 600 em `text-muted` com o ícone à direita, valor de 32px peso 700, legenda de 12px em `text-muted`. Quatro cartões, na ordem do arquivo:

| Cartão | Valor | Origem |
|---|---|---|
| Faturamento hoje | soma dos ganhos do dia | real |
| Agendamentos hoje | contagem do dia | real |
| Taxa de ocupação | percentual | `conteudoDemo.hoje` |
| Receita recuperada no mês | valor | `conteudoDemo.hoje` |

A meta e o percentual do primeiro cartão, e a comparação do terceiro, vêm de `conteudoDemo.hoje`. A legenda do segundo ("2 horários livres à tarde") também.

Corrija, em relação ao arquivo, o que a seção 11 do `INVENTARIO.md` aponta: valor em 32px (o arquivo usa 28px) e dígitos tabulares sobre a Plus Jakarta Sans em vez de trocar para fonte monoespaçada.

- [ ] **Passo 3: Painel "Precisa de você"**

`PainelPendencias.tsx` reproduz o bloco do arquivo: cabeçalho com título, contagem de pendências e o rótulo "Ações de um clique"; quatro linhas, cada uma com ícone, título, descrição e botão de ação. O conteúdo inteiro vem de `conteudoDemo.hoje.pendencias`. Os botões ainda não têm ação: cada um abre a área correspondente quando ela existe e, por ora, mostra o aviso padrão de recurso a caminho, sem inventar efeito.

- [ ] **Passo 4: Gráfico de 7 dias**

`WeeklyChart.tsx` passa ao formato do arquivo: título, subtítulo, total do período à direita, barras com os rótulos dos dias. Os valores são reais, vindos dos ganhos dos últimos sete dias. Mantém `useThemeColors`.

- [ ] **Passo 5: Celular**

A versão de celular segue `hoje-mobile.html`, com a ordem de blocos daquele arquivo. Alterne por classes do Tailwind, não por JavaScript. Raio dos cartões em 16px, e sem o gradiente do cartão "Em atendimento", conforme a seção 11.

- [ ] **Passo 6: Checagem e commit**

```bash
git add -A
git commit -m "feat(today): rebuild the home screen from the reference"
```

---

### Tarefa 5: Agenda

**Arquivos:**
- Modificar: `frontend/src/components/AppointmentModule.tsx`, `frontend/src/components/appointments/AppointmentCard.tsx`, `frontend/src/components/appointments/DateNavigationBar.tsx`, `frontend/src/components/ProfessionalAgenda.tsx`
- Criar: `frontend/src/components/appointments/LinhaDoTempo.tsx`
- Referência: `agenda-desktop.html`, `agenda-mobile.html`, seções 3 e 4 do `INVENTARIO.md`

- [ ] **Passo 1: Linha do tempo (computador)**

`LinhaDoTempo.tsx` renderiza as colunas por profissional e as horas na lateral. A altura de uma hora é 80px, como no arquivo, mas a posição de cada agendamento é **calculada** a partir do horário e da duração do serviço, nunca fixada no markup: `top = (minutosDesdeOInicio / 60) * 80` e `height = (duracaoEmMinutos / 60) * 80`. A faixa de horas vem do horário de funcionamento configurado.

Cada bloco mostra o que o arquivo mostra: horário, nome da cliente, serviço e a cor do status. As cores de status são as do arquivo, já mapeadas para tokens.

O "encaixe inteligente" dentro de pausas, que o arquivo sugere, **não entra**: depende de função que não existe.

- [ ] **Passo 2: Celular com gesto**

`agenda-mobile.html` tem o gesto de arrastar o cartão para revelar "Concluir" e "Marcar falta". Implemente com eventos de ponteiro, sem biblioteca nova: arrastar revela as duas ações, soltar antes do limite volta à posição. As duas ações chamam os handlers de mudança de status que já existem. Garanta alternativa acessível: as mesmas ações continuam disponíveis por botão no cartão aberto.

As fotos de profissional do arquivo apontam para o Google; use o `Avatar` do kit, com a foto real quando houver e iniciais quando não houver.

- [ ] **Passo 3: Barra de datas**

`DateNavigationBar.tsx` segue o arquivo: navegação por dia, rótulo da data e os filtros. Mantém os mesmos valores e handlers de hoje, e o padrão de botões com `aria-pressed` adotado no sub-projeto B.

- [ ] **Passo 4: Checagem e commit**

```bash
git add -A
git commit -m "feat(agenda): rebuild the schedule as a timeline from the reference"
```

---

### Tarefa 6: Detalhes do agendamento

**Arquivos:**
- Modificar: `frontend/src/components/appointments/CreateAppointmentModal.tsx` e o painel de detalhes usado pela Agenda
- Referência: `agendamento-detalhes.html`, seção 5 do `INVENTARIO.md`

- [ ] **Passo 1: Portar o painel**

Painel lateral de largura fixa `440px`, abrindo **sobre** a agenda, sem substituí-la. Conteúdo na ordem do arquivo: cabeçalho com cliente e status, dados do atendimento, serviço com preço e duração, profissional, observações e as ações no rodapé.

Os rótulos em maiúsculas espaçadas do arquivo **ficam**, conforme a decisão registrada na especificação. As datas passam para 2026.

- [ ] **Passo 2: Preservar o comportamento**

As ações (confirmar, concluir, cancelar, editar) continuam chamando exatamente os handlers de hoje. A criação de agendamento mantém carregamento de clientes, profissionais e serviços, validações e mensagens.

- [ ] **Passo 3: Checagem e commit**

```bash
git add -A
git commit -m "feat(agenda): rebuild the appointment drawer from the reference"
```

---

### Tarefa 7: Lista de clientes

**Arquivos:**
- Modificar: `frontend/src/components/ClientModule.tsx`
- Referência: `clientes-lista.html`, seção 6 do `INVENTARIO.md`

- [ ] **Passo 1: Portar a tabela**

Colunas, anatomia da linha, estado de passagem do mouse, paginação numérica com reticências e o atalho de teclado "/" para focar a busca — tudo como no arquivo.

A coluna "Fase CRM" **entra**, com os chips e as cores do arquivo, alimentada por `conteudoDemo.clientes`. É conteúdo de exemplo, não dado do banco: a decisão do dono foi reproduzir a tela inteira. O item de menu "Funil CRM" continua fora.

- [ ] **Passo 2: Preservar o comportamento**

Busca, filtros, seleção de cliente, abertura da ficha e o formulário continuam com os mesmos handlers e validações.

- [ ] **Passo 3: Checagem e commit**

```bash
git add -A
git commit -m "feat(clients): rebuild the client list from the reference"
```

---

### Tarefa 8: Ficha da cliente

**Arquivos:**
- Modificar: `frontend/src/components/clients/ClientDetailPanel.tsx`
- Referência: `cliente-ficha.html`, seção 7 do `INVENTARIO.md`

- [ ] **Passo 1: Portar a ficha**

Estrutura, cartões e linha do tempo como no arquivo. A linha do tempo mistura quatro tipos de evento, com marcador e cor próprios; reproduza os quatro. Os atendimentos vêm do banco; os demais eventos vêm de `conteudoDemo.clientes`.

O cartão "Ficha técnica" fica **genérico**: mesmo layout e mesma posição, com campos que servem a qualquer segmento (preferências, alergias e restrições, produtos usados, observações). Nada de formato ou curvatura de unha.

As datas de 2023 e 2024 do arquivo passam para 2026.

- [ ] **Passo 2: Checagem e commit**

```bash
git add -A
git commit -m "feat(clients): rebuild the client record from the reference"
```

---

### Tarefa 9: Caixa

**Arquivos:**
- Modificar: `frontend/src/components/FinanceModule.tsx`, `frontend/src/components/finance/FinanceChart.tsx`, `frontend/src/components/finance/ExpensesTable.tsx`
- Referência: `caixa.html`, seção 8 do `INVENTARIO.md`

- [ ] **Passo 1: Portar a tela**

É a referência mais próxima do design system: tokens e raios (`card: 16px`, `btn: 10px`) batem com o `DESIGN.md`. Porte a estrutura, os cartões de resumo, o gráfico e a tabela.

Os ícones do arquivo são SVG desenhados à mão; use `Icon` com Material Symbols, como nas outras telas.

- [ ] **Passo 2: O que é real e o que é exemplo**

Ganhos, despesas, lucro e o gráfico vêm do banco. Comanda, conferência de gaveta e fechamento do dia, que o arquivo mostra, vêm de `conteudoDemo.caixa`. A geração do PDF não muda.

- [ ] **Passo 3: Checagem e commit**

```bash
git add -A
git commit -m "feat(cash): rebuild the cash screen from the reference"
```

---

### Tarefa 10: WhatsApp

**Arquivos:**
- Modificar: `frontend/src/components/WhatsAppModule.tsx`, `frontend/src/components/whatsapp/ConnectionPanel.tsx`, `frontend/src/components/whatsapp/MessageConfigPanel.tsx`, `frontend/src/components/whatsapp/MenuOptionsPanel.tsx`, `frontend/src/components/whatsapp/ChatSimulator.tsx`
- Referência: `whatsapp-conexao.html`, seção 9 do `INVENTARIO.md`

- [ ] **Passo 1: Portar só a forma**

Estrutura, grade, cartões de saúde, tipografia e espaçamento vêm do arquivo. **Todo o texto que pressupõe a API Oficial da Meta sai**: "WhatsApp Business Cloud API Oficial", "Meta Verified Enterprise", "WABA-ID", "Conformidade Meta Business API", limites de disparo e qualquer selo de certificação. O sistema conecta por QR code, e a tela diz isso.

Os cartões de saúde passam a mostrar o que o sistema sabe: estado da conexão, número conectado, última sincronização. Métricas de entrega e log de mensagens, que não existem, vêm de `conteudoDemo.whatsapp`.

O QR continua com fundo claro garantido (`qr-surface`).

- [ ] **Passo 2: Preservar o comportamento**

Estados de conexão, polling, temporizadores e handlers continuam idênticos. Esta tarefa mexe em marcação e classes.

- [ ] **Passo 3: Checagem e commit**

```bash
git add -A
git commit -m "feat(whatsapp): rebuild the connection screen from the reference"
```

---

### Tarefa 11: Ajustes › Plano

**Arquivos:**
- Modificar: `frontend/src/app/dashboard/planos/page.tsx`
- Referência: `ajustes-plano.html`, seção 10 do `INVENTARIO.md`

- [ ] **Passo 1: Portar a tela**

Estrutura, cartões de plano, comparação e cobrança como no arquivo, **sem** copiar o contêiner único externo `p-1.5`, que a seção 11 desaconselha. Os hexadecimais soltos do arquivo viram os tokens que a própria configuração dele já declara.

Os planos são Solo, Equipe e Salão, com os preços do `DESIGN.md` (R$ 39,90, R$ 99,90 e R$ 199,90). "Plano Pro" não aparece.

Cartão salvo, histórico de nota fiscal e alternância anual, que o arquivo mostra e o sistema não tem, vêm de `conteudoDemo.plano`.

- [ ] **Passo 2: Decidir o contêiner escuro**

A página hoje envolve `PricingPlansSection` em `ForcedDark`. Com a tela portada, a seção de preços passa a seguir o tema, e o `ForcedDark` sai daqui. `PricingPlansSection.tsx` não muda: se ela não funcionar no tema claro, mantenha o `ForcedDark` e registre no relatório.

- [ ] **Passo 3: Checagem e commit**

```bash
git add -A
git commit -m "feat(billing): rebuild the plan screen from the reference"
```

---

### Tarefa 12: Fechamento

**Arquivos:**
- Modificar: `docs/design/DESIGN.md`, `docs/design/SEGUIMENTO.md`, `frontend/src/lib/themedPaths.ts`

- [ ] **Passo 1: Corrigir o DESIGN.md**

Substitua a regra "Sem caixa alta espaçada em rótulos" por uma que diga que rótulos podem usar caixa alta com espaçamento onde a tela de referência do Stitch usa, com nota de que a decisão é de 2026-09-23. Acrescente os tokens novos (`surface-m3`, `brand-text-m3`, `tertiary`, `tertiary-container`) à tabela de tokens, e registre que os ícones do produto são Material Symbols Outlined.

- [ ] **Passo 2: Atualizar o seguimento**

Em `docs/design/SEGUIMENTO.md`, acrescente: que os blocos alimentados por `conteudoDemo.ts` precisam virar dado real ou sair da tela antes de publicar para clientes; que as três áreas "em breve" esperam os sub-projetos D a I; e que `pending_registrations` não é criada por nenhuma migração do Prisma, o que quebra o cadastro em ambiente novo.

- [ ] **Passo 3: Varredura final**

Rode e confira que volta vazio:

```bash
grep -rnE "Plano Pro|Funil CRM|WABA|Meta Verified|20(23|24)" frontend/src
```

Rode a checagem padrão inteira, mais `cd backend && npm run typecheck && npm test`.

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "docs(design): record the reference-driven decisions and close the migration"
```

---

### Tarefa 13: Conferência visual (dono do produto)

Não é tarefa de quem implementa.

Subir o projeto local (banco no Docker, backend e frontend), abrir cada tela ao lado do seu arquivo de referência em `docs/design/stitch/`, na mesma largura, nos dois temas, e anotar as diferenças. O que sobrar vira uma rodada de ajustes.
