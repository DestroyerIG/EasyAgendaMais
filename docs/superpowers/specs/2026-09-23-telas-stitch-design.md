# Telas idênticas ao Stitch — especificação

**Data:** 2026-09-23
**Sub-projeto:** B2 (segue o B, design system e estrutura do painel)
**Referência obrigatória:** `docs/design/stitch/*.html` (10 telas) e o levantamento em `docs/design/stitch/INVENTARIO.md`

## Objetivo

Reimplementar as telas do painel de forma que, abertas lado a lado com o HTML do Stitch, a diferença seja imperceptível: mesma estrutura, mesmos espaçamentos, mesma paleta, mesmos ícones, mesmos textos.

O sub-projeto B migrou as telas para os tokens do design system, mas manteve a composição antiga. Esta especificação troca a composição pela do Stitch.

## Autoridade

Quando duas fontes discordam, vale esta ordem:

1. **O arquivo do Stitch da tela em questão** — forma, paleta, tipografia, ícones, rótulos e espaçamento.
2. **`INVENTARIO.md`** — registro do que cada arquivo contém; serve de atalho, não substitui abrir o HTML.
3. **`DESIGN.md`** — apenas para as regras de conteúdo listadas em "Conteúdo" abaixo.

## Decisões do dono do produto

Tomadas em 2026-09-23, todas registradas aqui porque contrariam recomendações minhas e não devem ser revertidas por quem implementa:

1. **Idêntico, inclusive o que o sistema não faz.** Blocos sem dado real são preenchidos com conteúdo de exemplo. (Ver "Conteúdo de exemplo".)
2. **Paleta por tela.** Cada tela usa a paleta do seu próprio arquivo, mesmo que isso produza dois brancos e dois laranjas de texto diferentes no painel.
3. **Maiúsculas espaçadas onde o Stitch usa.** O `DESIGN.md` passa a permitir, e sua regra "Sem caixa alta espaçada em rótulos" é corrigida nesta entrega.
4. **Ícones Material Symbols**, hospedados localmente.
5. **WhatsApp com a forma do Stitch, ligado à conexão por QR code** que o sistema usa. Nada que afirme API Oficial da Meta, WABA ou certificação.
6. **Ficha da cliente genérica**: o layout do Stitch, com campos que servem a qualquer segmento.

## Escopo

**Entram** as dez telas com referência no Stitch:

| Tela | Arquivo de referência | Rota |
|---|---|---|
| Hoje (computador) | `hoje-desktop.html` | `/dashboard` |
| Hoje (celular) | `hoje-mobile.html` | `/dashboard` |
| Agenda (computador) | `agenda-desktop.html` | `/agendamentos` |
| Agenda (celular) | `agenda-mobile.html` | `/agendamentos` |
| Detalhes do agendamento | `agendamento-detalhes.html` | painel lateral em `/agendamentos` |
| Lista de clientes | `clientes-lista.html` | `/clientes` |
| Ficha da cliente | `cliente-ficha.html` | painel lateral em `/clientes` |
| Caixa | `caixa.html` | `/financeiro` |
| WhatsApp | `whatsapp-conexao.html` | `/whatsapp` |
| Ajustes › Plano | `ajustes-plano.html` | `/planos` |

Mais a casca comum: barra lateral, barra superior e barra inferior do celular.

**Ficam fora**, sem referência no Stitch, e seguem como estão: Ajustes › Negócio, Serviços e equipe, login, cadastro, verificação e recuperação de senha, pagamento, página pública, landing e SuperAdmin.

## Casca do painel

Descrita em detalhe na seção 0.3 e 0.4 do `INVENTARIO.md`.

- **Barra lateral** fixa de 248px, fundo `surface`, borda direita `line`, dividida em cabeçalho (64px, logo quadrado de 32px com o "+" em destaque, nome "EasyAgenda+"), navegação e rodapé com o cartão do negócio (inicial, nome, nome do plano).
- **Barra superior** de 64px, fundo `surface` translúcido com desfoque, borda inferior `line`, deslocada 248px à esquerda. Contém caminho de navegação (nome do negócio · página), busca de 256px, sino de notificações com ponto de não lida, e pílula do usuário com avatar de 32px, nome e cargo.
- **Celular**: cabeçalho com seletor de negócio, notificações e usuário; barra inferior conforme `hoje-mobile.html` e `agenda-mobile.html`.

### Menu

Nove itens, nesta ordem, com estes ícones — os arquivos divergem entre si, então vale o ícone majoritário:

| Item | Ícone | Destino |
|---|---|---|
| Hoje | `today` | `/dashboard` |
| Agenda | `calendar_month` | `/agendamentos` |
| Clientes | `group` | `/clientes` |
| Caixa | `point_of_sale` | `/financeiro` |
| Clube e pacotes | `loyalty` | `/clube` (página "em breve") |
| WhatsApp | `chat` | `/whatsapp` |
| Relatórios | `bar_chart` | `/relatorios` (página "em breve") |
| Minha página | `storefront` | `/minha-pagina` (página "em breve") |
| Ajustes | `settings` | `/configuracoes` |

**"Funil CRM" não entra**, mesmo aparecendo em duas telas do Stitch: está explicitamente fora de escopo no `DESIGN.md`.

As três páginas "em breve" usam a mesma casca e um bloco central com ícone, título e uma frase dizendo que a área está a caminho. Item de menu que não leva a lugar nenhum é pior que uma página honesta.

## Conteúdo

Estas regras do `DESIGN.md` continuam valendo e vencem o que o Stitch mostra:

- **Planos**: Solo, Equipe e Salão. Nunca "Pro", que aparece em cinco arquivos.
- **Sem "Funil CRM"**, nem as outras áreas fora de escopo listadas no `DESIGN.md`.
- **Neutralidade de segmento**: nada específico de unhas, cabelo ou barba na interface.
- **Datas** coerentes com o presente; os arquivos trazem 2023 e 2024.
- **Sem emoji** na interface.
- **Português do Brasil.**

Revogada nesta entrega: a proibição de caixa alta espaçada em rótulos. O `DESIGN.md` é atualizado junto, com nota explicando que a forma segue o Stitch.

Todo o restante do texto visível vem do arquivo do Stitch, palavra por palavra, incluindo rótulos, títulos de bloco e textos de botão.

## Conteúdo de exemplo

Os blocos que dependem de funções inexistentes — cerca de 26, catalogados no ponto 8 de cada seção do `INVENTARIO.md` — são preenchidos com valores de exemplo.

**Todos eles vivem em um único módulo: `frontend/src/lib/conteudoDemo.ts`.** Nenhum valor inventado pode aparecer espalhado pelas telas.

O módulo:

- exporta um objeto por área (`hoje`, `agenda`, `clientes`, `caixa`, `whatsapp`, `plano`);
- abre com um comentário dizendo que são valores de exemplo, que não vêm do banco, e que devem ser substituídos ou removidos quando as funções correspondentes existirem (sub-projetos D a I);
- usa os mesmos valores que o arquivo do Stitch mostra, para que a comparação lado a lado feche.

Onde o dado real existe, ele vem do banco, não do módulo. Cada tela declara no seu próprio topo, em comentário, quais blocos são reais e quais são de exemplo.

## Cores e tipografia

- Os tokens atuais (`bg`, `surface`, `surface-2`, `ink`, `muted`, `line`, `brand`, `on-brand`, `brand-text`, `whatsapp`, `success`, `warning`, `danger`, `status-confirmed`, mais `success-text` e `warning-text`) permanecem.
- A família Material 3 dos oito arquivos entra ao lado, como tokens adicionais, com os pares claro e escuro que os próprios exports declaram (`ink-light`/`ink-dark`, `surface-light`/`surface-dark`, `bg-light`/`bg-dark`, `line-light`/`line-dark`, `muted-light`/`muted-dark`). O azul `tertiary` (`#006399`) e o `tertiary-container` (`#00a8ff`), usados em `agenda-desktop.html`, entram como tokens novos.
- Cada tela usa a família do seu arquivo de referência.
- O tema continua seguindo o aparelho, com claro e escuro.
- A fonte é a Plus Jakarta Sans já hospedada localmente. Onde o arquivo de referência usa fonte monoespaçada para números, a implementação usa monoespaçada; onde usa dígitos tabulares, usa tabulares.
- Os ícones passam a ser Material Symbols Outlined, com a fonte hospedada localmente, sem chamada ao Google. O arquivo `caixa.html` desenha os ícones à mão em estilo traço; ali também vale Material Symbols, para o painel não ter dois estilos de ícone.

## Conformidade

O teste `frontend/src/__tests__/themeCompliance.test.ts` precisa aceitar os nomes da família Material 3 como tokens válidos, e continuar reprovando cor fixa em hexadecimal ou classe padrão do Tailwind. Os arquivos do Stitch usam alguns hexadecimais soltos fora da própria configuração; esses viram token antes de entrar no código.

A verificação de cobertura criada no sub-projeto B continua valendo: arquivo de tela novo precisa entrar na lista ou na lista de exceções.

## Como conferir

Cada tela implementada é comparada com o seu arquivo de referência aberto no navegador, na mesma largura, nos dois temas. A conferência é do dono do produto, no fim, e faz parte da entrega.

Antes disso, cada tarefa roda a checagem de sempre: testes, tipos, build, e a verificação de que nenhum comportamento mudou — as chamadas à API, os handlers e as validações continuam como estão. Esta entrega mexe em apresentação.

## Fora de escopo

- Implementar as funções que as telas do Stitch sugerem (fila de espera, ciclo de manutenção, sinal Pix, avaliações, clube, relatórios, página pública). Ficam para os sub-projetos D a I.
- Redesenhar as telas sem referência no Stitch.
- Mudar rota, modelo de dados ou regra de negócio.
