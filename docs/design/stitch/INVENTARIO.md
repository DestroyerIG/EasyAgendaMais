# Inventário das referências Stitch

Fonte: os 10 arquivos HTML em `docs/design/stitch/` (exportados do projeto Stitch `10354872023808937772`) e `docs/design/DESIGN.md`. Referência de **aparência**, não de funcionalidade nem de conteúdo — onde a tela diverge do DESIGN.md, vale o DESIGN.md.

---

## 0. O que é comum a todas as telas

### 0.1 Duas famílias de export diferentes

Os 10 arquivos não compartilham um único `tailwind.config`. Há duas famílias claramente distintas:

- **Família "tokens simples"** (`hoje-desktop.html`, `caixa.html`): `tailwind.config` curto, ~10-14 cores, nomes de token muito próximos dos do DESIGN.md (`brand`, `ink`, `muted`, `line`, `surface`, `surface-2`, `bg`, `whatsapp`, `statusConfirmed`/`status-confirmed`, `statusWarning`). `caixa.html` é o único arquivo cujo `borderRadius` custom bate exatamente com o DESIGN.md (`card: 16px`, `btn: 10px`).
- **Família "Material 3"** (os outros 8 arquivos): `tailwind.config` longo, ~80 cores nomeadas ao estilo Material Design 3 (`primary`, `primary-container`, `on-primary-container`, `surface-container-low`, `tertiary`, `outline-variant` etc.), mais escalas `fontSize`/`fontFamily` próprias (`headline-lg`, `title-md`, `body-sm`...). Os valores hex majoritariamente batem com os tokens do DESIGN.md (ex.: `primary-container` = `#FF7A00` = `brand`; `ink-light` = `#1A1817` = `ink`), mas os **nomes de classe não correspondem** aos nomes de token do DESIGN.md — uma reimplementação fiel precisa mapear, não copiar as classes literalmente.

Tabela de correspondência (token DESIGN.md → nomes usados nos exports):

| Token DESIGN.md | Família "tokens simples" | Família "Material 3" |
|---|---|---|
| bg | `bg` | `bg-light` |
| surface | `surface` | `surface-light` (nota: hex real é `#fff8f6`, levemente rosado, não `#FFFFFF`) |
| surface-2 | `surface-2` | `surface-2-light` |
| ink | `ink` | `ink-light` |
| muted | `muted` | `muted-light` |
| line | `line` | `line-light` |
| brand | `brand` | `primary-container` |
| on-brand | `on-brand` | `on-brand` (mas também aparece `on-primary-container` com outro valor) |
| brand-text | `brand-text` | `brand-text-light` / `primary` (dois valores diferentes: `#B34D00` e `#994700`) |
| whatsapp | `whatsapp` | `whatsapp-light` |
| success / success-text | `success` | `success-light` |
| warning / warning-text | `warning`/`statusWarning` | `warning-light` |
| danger / danger-text | `danger` | `danger-light` |
| status-confirmed | `statusConfirmed`/`status-confirmed` | `status-confirmed` |

A família "Material 3" também define um `tertiary` (`#006399`, azul) e um `tertiary-container` (`#00a8ff`) sem equivalente no DESIGN.md — usados em `agenda-desktop.html` para o bloco de "ação química" e para o profissional "Bruna". Não há token para isso no DESIGN.md.

### 0.2 Fontes e ícones

- Plus Jakarta Sans em todos os 10 arquivos (`@import` do Google Fonts), mas os pesos carregados variam: alguns arquivos carregam `400;500;600;700;800`, outros só `400;600;700;800` (sem 500).
- Ícones: 9 dos 10 arquivos usam a fonte **Material Symbols Outlined** (`<span class="material-symbols-outlined">nome_do_icone</span>`), com `font-variation-settings` opcional para preenchido (`.fill`). **`caixa.html` é a exceção**: toda a navegação lateral usa SVGs desenhados à mão em estilo Feather/Lucide (stroke, sem preenchimento) em vez de Material Symbols — inconsistência a resolver antes da implementação.
- Alguns números (dinheiro, telefone, horário) usam `font-mono` (fonte monoespaçada real, ex. `hoje-desktop.html`, `cliente-ficha.html`, `whatsapp-conexao.html`, `ajustes-plano.html`) em vez de `font-variant-numeric: tabular-nums` sobre a Plus Jakarta Sans (como faz corretamente `hoje-mobile.html` e `caixa.html`). O DESIGN.md pede dígitos tabulares, não troca de família tipográfica.

### 0.3 Shell do painel (desktop)

Comum a `hoje-desktop`, `agenda-desktop`, `agendamento-detalhes`, `clientes-lista`, `cliente-ficha`, `caixa`, `whatsapp-conexao`, `ajustes-plano`:

- **Sidebar** fixa `w-[248px]`, `h-screen`/`h-full`, `bg-surface`, borda direita `border-line`, `flex flex-col justify-between`, `z-50` (ou 30).
  - Cabeçalho do logo: `h-16`, `border-b border-line`, `px-5`/`px-space-lg`. Logo = quadrado `w-8 h-8 rounded-lg`/`rounded-xl` com "+" ou ícone `calendar_today`/`event_available`, ao lado do texto "EasyAgenda" + "+" em cor de destaque. Em `hoje-desktop.html` some ainda um subtítulo "Gestão de Beleza" abaixo do nome.
  - Navegação: lista vertical, item = `flex items-center gap-3 px-3 py-2.5 rounded-lg/xl`, ícone 20px + rótulo `14px`/`13px` (`label-md`). Item ativo: fundo `surface-2` (ou `primary-container`/`bg-primary-container` conforme o arquivo) e texto em negrito.
  - Rodapé: cartão do negócio — avatar/inicial + "Studio Aurora" (13px negrito) + nome do plano (11-13px, `muted`) num box `bg-surface-2 rounded-xl`. Em 3 arquivos aparece também um ícone `unfold_more`/`verified` à direita.
- **Topbar** fixa/sticky, `h-16`, `bg-surface` (translúcido com `backdrop-blur` em vários), `border-b border-line`, offset `pl-[248px]`/`left-[248px]`. Contém: breadcrumb à esquerda (nome do negócio · separador · página atual); à direita, busca (`w-64`, ícone `search`, placeholder variando por tela), sino de notificação (`w-9 h-9 rounded-lg/xl`, ponto laranja de notificação não lida) e pílula de usuário (avatar 32px + nome "Carla" + cargo "Administradora").

**Divergência de itens de menu entre telas**: a ordem definida no DESIGN.md é Hoje, Agenda, Clientes, Caixa, Clube e pacotes, WhatsApp, Relatórios, Minha página, Ajustes (9 itens). `clientes-lista.html` e `cliente-ficha.html` inserem um 10º item, **"Funil CRM"** (ícone `view_kanban`), entre Clientes e Caixa — item explicitamente fora de escopo no DESIGN.md.

**Ícones de menu inconsistentes entre arquivos** para o mesmo item:
- Hoje: `today` (hoje-desktop, agenda-desktop, agendamento-detalhes, clientes-lista, cliente-ficha, whatsapp-conexao) vs `dashboard` (ajustes-plano) vs `event_available` (bottom nav do hoje-mobile).
- Relatórios: `bar_chart` (maioria) vs `analytics` (ajustes-plano).
- Clube e pacotes: `loyalty` (maioria) vs `card_membership` (whatsapp-conexao).
- Agenda: `calendar_month` (maioria) vs `event_upcoming` (clientes-lista, cliente-ficha) vs `calendar_today` (whatsapp-conexao).
- Minha página: `storefront` (maioria) vs `public` (whatsapp-conexao).

### 0.4 Shell do painel (mobile)

Comum a `hoje-mobile.html` e `agenda-mobile.html`:

- Header fixo `h-16`, `bg-surface/85-95` com `backdrop-blur`, `pt-safe`. Esquerda: avatar/inicial do negócio + nome do espaço + seletor (`unfold_more`). Direita: sino de notificação (44px de toque) + avatar redondo do usuário (ícone genérico `person`, não iniciais — diferente do desktop que usa iniciais "CA").
- Bottom nav fixo `h-16`, `bg-surface/90-95` com `backdrop-blur`, 5 itens: Hoje, Agenda, botão central "+" flutuante (`w-12 h-12 rounded-full bg-brand`, elevado com `-mt-5`), Clientes, Mais (ícone `menu`). Ordem e composição batem com o DESIGN.md.

### 0.5 Dado de exemplo repetido

Todas as telas usam o mesmo negócio fictício, "Studio Aurora", e o mesmo elenco de profissionais/clientes (Camila Rocha/nail designer, Bruna Lima/cílios, Paula Mendes/cabelo; Mariana Souza, Letícia Albuquerque, Beatriz Costa/Silveira, Juliana Paes etc.), sempre no segmento de estúdio de unhas/cílios. Não há nenhum exemplo de barbearia ou outro segmento nas 10 telas — o DESIGN.md pede neutralidade de segmento; o conjunto de referências, tomado como um todo, é enviesado para um único segmento.

---

## 1. `hoje-desktop.html`

### Estrutura
Sidebar 248px (ver 0.3) + topbar 64px + `<main class="p-6 max-w-[1400px] w-full mx-auto flex flex-col gap-6">`:
1. Cabeçalho da página: `flex justify-between` — título + data à esquerda, 2 botões à direita.
2. `<section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">` — 4 cartões de métrica.
3. `<section class="grid grid-cols-1 lg:grid-cols-12 gap-6">` — coluna esquerda `lg:col-span-7` (2 blocos empilhados) + coluna direita `lg:col-span-5` (1 bloco).

### Blocos
- **Cabeçalho**: `h1` "Bom dia, Carla" (24px/700, `text-2xl font-bold`), abaixo `p` com a data (14px, `muted`). Botões: "Disparos WhatsApp" (secundário, ícone SVG do WhatsApp desenhado à mão, texto e ícone em `whatsapp`) e "Novo agendamento" (primário, `bg-brand`, ícone `add`).
- **Cartão de métrica** (padrão repetido 4x, e reaproveitado em outras telas): `bg-surface rounded-2xl p-5 border border-line shadow-sm flex flex-col justify-between`. Topo: rótulo 13px/600 `muted` + ícone 20px `muted` à direita. Meio: valor grande `text-[28px] font-bold font-mono`. Rodapé varia: barra de progresso (`h-1.5 bg-surface-2 rounded-full`, preenchimento `bg-brand`) com "Meta R$ 1.800" e "81%"; ou selo de alerta (bolinha + texto `statusWarning`); ou variação percentual com seta `arrow_upward` e texto `whatsapp`; ou legenda simples com bolinha colorida.
  - Os 4 cartões: "Faturamento hoje" (R$ 1.460, meta R$ 1.800, 81%), "Agendamentos hoje" (16, "2 horários livres à tarde"), "Taxa de ocupação" (84%, "+6% vs média de terça"), "Receita recuperada no mês" (R$ 2.980, "via lembretes WhatsApp").
- **"Precisa de você"**: cartão `rounded-2xl p-5`, cabeçalho com título 16px/700 + selo `4 pendências` (pílula `bg-brand/15`) + "Ações de um clique" à direita (12px `muted`). 4 linhas idênticas em estrutura: ícone num quadrado 36px (`bg-surface border border-line rounded-xl`), texto principal 13px/700 truncado + subtexto 12px `muted`; botão de ação à direita (varia: secundário cinza, botão verde WhatsApp com ícone `send`, secundário laranja-texto, secundário vermelho-texto).
- **Gráfico "Faturamento últimos 7 dias"**: cartão com cabeçalho (título + subtítulo à esquerda, "Total período R$ 11.420" à direita) e um `<svg>` de barras (viewBox 520×180) com grid pontilhado, rótulos de valor sobre cada barra e o dia da semana embaixo; a barra de "Hoje" é destacada em `brand`, as demais em `surface-2` com hover para `line`.
- **"Próximas 2 horas"**: cartão com cabeçalho (título + ponto pulsante `animate-pulse` + contador "4 atendimentos"), chips de filtro por profissional ("Todos" ativo + 3 nomes), 4 cartões de agendamento (`flex`, faixa vertical 6px na cor do status + corpo com horário/status/nome/valor/serviço-profissional/selo de sinal pago ou CTA), e um link de rodapé "Ver grade completa da agenda" (`bg-surface-2 rounded-xl w-full`).

### Textos
- "Bom dia, Carla" [dado] · "terça, 17 de setembro de 2026" [dado]
- "Disparos WhatsApp" [fixo] · "Novo agendamento" [fixo]
- "Faturamento hoje" / "R$ 1.460" [dado] / "Meta R$ 1.800" [dado] / "81%" [dado]
- "Agendamentos hoje" / "16" [dado] / "2 horários livres à tarde" [dado]
- "Taxa de ocupação" / "84%" [dado] / "+6%" [dado] / "vs média de terça" [fixo]
- "Receita recuperada no mês" / "R$ 2.980" [dado] / "via lembretes WhatsApp" [fixo]
- "Precisa de você" [fixo] · "4 pendências" [dado] · "Ações de um clique" [fixo]
- "2 horários vagos à tarde com Bruna" [dado] · "14:30 e 16:45 sem agendamento" [dado] · "Oferecer à lista de espera" [fixo]
- "9 clientes com manutenção vencendo" [dado] · "Cílios e unhas no prazo ideal de retorno" [fixo] · "Disparar lembrete" [fixo]
- "3 sinais Pix aguardando pagamento" [dado] · "Expira em 30 minutos (R$ 110 pendentes)" [dado] · "Ver pendências" [fixo]
- "1 avaliação desfavorável registrada" [dado] · "Cliente Camila Dias · Ontem às 18:30" [dado] · "Ver e responder" [fixo]
- "Faturamento últimos 7 dias" [fixo] · "Comparativo diário da semana" [fixo] · "Total período" [fixo] · "R$ 11.420" [dado]
- Rótulos do gráfico: "2.5k", "1.5k", "0", "1.250"/"Qua", "1.520"/"Qui", "2.380"/"Sex", "2.890"/"Sáb", "1.920"/"Seg", "1.460"/"Hoje" [dado]
- "Próximas 2 horas" [fixo] · "4 atendimentos" [dado]
- Chips: "Todos", "Camila (unhas)", "Bruna (cílios)", "Paula (cabelo)" [dado]
- Cartões: "10:00 - 11:30"/"Confirmado"/"Mariana Souza"/"R$ 180"/"Alongamento em gel · Camila"/"Sinal pago R$ 30"; "10:15 - 11:15"/"Em atendimento"/"Letícia Albuquerque"/"R$ 210"/"Extensão cílios volume russo · Bruna"/"Sinal pago R$ 40"; "10:30 - 12:00"/"Confirmado"/"Juliana Paes"/"R$ 160"/"Corte + Escova modelada · Paula"/"Pagar no local"; "11:30 - 12:30"/"Aguardando confirmação"/"Beatriz Costa"/"R$ 110"/"Manutenção em gel · Camila"/"Reenviar WhatsApp" [todos dado, exceto rótulos de status e "Pagar no local"/"Reenviar WhatsApp" fixo]
- "Ver grade completa da agenda" [fixo]
- Sidebar: "EasyAgenda+", "Gestão de Beleza", itens de menu, "Studio Aurora" [dado], "Plano Equipe" [dado, correto]
- Topbar: "Studio Aurora / Painel de Gestão", "Buscar no sistema...", "Carla", "Administradora"

### Ícones (Material Symbols)
`today` (fill), `calendar_month`, `group`, `point_of_sale`, `loyalty`, `chat`, `bar_chart`, `storefront`, `settings`, `spa`, `unfold_more`, `search`, `notifications`, `add`, `payments`, `event_available`, `pie_chart`, `mark_chat_read`, `calendar_today`, `sync`, `qr_code_2`, `star_half`, `send`, `check_circle`, `chevron_right`, `arrow_forward`, `arrow_upward`. Botão "Disparos WhatsApp" usa um `<svg>` do glifo do WhatsApp desenhado à mão, não um Material Symbol.

### Cores e tipografia
- Fundo `bg`, cartões `surface` + `border-line` + `shadow-sm`, `rounded-2xl` (16px, correto).
- Título de página: 24px/700 (`text-2xl font-bold`) — bate com DESIGN.md.
- Rótulo de métrica: 13px/600 `muted` — bate.
- Valor de métrica: **28px** `font-mono` — DESIGN.md pede 32-40px/700 para métricas grandes e não pede troca de fonte.
- Avaliação desfavorável usa `text-red-600`/`border-red-400` (Tailwind padrão) — o `tailwind.config` deste arquivo não define nenhum token `danger`; não há vermelho de marca aplicado.
- Botão "Disparar lembrete" usa `text-white` sobre `bg-whatsapp` (não há token `on-whatsapp`).

### Estados
- Hover em linhas de "Precisa de você": `bg-surface-2/60` → `bg-surface-2`.
- Hover em cartões de agendamento: borda `line` → `ink/20`.
- Barra "Hoje" do gráfico: `hover:brightness-105`; barras normais: `group-hover:fill-line`.
- Botão primário: `active:scale-[0.99]`.
- Notificação: ponto laranja fixo (não há estado "sem notificações" mostrado).
- Sem estados vazio/carregando/desabilitado representados nesta tela.
- Cores de status de agendamento nesta tela: Confirmado = `statusConfirmed` (chip `/10`), Em atendimento = `brand` (chip `/15`, texto `ink`), Aguardando confirmação = `statusWarning` (chip `/10`).

### Diferenças em relação ao DESIGN.md
1. Valor de métrica em 28px, fora da escala 32-40px pedida para métricas grandes.
2. `font-mono` para números (dinheiro) em vez de Plus Jakarta Sans com `tabular-nums`.
3. Cor de alerta (avaliação) usa `red-600`/`red-400` do Tailwind padrão, não um token de `danger` da paleta.
4. `tailwind.config` deste arquivo não define tokens `success`/`danger` — a paleta do DESIGN.md está incompleta aqui.

### Dados que o sistema não tem
Meta de faturamento diário e barra de progresso; taxa de ocupação com comparação histórica ("vs média de terça"); receita recuperada atribuída a lembretes automáticos; lista de espera ("Oferecer à lista de espera"); ciclos de manutenção por cliente/serviço; sinais Pix pendentes com expiração e soma; avaliações de clientes com resposta.

---

## 2. `hoje-mobile.html`

### Estrutura
Header fixo 64px (ver 0.4) + `<main class="pt-16 pb-28 px-space-md">` com 5 seções empilhadas (`gap-space-md` = 16px) + botão flutuante fixo + bottom nav fixa (ver 0.4).

### Blocos
- **Saudação**: `h1` "Bom dia, Carla" (24px/700) + data (13px `muted`, sem ano) à esquerda; à direita, pílula "Studio Aurora · 3 ativas" com bolinha verde.
- **Grid 2×2 de métricas**: mesmas 4 métricas da versão desktop, cartão `rounded-xl p-3.5` (12px de raio pela config custom deste arquivo, não 16px), com mini barra de progresso em todos os 4 cartões (na versão desktop só o de faturamento tem barra).
- **"Precisa de você"**: título + badge numérico circular vermelho ("4") em vez do texto "4 pendências"; 4 linhas com ícone 36px em `surface-2`, texto e botão de ação de 44px de altura (toque mínimo). Um botão tem `onclick` que troca o próprio texto para "Oferecido!"/"Enviados!" e muda de cor — micro-interação local, sem estado de carregamento real.
- **"Próximas 2 horas"**: título + indicador `animate-ping`; 4 linhas de horário (hora 24px/700 + duração + barra vertical colorida + nome/serviço/profissional + valor + chip de status), mais uma 5ª linha especial "14:30 · Horário livre" com CTA "Oferecer vaga ou agendar encaixe rápido" e ícone `bolt`.
- **Gráfico compacto "Últimos 7 dias"**: barras verticais simples (`div` com `height` em `%`, sem SVG), 7 colunas (Q, Q, S, S, D, S, Hoje), rótulo de valor acima de cada barra, coluna de domingo em opacidade 40%.
- **Botão flutuante "Cobrar Pix"**: pílula fixa `bottom-20 right-4`, fundo escuro (`bg-on-brand`, isto é, `ink` como fundo) com texto claro, ícone `qr_code_scanner`.

### Textos
- "Bom dia, Carla" [dado] · "terça, 17 de setembro" [dado, sem ano]
- "Studio Aurora · 3 ativas" [dado]
- "Faturamento hoje"/"R$ 1.460"/"Meta R$ 1.800"/"81%" [dado]
- "Agendamentos"/"16"/"2 horários livres" [dado]
- "Ocupação do dia"/"84%"/"+6% terça anterior" [dado]
- "Recuperado (mês)"/"R$ 2.980"/"via bot WhatsApp" [dado + fixo — nomeia a mesma métrica de forma diferente da versão desktop, que diz "via lembretes WhatsApp"]
- "Precisa de você" [fixo] · badge "4" [dado]
- "2 horários vagos à tarde"/"Com Bruna (15h e 16h30)"/"Oferecer fila" [dado/fixo — rótulo do botão difere do desktop ("Oferecer à lista de espera")]
- "9 manutenções vencendo"/"Ciclo de 20-25 dias"/"Enviar convite" [dado/fixo — rótulo do botão difere do desktop ("Disparar lembrete")]
- "3 sinais Pix pendentes"/"Total de R$ 90 retidos"/"Ver pendências" [dado — valor retido difere do total do desktop, que soma R$ 110]
- "1 avaliação 2 estrelas"/"Camila M. · ontem às 18h"/"Responder" [dado]
- "Próximas 2 horas" [fixo] · "Ver agenda" [fixo]
- Linhas: "10:00"/"Mariana Souza"/"Sinal pago"/"Alongamento · Camila"/"R$ 180"/"Confirmado"; "10:15"/"Letícia Albuquerque"/"Sinal pago"/"Cílios Volume · Bruna"/"R$ 210"/"Em atendimento"; "10:30"/"Juliana Paes"/"Corte e Escova · Paula"/"R$ 160"/"Confirmado"; "11:30"/"Beatriz Costa"/"Manutenção Fibra · Camila"/"R$ 110"/"Aguardando sinal" [dado]
- "Últimos 7 dias"/"Média diária: R$ 1.340"/"R$ 9.380"/"+12% vs sem. ant." [dado]
- "Cobrar Pix" [fixo]
- Bottom nav: "Hoje", "Agenda", "Clientes", "Mais" [fixo]

### Ícones
`unfold_more`, `notifications`, `person`, `payments`, `calendar_clock`, `pie_chart`, `smart_toy`, `auto_fix_high`, `event_busy`, `bolt`, `schedule_send`, `send`, `pending`, `chevron_right`, `reply`, `chevron_right`, `qr_code_scanner`, bottom nav: `event_available`, `calendar_today`, `add`, `group`, `menu`.

### Cores e tipografia
- Escala custom deste arquivo bate bem com o DESIGN.md em tamanhos: `headline-md` 24px/700 (título), `title-md` 17px/600, `label-md` 13px/600, `body-md` 15px/400, `label-sm` 11px/600.
- Cartões `rounded-xl` = **12px** pela config custom (`borderRadius.xl: 0.75rem`), enquanto o DESIGN.md pede 16px para cartões e painéis. Na versão desktop os mesmos cartões usam `rounded-2xl` (16px, correto).
- Números com `style="font-variant-numeric: tabular-nums"` explícito sobre Plus Jakarta Sans — implementação correta do dígito tabular (diferente de outras telas que usam `font-mono`).
- Ícone "Recuperado (mês)" usa `smart_toy` (robô) e texto auxiliar "auto_fix_high" — associa a métrica a automação/IA, não mencionada no DESIGN.md.
- Linha "Em atendimento" usa `bg-gradient-to-r from-primary-fixed/30 to-surface-light` — gradiente sutil, ainda que não roxo/azul/neon.
- Botão flutuante inverte a paleta: fundo `on-brand` (= `ink`, escuro) com texto `bg-light` (claro) — combinação não descrita no DESIGN.md.

### Estados
- Botões "Oferecer fila"/"Enviar convite" trocam de rótulo e cor via `onclick` inline (simulação de sucesso), sem estado de carregamento.
- `animate-pulse` na bolinha "3 ativas"; `animate-ping` no indicador de "Próximas 2 horas".
- Barra de progresso em cada cartão de métrica (não presente na versão desktop, exceto faturamento).
- Linha de domingo no gráfico em `opacity-40` (dia sem dado/fechado).
- Sem estados vazio, erro ou desabilitado.

### Diferenças em relação ao DESIGN.md
1. Raio de cartão 12px em vez de 16px.
2. Gradiente (ainda que sutil) em cartão de agendamento — DESIGN.md veta gradientes.
3. Nomenclatura da métrica de recuperação inconsistente com a versão desktop ("via bot WhatsApp" vs "via lembretes WhatsApp") e associação a "robô"/IA não descrita no produto.
4. Avatar do usuário no header é um ícone genérico (`person`), enquanto o desktop usa iniciais — inconsistência de padrão de avatar entre as duas versões da mesma tela.

### Dados que o sistema não tem
Mesma lista da versão desktop (meta, ocupação, recuperação via bot, lista de espera/fila, manutenções, sinais Pix, avaliação) mais: contagem de "profissionais ativas" no cabeçalho; cobrança de Pix avulsa via botão flutuante fora do fluxo de um agendamento.

---

## 3. `agenda-desktop.html`

### Estrutura
Sidebar 248px + topbar 64px (família "Material 3", ver 0.1/0.3) + `<main class="pt-16 px-space-lg py-space-lg">`:
1. Barra superior: navegação de data + seletor Dia/Semana + chips de profissional + botão "Novo agendamento" (`flex flex-wrap`, `bg-surface-light p-4 rounded-xl`).
2. Sub-cabeçalho operacional: KPIs do dia (agendamentos, faturamento, horários livres) + legenda de status compacta.
3. Timeline: grid `grid-cols-[68px_1fr_1fr_1fr]` — coluna de horas (68px) + 3 colunas de profissional (`1fr` cada). Cabeçalho de colunas fixo (`sticky top-0`); corpo com `h-[960px]` (12h × 80px/hora, 08:00–20:00), grade de fundo com linhas a cada 80px (hora) e traço pontilhado na metade (30min); indicador de "agora" (linha laranja horizontal + rótulo "11:15 Agora").

### Blocos
- **Cartão de agendamento na timeline**: posicionado em `absolute` por `top`/`height` calculados a partir do horário; `rounded-lg border shadow-xs`, faixa colorida à esquerda (1-1.5px) na cor do status; corpo com horário (11px `muted`), selo de "Sinal pago" quando houver, nome do cliente (title-md, negrito), serviço (`body-sm muted`), rodapé com valor (negrito) + chip de status.
- **Bloco de almoço**: sem cartão de cliente; fundo com padrão listrado diagonal (`repeating-linear-gradient`), ícone `restaurant` + "Almoço da equipe"/"Almoço".
- **Horário livre**: borda tracejada, hover destaca em `primary-container`; dois formatos — "Livre 30m" (compacto) e "1h30 livre / Clique para agendar" (com ícone `event_available`).
- **Encaixe rápido**: borda tracejada 2px, texto "+ Encaixe rápido (14:30)" — vaga para encaixar um atendimento extra num intervalo livre.
- **Bloco de "ação química"**: dentro do cartão de coloração de Paula, uma faixa interna listrada em azul (`tertiary`) com "Pausa 35 min – Ação Química", selo "Encaixe ativo" e, dentro dela, um mini-cartão de outro cliente encaixado durante a pausa (nome + valor faturado no intervalo).
- **Cartão cancelado**: opacidade 60%, todo o texto riscado (`line-through`), sem chip de valor.
- **Cabeçalho de coluna do profissional**: avatar 36px com iniciais coloridas por profissional (fundo tonal + texto na cor), nome (title-md) + especialidade (label-sm muted), contador "N atendimentos" à direita.

### Textos
- Sidebar: "Studio Aurora" [dado], **"Plano Pro"** [dado — nome de plano inexistente no DESIGN.md]
- Data: "Terça, 17 de Setembro" [dado — maiúscula em "Setembro", sem ano]
- "Hoje" (botão) [fixo] · "Dia"/"Semana" [fixo] · "Todas" [fixo] · "Camila (unhas)", "Bruna (cílios)", "Paula (cabelo)" [dado] · "Novo agendamento" [fixo]
- "16 agendamentos" / "Faturamento: R$ 1.460" / "3 horários livres" [dado]
- Legenda: "Confirmado", "Aguardando confirmação", "Em atendimento", "Concluído", "Faltou", "Cancelado" [fixo]
- "GMT-3" [fixo] · "Camila Rocha"/"Nail Designer"/"6 atendimentos"; "Bruna Lima"/"Cílios & Sobrancelhas"/"5 atendimentos"; "Paula Mendes"/"Hair Stylist"/"5 atendimentos" [dado]
- Horas da régua: "08:00" a "20:00" [fixo]
- Cartões (amostra): "Mariana Souza"/"Manutenção Fibra"/"R$ 110"/"Concluído"/"Sinal pago"; "Rafaela Diniz"/"Alongamento em Gel"/"R$ 180"/"Em atendimento"/"Em procedimento"; "Juliana Costa"/"Esmaltação em Gel"/"R$ 70"/"Confirmado"; "Vanessa Alves"/"Manutenção Alongamento"/"R$ 110"/"Aguardando sinal"/"Pendência"; "Camila Dias"/"Blindagem Diamond"/"R$ 90"/"Cancelado" [dado]
- "Almoço da equipe" / "Almoço" [fixo]
- "Livre 30m" / "+ Encaixe rápido (14:30)" / "+ Encaixe rápido (16:45)" / "1h30 livre" / "Clique para agendar" [fixo]
- "Pausa 35 min – Ação Química" / "Encaixe ativo" / "Corte Curto Express · Aline Maia" / "R$ 80 faturados no intervalo" / "Finalização: Escova & Lavatório" / "Total bloco: R$ 360" [dado]
- "Fernanda Torres"/"Design de Sobrancelha"/"R$ 60"; "Beatriz Martins"/"Lash Lifting"/"R$ 130"; "Carla Peixoto"/"Manutenção Cílios"/"R$ 120"/"Faltou"; "Renata Prado"/"Mechas e Tonalização"/"R$ 320"; "Sophia Lima"/"Corte & Hidratação"/"R$ 160" [dado]

### Ícones
`event_available` (logo), `today`, `calendar_month`, `group`, `payments`, `loyalty`, `chat`, `bar_chart`, `storefront`, `settings`, `verified`, `search`, `notifications`, `person`, `chevron_left`, `chevron_right`, `calendar_today`, `add`, `check_circle`, `verified`, `restaurant`, `add_circle`, `person_off`, `timer`, `bolt`, `event_available`.

### Cores e tipografia
- Escala Material 3 do arquivo (headline-md 24/700, title-md 17/600, label-md 13/600, body-sm 14/400) aplicada de forma consistente.
- Status: Concluído = `success-light`, Em atendimento = `primary-container` com `animate-pulse`, Confirmado = `status-confirmed`, Aguardando = `warning-light`, Faltou = `danger-light`, Cancelado = `secondary`+`line-through`+`opacity-70` — todos batem semanticamente com o DESIGN.md.
- Cor `tertiary` (`#006399`, azul diferente do `status-confirmed`) usada só para a faixa de "ação química" — sem token equivalente no DESIGN.md.
- Avatares de profissional usam cores tonais diferentes por pessoa (laranja para Camila, azul-`tertiary` para Bruna, verde-`success` para Paula) — esquema de cor por profissional não previsto no DESIGN.md.

### Estados
- Cartão "hoje"/"em atendimento": `animate-pulse` na faixa lateral e `animate-ping` num ponto (Bruna).
- Hover em cartão de agendamento: `shadow-md`.
- Hover em horário livre / encaixe: muda borda e texto para `primary-container`.
- Cancelado: opacidade reduzida + riscado (equivalente ao "muted com texto riscado" do DESIGN.md, mas usando `secondary` em vez do token `muted`).
- Linha "agora" fixa às 11:15 (não haveria como testar comportamento dinâmico no HTML estático).

### Diferenças em relação ao DESIGN.md
1. **"Plano Pro"** no rodapé da sidebar — nome de plano proibido; deveria ser Solo, Equipe ou Salão.
2. Data sem ano e com "Setembro" maiúsculo, diferente do formato de exemplo do DESIGN.md ("terça, 17 de setembro de 2026").
3. Cor `tertiary` (azul) sem correspondência nos tokens do DESIGN.md, usada para destacar a pausa de "ação química".
4. Esquema de uma cor fixa por profissional (Camila=laranja, Bruna=azul, Paula=verde) não é descrito em nenhum lugar do DESIGN.md.

### Dados que o sistema não tem
"Encaixe inteligente"/"Encaixe rápido" dentro de pausas de procedimento com cálculo automático de intervalo livre; contagem de atendimentos por profissional no cabeçalho da coluna; "ação química" como tipo de bloco com timer próprio; total faturado dentro de um intervalo de pausa.

---

## 4. `agenda-mobile.html`

### Estrutura
Header 64px + `<main class="pt-16 pb-24 px-gutter">`: (1) barra de data + chips de profissional com foto + linha de ocupação/horário de funcionamento; (2) dica de gesto; (3) lista vertical de cartões de agendamento (um deles com swipe ativo); (4) cartão "Total previsto hoje"; bottom nav 64px fixa.

### Blocos
- **Barra de data**: `bg-surface-container rounded-xl p-space-sm`, botões `< Terça, 17 de set. >` (44×44px) + botão "Hoje".
- **Chips de profissional**: "Todas (16)" (ativo, pílula laranja com ícone `group`) + 3 chips com **foto real** (`<img>`, 32px, `object-cover`) e contagem entre parênteses.
- **Linha de status**: bolinha verde pulsante + "84% de ocupação" + "2 vagas livres à tarde" + "8h - 19h" à direita.
- **Dica de gesto**: pílula centralizada `bg-surface-container`, ícone `swipe` + "Deslize o cartão para concluir ou registrar falta".
- **Cartão de agendamento com swipe**: camada de fundo dividida em dois (verde "Concluir / Comanda" à esquerda, vermelho "Marcar Falta" à direita) revelada por um `<script>` de `touchstart/touchmove/touchend` que arrasta o cartão em cima (`translateX`, limite ±120px, snap em ±80px ou volta a 32px). O primeiro cartão da lista já nasce parcialmente deslocado (`translate-x-8`) para sugerir a interação.
- **Cartão de agendamento normal**: hora (24px/700) + duração à esquerda, barra vertical colorida, nome + valor, serviço + profissional, chips de status/sinal, ação contextual (chat WhatsApp, "Cobrar PIX", "Chegada prevista").
- **Linha "horário livre"**: botão inteiro clicável, ícone `add`, hora + selo "Horário livre" + "Oferecer vaga ou agendar encaixe rápido" + ícone `bolt`.
- **Cartão "Total previsto hoje"**: ícone `insights` + "14 confirmados · 2 em espera" + valor total à direita.

### Textos
- "Terça, 17 de set." [dado, mês abreviado — 3º formato de data diferente para o mesmo dia]
- "Hoje" [fixo] · "Todas (16)" [dado] · "Camila (6)", "Bruna (5)", "Paula (5)" [dado]
- "84% de ocupação" / "2 vagas livres à tarde" / "8h - 19h" [dado]
- "Deslize o cartão para concluir ou registrar falta" [fixo]
- "Concluir / Comanda" / "Marcar Falta" [fixo]
- Cartões: "10:00"/"60 min"/"Mariana Souza"/"R$ 180"/"Alongamento em Gel"/"Camila"/"Em atendimento"/"Sinal R$ 50"; "10:15"/"75 min"/"Letícia Albuquerque"/"R$ 210"/"Cílios Volume Russo"/"Bruna"/"Em atendimento"/"Sinal pago R$ 30"; "10:30"/"45 min"/"Juliana Paes"/"R$ 160"/"Corte & Escova Modelada"/"Paula"/"Confirmado"; "11:30"/"50 min"/"Beatriz Costa"/"R$ 110"/"Manutenção Fibra de Vidro"/"Camila"/"Aguardando sinal"/"Cobrar PIX"; "15:00"/"40 min"/"Vanessa Alves"/"R$ 70"/"Esmaltação Tradicional"/"Camila"/"Confirmado"/"Chegada prevista 14:55" [dado]
- "14:30"/"Horário livre"/"Oferecer vaga ou agendar encaixe rápido" [dado/fixo]
- "Total previsto hoje" / "14 confirmados · 2 em espera" / "R$ 2.380" [dado]
- Bottom nav: "Hoje", "Agenda", "Clientes", "Mais" [fixo]

### Ícones
`chevron_left`, `chevron_right`, `calendar_today`, `group`, `swipe`, `check_circle`, `event_busy`, `chat`, `bolt`, `insights`, bottom nav: `today` (aqui, não `event_available` como em hoje-mobile), `calendar_month`, `add`, `group`, `menu`.

### Cores e tipografia
- Mesma escala Material 3 das outras telas dessa família.
- Fotos de profissional reais (`googleusercontent.com`) com `data-alt` descritivo — placeholders que precisarão de imagens próprias ou iniciais na implementação.
- Cores de status batem com o padrão: `primary-container` (em atendimento), `status-confirmed`, `warning-light`, `success-light` (horário livre).

### Estados
- **Swipe** funcional via JS: arrastar revela ações "Concluir/Comanda" (verde) e "Marcar Falta" (vermelho); solta e volta/prende conforme o deslocamento.
- `active:scale-95`/`active:scale-[0.99]` em quase todos os botões e chips (feedback de toque).
- `animate-pulse` na bolinha de ocupação.
- Sem estado vazio, erro ou carregamento representado.

### Diferenças em relação ao DESIGN.md
1. Formato de data "Terça, 17 de set." (abreviado, maiúscula, sem ano) — 3º formato diferente encontrado nas 10 telas para o mesmo dia de exemplo.
2. Ícone do item "Hoje" no bottom nav (`today`) diverge do usado no bottom nav de `hoje-mobile.html` (`event_available`) para o mesmo item.
3. Fotos de profissional reais hospedadas externamente, incompatíveis com um sistema onde essas fotos são enviadas pelo próprio negócio.

### Dados que o sistema não tem
Gesto de swipe para concluir/marcar falta (interação, não dado, mas exige suporte de UI); "vagas livres" e ocupação calculada; "Total previsto" combinando confirmados e em espera; "Chegada prevista" (estimativa de atraso) calculada por horário.

---

## 5. `agendamento-detalhes.html`

### Estrutura
Sidebar 248px + topbar 64px + fundo com uma agenda semelhante à de `agenda-desktop.html` (mas em layout de **slots por linha**, não timeline livre) + **drawer lateral fixo `w-[440px]`** sobreposto com backdrop translúcido (`bg-ink-light/25 backdrop-blur-[2px]`), aberto/fechado por JS (`translateX`).

### Blocos
- **Fundo (agenda em slots)**: grid `grid-cols-[80px_repeat(3,1fr)]`, uma linha por horário (`space-y-4`), célula = "Disponível" (cinza), "Intervalo Almoço" (cinza, texto), cartão de cliente (`bg-surface-2-light rounded-xl p-3`, opacidade 75% se "Finalizado") ou o **cartão em foco** (`bg-surface-container`, escala 1.01, sombra, faixa lateral) que corresponde ao item aberto no drawer.
- **Drawer — cabeçalho**: botão fechar (`close`) + "Agendamento #4892" (label uppercase) + "Detalhes da Sessão" + chip de status "Em atendimento" à direita.
- **Cartão de perfil da cliente**: avatar 56px `rounded-2xl`, nome (title-lg/700), telefone + botão WhatsApp circular verde, tag "Cliente Recorrente" (pílula com ícone `repeat`).
- **Grid de métricas da cliente (2 colunas)**: "Ciclo médio" (21 dias, selo "Ideal para o serviço") e "Total de visitas" (8, "em 2024", "Última: há 19 dias (Camila)").
- **Cartão "Serviço & Horário"**: rótulo uppercase + chip de origem "Página Pública (Link da Bio)"; linha de data/hora com ícone `schedule`; linha de profissional com foto + cargo + ícone `badge`.
- **Cartão financeiro**: nome do serviço + valor total; pílula "Sinal pago R$ 30,00 via Pix" com nº de comprovante Pix e ícone `check_circle`; linha "Valor a pagar no estúdio" com valor em destaque (`text-primary`, 24px extra-bold).
- **Observações da cliente**: rótulo uppercase + citação em itálico.
- **Metadados de origem**: "Agendado em 14/09 às 21:14" + "Lembrete WhatsApp enviado" (bolinha verde).
- **Rodapé de ações fixo**: botão primário full-width "Concluir atendimento & Receber"; grid 2 col. "Confirmar"/"Remarcar"; grid 2 col. "Cliente faltou"/"Cancelar" (texto, sem fundo).

### Textos
- Sidebar: **"Plano Pro"** [dado — mesma inconsistência da tela 3]
- "Terça, 17 de Setembro" (2x, cabeçalho da agenda e dentro do drawer) [dado, sem ano]
- "Studio aberto (08:00 - 19:30)" [dado] · "Todas profissionais (4)" [dado]
- "Horário" · "Camila Rocha"/"Nail Designer · 5 slots"; "Beatriz Lima"/"Lash & Brow · 4 slots"; "Juliana Prado"/"Hair Care · 3 slots" [dado]
- Slots: "Mariana Costa"/"Esmaltação em Gel · R$ 90,00"/"Finalizado"; "Carla Silveira"/"Design de Sobrancelha · R$ 65,00"/"Finalizado"; "Disponível"; "Vanessa Souza"/"Volume Russo (Manutenção)"/"Confirmado"/"10:15 - 11:45 · R$ 140,00"; "Fernanda M."/"Terapia Capilar + Escova"/"Aguardando"/"10:30 - 12:00 · R$ 220,00"; "Intervalo Almoço (12:30 - 13:30)"; "Alice Vianna"/"Lash Lifting · R$ 110,00"/"Confirmado"; "Patricia Novaes"/"Banho de Gel + Cutilagem"/"Confirmado"; "Renata Ramos"/"Corte + Tratamento Redken"/"Confirmado" [dado]
- Drawer: "Agendamento #4892" [dado] · "Detalhes da Sessão" [fixo] · "Em atendimento" [dado]
- "Rafaela Diniz" [dado] · "(83) 99654-2210" [dado] · "Cliente Recorrente" [dado]
- "Ciclo médio"/"21"/"dias"/"Ideal para o serviço" [dado]
- "Total de visitas"/"8"/"em 2024"/"Última: há 19 dias (Camila)" [dado — **ano 2024**]
- "Serviço & Horário" [fixo] · "Página Pública (Link da Bio)" [dado]
- "10:00 às 12:30 (Duração estimada: 2h30)" [dado] · "Camila Rocha"/"Profissional responsável (Nail Designer)" [dado]
- "Alongamento em gel" / "R$ 180,00" [dado]
- "Sinal pago R$ 30,00 via Pix" / "Comp. #PIX-99824-A1 · Confirmado" [dado]
- "Valor a pagar no estúdio" / "Cartão, Dinheiro ou Pix final" / "R$ 150,00" [dado/fixo]
- "Observações da Cliente" [fixo] · "Tem preferência por formato amendoado natural. Chegou com 5 min de antecedência." [dado]
- "Agendado em 14/09 às 21:14" / "Lembrete WhatsApp enviado" [dado]
- "Concluir atendimento & Receber" / "Confirmar" / "Remarcar" / "Cliente faltou" / "Cancelar" [fixo]

### Ícones
`close`, `repeat`, `link`, `schedule`, `badge`, `payments`, `check_circle`, `notes`, `task_alt`, `edit_calendar`, `person_off`, `cancel`, `verified`, `chat`.

### Cores e tipografia
- Rótulos em **maiúsculas com tracking largo**: "Agendamento #4892" (`uppercase tracking-wider`), "Serviço & Horário" (`uppercase tracking-wide`), "Observações da Cliente" (`uppercase tracking-wider`) — vai contra a regra explícita do DESIGN.md.
- Valor "a pagar no estúdio" em 24px extra-bold `text-primary` — maior que os demais valores da tela; sem correspondência clara de hierarquia no DESIGN.md (métricas grandes vão de 32-40px, este é menor e ainda assim o mais destacado da tela).
- Valores monetários com centavos ("R$ 180,00") — outras telas do conjunto usam "R$ 180" sem centavos.

### Estados
- Cartão em foco na agenda: `scale-[1.01]` + sombra `shadow-md` (indica seleção).
- Slot "Finalizado": `opacity-75`.
- Chip "Em atendimento": `animate-pulse`/`animate-ping`.
- Drawer abre/fecha via `translateX` controlado por JS (clique no card ou no botão fechar/backdrop).
- Botões do rodapé têm 3 níveis visuais: primário cheio, secundário tonal (`/10` do respectivo token), terciário só texto — hierarquia de ação bem demarcada.

### Diferenças em relação ao DESIGN.md
1. **"Plano Pro"** de novo na sidebar.
2. **Data "em 2024"** ("Total de visitas... 8 em 2024") — ano proibido pelo DESIGN.md (exemplos devem ser 2026).
3. Três rótulos em caixa alta com tracking largo ("Agendamento #4892", "Serviço & Horário", "Observações da Cliente"), contrariando a regra explícita "não usar caixa alta com espaçamento largo em rótulos comuns".
4. Data sem ano ("Terça, 17 de Setembro") repetindo o padrão divergente já visto na tela 3.

### Dados que o sistema não tem
"Ciclo médio" de retorno por cliente/serviço com selo "ideal"; número de comprovante Pix (`#PIX-99824-A1`); origem do agendamento rastreada ("Página Pública (Link da Bio)"); registro de horário exato de criação do agendamento ("Agendado em 14/09 às 21:14"); confirmação de envio de lembrete WhatsApp por agendamento; tag "Cliente Recorrente" automática.

---

## 6. `clientes-lista.html`

### Estrutura
Sidebar 248px (com **item extra "Funil CRM"**) + topbar 64px + `<main class="pt-16 px-space-lg py-space-lg">`:
1. Cabeçalho: título "Clientes" + contagem, alternador Lista/Fases + botão "Nova cliente".
2. Barra de controle: busca com atalho de teclado "/", ordenação (`<select>`), exportar; segunda linha com chips de fase CRM (com contadores) + 2 selects secundários (etiqueta, profissional).
3. Tabela rica (`overflow-x-auto`) com paginação no rodapé.

### Blocos
- **Chips de fase CRM**: "Todas 248", "Novo 24", "Recorrente 88", "Fiel 65", "Em risco 42", "Perdido 29" — pílulas com contador, a ativa em `bg-ink-light`.
- **Linha da tabela**: avatar com iniciais (36px) + nome (negrito, muda de cor no hover) + telefone (tabular) + até 2 etiquetas (ex.: "Clube VIP", selo de aniversário com ícone `cake`) — coluna "Cliente"; coluna "Fase CRM" (pílula colorida com bolinha, cores de Tailwind padrão: âmbar/verde/laranja/vermelho/azul, não tokens); "Última Visita" (data + "(há N dias)" ou "(hoje)" + serviço·profissional); "Ciclo Médio" (dias + ícone de pontualidade + legenda curta: "Muito pontual"/"Padrão regular"/"Ciclo estourado"/"Inativo há 4 ciclos"/"Histórico em formação"); "Retorno Previsto" (data + "em N dias", ou alerta "Venceu há N dias" em vermelho, ou "Inativa"/"Sugerir retorno"); "LTV Acumulado" (valor + "N atendimentos"); "Ações Rápidas" (3 botões 32px: WhatsApp, novo agendamento, mais opções — só aparecem/destacam-se no hover da linha via `group`).
- **Rodapé**: "Mostrando 1–10 de 248 clientes" + paginação numérica com reticências.

### Textos
- "Funil CRM" [fixo — **item de menu fora de escopo**]
- "Studio Aurora" [dado] · **"Plano Pro"** [dado] · "Ativo" [fixo, uppercase]
- "Clientes" [fixo] · "Studio Aurora" (badge) [dado] · "248 clientes cadastradas · 18 ativas este mês" [dado]
- "Lista" / "Fases" [fixo] · "Nova cliente" [fixo]
- "Buscar por nome, telefone, CPF ou etiqueta..." [fixo] · atalho "/" [fixo]
- Select ordenação: "Última visita (mais recente)", "Ciclo de retorno (mais urgente)", "Maior LTV (gasto acumulado)", "Ordem alfabética (A-Z)" [fixo]
- "Exportar" [fixo]
- Chips de fase: "Todas 248", "Novo 24", "Recorrente 88", "Fiel 65", "Em risco 42", "Perdido 29" [dado]
- Select etiquetas: "Etiquetas (Todas)", "Clube VIP", "Fidelidade", "Aniversário no mês", "Resgatável" [fixo]
- Select profissional: "Profissional (Todas)", "Camila", "Bruna", "Paula" [dado]
- Cabeçalhos: "Cliente", "Fase CRM", "Última Visita", "Ciclo Médio", "Retorno Previsto", "LTV Acumulado", "Ações Rápidas" [fixo]
- Linha 1: "Mariana Souza"/"(11) 98741-2039"/"Clube VIP"/"20/09"/"Fiel"/"12 set (há 5 dias)"/"Alongamento em gel · Camila"/"21 dias"/"Muito pontual"/"03 de out (em 16 dias)"/"R$ 1.820,00"/"14 atendimentos" [dado]
- Linha 2: "Rafaela Diniz"/"(11) 97120-4491"/"Fidelidade"/"Recorrente"/"17 set (hoje)"/"Manutenção Fibra · Camila"/"20 dias"/"Padrão regular"/"07 de out (em 20 dias)"/"R$ 1.120,00"/"9 atendimentos" [dado]
- Linha 3: "Beatriz Costa"/"(11) 96328-1190"/"Resgatável"/"Em risco"/"05 ago (há 43 dias)"/"Manutenção Fibra · Camila"/"21 dias"/"Ciclo estourado"/"Venceu há 22 dias"/"Sem agendamento"/"R$ 890,00"/"7 atendimentos" [dado]
- Linha 4: "Letícia Albuquerque"/"(11) 99812-7801"/"VIP Cílios"/"Fiel"/"17 set (hoje)"/"Volume Russo · Bruna"/"28 dias"/"Ciclo exato"/"15 de out (em 28 dias)"/"R$ 2.340,00"/"12 atendimentos" [dado]
- Linha 5: "Carla Silveira"/"(11) 95530-9921"/"Não retornou"/"Perdido"/"14 mai (há 126 dias)"/"Pé e Mão · Paula"/"30 dias"/"Inativo há 4 ciclos"/"Inativa"/"Campanha de resgate"/"R$ 420,00"/"3 atendimentos" [dado]
- Linha 6: "Juliana Paes"/"(11) 94451-8819"/"Primeira vez"/"Novo"/"17 set (hoje)"/"Corte e Escova · Paula"/"1ª visita"/"Histórico em formação"/"Sugerir retorno"/"em ~45 dias"/"R$ 160,00"/"1 atendimento" [dado]
- "Mostrando 1–10 de 248 clientes" [dado] · "Anterior" / "1" "2" "3" "…" "25" / "Próxima" [fixo]

### Ícones
`view_kanban`, `today`, `event_upcoming`, `group`, `point_of_sale`, `loyalty`, `chat`, `bar_chart`, `storefront`, `settings`, `search`, `notifications`, `person`, `format_list_bulleted`, `person_add`, `expand_more`, `download`, `cake`, `chat`, `add_circle`, `more_vert`, `check_circle`, `warning`.

### Cores e tipografia
- Fases CRM usam cores padrão do Tailwind não tokenizadas: `amber-50/700` (Fiel), `green-50/700` (Recorrente), `orange-50/700` (Em risco/Resgatável), `red-50/700` (Perdido), `blue-50/700` (Novo/Primeira vez) — nenhuma corresponde aos tokens do DESIGN.md.
- Badge "Ativo" do plano: `uppercase tracking-wider text-[10px]`.
- Cabeçalho da tabela: `uppercase tracking-wider text-[11px]`.
- Um `span` de nome de cliente mistura classes de escalas diferentes (`font-title-md text-body-md`) — inconsistência interna do export, não necessariamente intencional.

### Estados
- Hover de linha: `bg-surface-2-light/60`; nome do cliente muda para `text-primary` no hover (`group-hover`).
- Ações rápidas (WhatsApp/agendar/mais) sempre visíveis nesta versão (não há classe de ocultar e revelar no hover, ao contrário do que o `group` sugere para o nome).
- Botão "Anterior" desabilitado (`disabled`, `opacity-50 cursor-not-allowed`).
- Atalho de teclado "/" foca a busca via JS.

### Diferenças em relação ao DESIGN.md
1. Item de menu **"Funil CRM"** — explicitamente listado como fora de escopo no DESIGN.md.
2. **"Plano Pro"** na sidebar.
3. Badge "Ativo" e cabeçalhos de tabela em caixa alta com tracking largo.
4. Cores de fase de cliente usam a paleta padrão do Tailwind (âmbar/verde/laranja/vermelho/azul), sem nenhuma relação com os tokens do DESIGN.md — natural, já que o próprio conceito de fase é fora de escopo.

### Dados que o sistema não tem
Toda a segmentação de CRM (fases Novo/Recorrente/Fiel/Em risco/Perdido, com contadores); etiquetas livres de cliente (Clube VIP, Fidelidade, VIP Cílios, Resgatável, Não retornou, Primeira vez); aniversário do cliente; "ciclo médio" e "retorno previsto" calculados automaticamente; LTV acumulado; exportação de dados; ordenação por "maior LTV" e "ciclo de retorno mais urgente".

---

## 7. `cliente-ficha.html`

### Estrutura
Sidebar 248px (com "Funil CRM") + topbar 64px + `<main class="pt-16 px-space-lg py-space-lg">`:
1. Breadcrumb "Clientes / Mariana Souza · ID #3842".
2. Cabeçalho da cliente (`rounded-2xl p-space-lg`): perfil + tags + ações + faixa de consentimento LGPD.
3. Grid de 4 métricas (`grid-cols-4`).
4. Corpo em 2 colunas: esquerda (`lg:col-span-5`, ficha técnica + galeria), direita (`lg:col-span-7`, linha do tempo).

### Blocos
- **Cabeçalho da cliente**: avatar 64px `rounded-2xl` com selo verde de "WhatsApp verificado"; nome (24px/700) + badge de fase "Fiel" (cor **hardcoded** `#B45309`) + telefone (`font-mono`); linha de tags: "Assinante Clube VIP" (ícone `stars`), "Aniversário em 3 dias (20/set)" (ícone `cake`), "Prefere Camila" (ícone `person_check`); botões "Conversar no WhatsApp" (verde), "Novo agendamento" (laranja), "mais opções".
- **Faixa LGPD**: `bg-surface-container-low rounded-xl`, ícone `verified_user` + texto "LGPD: Consentimento ativo para WhatsApp e lembretes automáticos de agendamento." + "Autorizado em 12/03/2024 via link da bio do Instagram" à direita.
- **4 cartões de métrica** (mesmo padrão da seção 0): "Ciclo médio de retorno" (21 dias, "Pontualidade 92%"), "Ticket médio" (R$130,00, "Gasto acumulado: R$ 1.820,00"), "Frequência presencial" (14 visitas, "Cliente assídua desde out/2023"), "Faltas / Cancelamentos" (1 falta, "Avisou com antecedência · 0 no-show").
- **Card "Ficha técnica – Unhas"**: alerta clínico em destaque (fundo `danger/10`, "Alergia & Restrição Clínica" + texto); lista de especificações em sub-cartões `bg-surface-2-light`: Formato/Tamanho (com um ícone SVG esquemático de unha), Cor & Estilo, Curvatura/Ápice (2 colunas), Observações da profissional; botão "Atualizar ficha técnica".
- **Card "Galeria de procedimentos"**: grid 2×2 de fotos quadradas (`aspect-square`), overlay gradiente inferior com legenda (data + serviço + "Por Camila"); botão "+ Anexar foto da sessão".
- **Linha do tempo de relacionamento**: filtros rápidos (Tudo/Agendamentos/Financeiro/WhatsApp/Avaliações); lista vertical com linha guia (`before:` pseudo-elemento) e ponto colorido por tipo de evento (agendamento em andamento, mensagem WhatsApp com balão de conversa, atendimento concluído com valor, avaliação com 5 estrelas, falta justificada, primeira visita/cadastro); botão "Carregar histórico anterior a março de 2024".

### Textos
- Breadcrumb: "Clientes" / "Mariana Souza" / "ID #3842" [dado]
- "Mariana Souza" [dado] · "Fiel" [dado] · "(83) 99876-5432" [dado]
- "Assinante Clube VIP" / "Aniversário em 3 dias (20/set)" / "Prefere Camila" [dado]
- "Conversar no WhatsApp" / "Novo agendamento" [fixo]
- "LGPD:" "Consentimento ativo para WhatsApp e lembretes automáticos de agendamento." [fixo] · "Autorizado em 12/03/2024 via link da bio do Instagram" [dado — **ano 2024**]
- "Ciclo médio de retorno"/"21"/"dias"/"Pontualidade 92%" [dado]
- "Ticket médio"/"R$"/"130,00"/"Gasto acumulado: R$ 1.820,00" [dado]
- "Frequência presencial"/"14"/"visitas"/"Cliente assídua desde out/2023" [dado — **ano 2023**]
- "Faltas / Cancelamentos"/"1"/"falta"/"Avisou com antecedência · 0 no-show" [dado]
- "Ficha técnica – Unhas" / "Configurações para Nail Designer" / "Editar" [fixo]
- "Alergia & Restrição Clínica" / "Sensível a primer ácido. Usar exclusivamente primer adesivador sem ácido." [dado]
- "Formato preferido" / "Amendoado (Almond)" / "Comprimento" / "Tamanho 2" [dado]
- "Cor & Estilo de assinatura" / "Nude rosado com glitter discreto / francesinha sorriso fina" [dado]
- "Curvatura estrutural" / "Curvatura C fechada" / "Ponto de tensão (Ápice)" / "Ápice moderado" [dado]
- "Observações da profissional" / "Cutícula muito fina e aderida à lâmina. Hidratar abundantemente com óleo de jojoba prensado a frio no acabamento final." [dado]
- "Atualizar ficha técnica" [fixo]
- "Galeria de procedimentos" / "4 fotos registradas" / "Ver todas" [fixo/dado]
- Legendas de foto: "12 set - Manutenção Fibra", "22 ago - Esmaltação em Gel", "01 ago - Alongamento Inicial", "10 jul - Manutenção", todas "Por Camila" [dado]
- "+ Anexar foto da sessão" [fixo]
- "Linha do tempo de relacionamento" / "Histórico cronológico de sessões, pagamentos e conversas" [fixo]
- Filtros: "Tudo", "Agendamentos", "Financeiro", "WhatsApp", "Avaliações" [fixo]
- Eventos: "17 set (Hoje) · Em andamento"/"Confirmado"/"Alongamento em Gel com Camila"/"Horário previsto: 10:00 - 12:30 (Cadeira 02)"/"Sinal Pix R$ 30,00 confirmado"/"Restante: R$ 100,00 no local"; "16 set (Ontem) às 14:15"/"Respondeu"/"Lembrete automático enviado via WhatsApp:"/"Olá Mariana!..."/"Cliente: 'Confirmadíssimo!'"; "12 set às 11:45"/"R$ 135,00"/"Atendimento Concluído com Camila"/"Manutenção Fibra de Vidro (R$ 110,00) + Óleo Hidratante Homecare (R$ 25,00)"/"Pago integralmente via Pix (Caixa Diário #219)"; "12 set às 18:20"/5 estrelas/"Camila é maravilhosa, minhas unhas duram intactas o mês todo!"/"Recebida via link de satisfação pós-atendimento"; "22 ago"/"R$ 70,00"/"Esmaltação em Gel"/"Atendimento rápido com Camila · Pago em Cartão Débito"; "15 jul · Falta Registrada (Justificada)"/"Aviso prévio"/"Cliente precisou remarcar por motivo de viagem imprevista a trabalho com 24h de antecedência. Sinal de R$ 30,00 remanejado com sucesso para a sessão seguinte."; "12 mar 2024"/"Primeira Visita & Cadastro Inicial"/"Realizou auto-agendamento e cadastro inicial pelo link da bio do Instagram do Studio Aurora." [dado — **12 mar 2024**]
- "Carregar histórico anterior a março de 2024" [dado — **2024**]

### Ícones
`group`, `stars`, `cake`, `person_check`, `chat`, `add_circle`, `more_vert`, `verified_user`, `sync`, `payments`, `check_circle`, `event_busy`, `brush`, `warning`, `edit`, `tune`, `photo_library`, `add_a_photo`, `event_available`, `done_all`, `reply`, `check`, `paid`, `star` (×5), `task_alt`, `schedule`, `flag`; ícone SVG customizado (não Material Symbols) de "formato de unha amêndoa".

### Cores e tipografia
- Badge de fase "Fiel" usa **hex hardcoded** `bg-[#B45309]/15 text-[#B45309]` — cor fora de qualquer token, nem sequer definida no `tailwind.config` do arquivo.
- Telefone em `font-mono` (não Plus Jakarta Sans).
- Métricas grandes em `font-headline-lg` = 32px/700 — aqui sim bate com a escala de "métricas grandes" do DESIGN.md (32-40px).
- Rótulo do evento "Hoje" na timeline: `uppercase tracking-wide`.

### Estados
- Timeline com filtro "Tudo" ativo (`bg-surface-light shadow-xs`) vs. inativos (`text-muted-light`).
- Fotos da galeria: `group-hover:scale-105` (zoom leve no hover).
- Sem estados vazio/erro/carregando representados.

### Diferenças em relação ao DESIGN.md
1. **Card "Ficha técnica – Unhas"** é inteiramente específico do segmento de nail design (formato de unha, curvatura, ápice) — contraria diretamente a regra de neutralidade de segmento do DESIGN.md ("a mesma interface serve a uma barbearia e a um estúdio de cílios"); um equivalente para barbearia precisaria de campos completamente diferentes.
2. Três datas em **2024/2023** ("Autorizado em 12/03/2024", "desde out/2023", "12 mar 2024", "histórico anterior a março de 2024") — anos proibidos pelo DESIGN.md.
3. Cor hex hardcoded (`#B45309`) fora da paleta de tokens.
4. Rótulo "Hoje" em caixa alta com tracking largo na timeline.
5. "Funil CRM" de novo no menu (herdado do shell).

### Dados que o sistema não tem
Ficha técnica por especialidade (campos de unha: formato, curvatura, ápice, alergias); galeria de fotos por atendimento; selo "WhatsApp verificado"; consentimento LGPD com data e canal de autorização; linha do tempo unificada cruzando agendamento + pagamento + WhatsApp + avaliação; avaliação com nota e comentário; tag de preferência de profissional; aniversário do cliente; "Cadeira 02" (numeração de posto de atendimento); "Caixa Diário #219" (referência a um fechamento de caixa específico).

---

## 8. `caixa.html`

### Estrutura
Único arquivo com ícones SVG desenhados à mão (não Material Symbols) e paleta de tokens simples (ver 0.1/0.2). Sidebar 248px + `<main class="ml-[248px] p-8">` → `<div class="max-w-[1240px] mx-auto flex flex-col gap-6">`:
1. Breadcrumb + usuário.
2. Cabeçalho "Caixa do dia" + botão "Fechar caixa".
3. `<section class="grid grid-cols-4 gap-5">` — 4 cartões de métrica.
4. Seção "Entradas por forma de pagamento" — grid de 6 colunas.
5. `<div class="grid grid-cols-12 gap-6">` — coluna esquerda (`col-span-8`, tabela de comandas) + coluna direita (`col-span-4`, despesas + conferência de dinheiro).

### Blocos
- **Cartão de métrica** (padrão da seção 0, `rounded-card` = 16px): "Entradas" (R$ 1.845,00, "14 recebimentos confirmados", ícone seta para cima em `bg-emerald-50`), "Saídas" (R$ 120,00, "2 despesas operacionais", `bg-rose-50`), "Saldo" (R$ 1.875,00, "Físico + digital apurado", `bg-orange-50`), "Comandas" (16, "13 fechadas · 2 abertas · 1 falta").
- **Entradas por forma de pagamento**: 6 mini-cartões (`bg-surface-2/60 border p-3.5`) — Pix, Sinais Pix, Débito, Crédito, Dinheiro, Clube e pacotes — cada um com rótulo, percentual (pílula), valor (18px/700) e contagem de transações.
- **Tabela "Comandas do dia"**: colunas Hora, Cliente (+telefone), Profissional, Serviços, Pagamento, Total (alinhado à direita), Status (chip central: "Fechada" verde, "Aberta" âmbar, "Falta" vermelho — todos em **hex hardcoded**, não tokens). Linha de falta com valor riscado. Rodapé "Mostrando 6 de 16 comandas" + paginação simples.
- **"Despesas do dia"**: bolinha vermelha + título + total negativo; lista de despesas (`bg-surface-2/60`), cada uma com nome, valor, descrição curta e rodapé (hora + quem lançou + forma de pagamento); botão "Nova despesa".
- **"Conferência do dinheiro em espécie"**: bolinha laranja + título + selo "Bate 100%" (verde); lista fundo/entradas/saídas em dinheiro; "Total esperado na gaveta" em destaque (18px extra-bold); nota de conformidade com ícone de check.

### Textos
- "GESTÃO DE BELEZA" [fixo, uppercase] · "Studio Aurora" [dado] · **"Plano Equipe"** [dado — correto]
- "Studio Aurora / Financeiro / Caixa do dia" [fixo]
- "Carla" / "Administradora" [dado]
- "Caixa do dia" [fixo] · "terça, 17 de setembro de 2026 · aberto às 07:45 por Carla · saldo inicial R$ 150,00" [dado — data no formato exato do DESIGN.md]
- "Fechar caixa" [fixo]
- "Entradas"/"R$ 1.845,00"/"14 recebimentos confirmados"; "Saídas"/"R$ 120,00"/"2 despesas operacionais"; "Saldo"/"R$ 1.875,00"/"Físico + digital apurado"; "Comandas"/"16"/"13 fechadas"/"2 abertas"/"1 falta" [dado]
- "Entradas por forma de pagamento" / "Total faturado: R$ 1.845,00" [dado]
- "Pix"/"45,5%"/"R$ 840,00"/"6 no balcão"; "Sinais Pix"/"13,0%"/"R$ 240,00"/"8 antecipados"; "Débito"/"20,9%"/"R$ 385,00"/"3 transações"; "Crédito"/"14,1%"/"R$ 260,00"/"2 transações"; "Dinheiro"/"6,5%"/"R$ 120,00"/"1 na gaveta"; "Clube e pacotes"/"6,0%"/"R$ 110,00"/"1 crédito plano" [dado]
- "Comandas do dia" / "Visão consolidada dos atendimentos realizados no dia" / "6 de 16 atendimentos" [fixo/dado]
- Cabeçalhos: "Hora", "Cliente", "Profissional", "Serviços", "Pagamento", "Total", "Status" [fixo]
- Linhas: "10:00"/"Mariana Souza"/"(83) 98412-2201"/"Camila Rocha"/"Manutenção Gel + Óleo"/"Pix balcão"/"R$ 115,00"/"Fechada"; "10:15"/"Letícia Albuquerque"/"(83) 97103-9944"/"Bruna Lima"/"Cílios Volume Russo"/"Crédito 1x"/"R$ 210,00"/"Fechada"; "11:30"/"Beatriz Costa"/"(83) 99344-1299"/"Camila Rocha"/"Manutenção Fibra Vidro"/"Em atendimento"/"R$ 110,00"/"Aberta"; "12:00"/"Juliana Mendes"/"(83) 98823-1100"/"Bruna Lima"/"Design Sobrancelhas + Buço"/"Sinal Pix (R$ 30) + Débito"/"R$ 105,00"/"Fechada"; "12:30"/"Camila Prado"/"(83) 99120-8844"/"Paula Mendes"/"Corte Bordado + Escova"/"Não compareceu"/"R$ 140,00" (riscado)/"Falta"; "13:15"/"Renata Vasconcelos"/"(83) 99711-5432"/"Camila Rocha"/"Pé & Mão Simples Tradicional"/"Dinheiro em espécie"/"R$ 120,00"/"Fechada" [dado]
- "Mostrando 6 de 16 comandas" [dado] · "1" "2" "Próxima" [fixo]
- "Despesas do dia" / "- R$ 120,00" [dado]
- "Distribuidora de cosméticos"/"R$ 80,00"/"Lixas descartáveis e luvas de nitrila"/"09:10 · Lançado por Carla"/"Débito estúdio"; "Café e água"/"R$ 40,00"/"Café expresso em grãos e galão de água"/"10:45 · Lançado por Carla"/"Pix estúdio" [dado]
- "Nova despesa" [fixo]
- "Conferência do dinheiro em espécie" / "Bate 100%" [fixo/dado]
- "Fundo inicial de troco"/"R$ 150,00"; "(+) Entradas em dinheiro"/"+ R$ 120,00"; "(-) Saídas em dinheiro"/"- R$ 0,00"; "Total esperado na gaveta"/"R$ 270,00" [dado]
- "Valores conferidos na abertura e sem discrepâncias detectadas." [fixo]

### Ícones
Todos em SVG stroke desenhado à mão (não Material Symbols): calendário, relógio, pessoas, caixa registradora (ativo), estrela/prêmio, WhatsApp, gráfico de barras, casa, engrenagem, seta para cima/baixo, caixa/comanda, mais, check.

### Cores e tipografia
- `tailwind.config` mais próximo do DESIGN.md de todo o conjunto (ver 0.1); `borderRadius.card = 16px` e `borderRadius.btn = 10px` batem exatamente com a especificação.
- Ainda assim, ícones de fundo dos cartões usam `bg-emerald-50`, `bg-rose-50`, `bg-orange-50` (paleta padrão do Tailwind) em vez de `success/10`, `danger/10`, `brand-text/10`.
- Chips de status da tabela usam **hex hardcoded**: `bg-[#DCFCE7]` (Fechada), `bg-[#FEF3C7]` (Aberta), `bg-[#FEE2E2]` (Falta) — mesma ideia de "12% da cor" do DESIGN.md, mas implementada com hex fixo em vez de opacidade sobre o token.
- Título "GESTÃO DE BELEZA" no logo da sidebar em caixa alta com tracking largo.
- Cabeçalho da tabela em caixa alta com tracking largo (`text-[11px] font-bold tracking-wider uppercase`).
- Data no formato exatamente igual ao exemplo do DESIGN.md ("terça, 17 de setembro de 2026").

### Estados
- Hover de linha da tabela: `bg-surface-2/40`.
- Linha "Aberta" tem fundo destacado (`bg-orange-50/20`) mesmo sem hover.
- Linha "Falta": valor riscado (`line-through`) e cinza.
- Botão "Anterior"/página 1 com estado ativo (`bg-surface-2 border`).
- Sem estados vazio/erro/carregando.

### Diferenças em relação ao DESIGN.md
1. Ícones SVG desenhados à mão em vez de Material Symbols — quebra o padrão de ícones usado nas outras 9 telas.
2. Chips de status com hex hardcoded em vez de opacidade sobre token.
3. Ícones de métrica com cores padrão do Tailwind (`emerald-50`/`rose-50`/`orange-50`) não tokenizadas.
4. "GESTÃO DE BELEZA" e cabeçalhos de tabela em caixa alta com tracking largo.

(Esta é, no geral, a tela mais alinhada ao DESIGN.md do conjunto — nome de plano, data e nomenclatura de tokens corretos.)

### Dados que o sistema não tem
Todo o modelo de "comanda" (aberta/fechada/falta) como unidade de atendimento; abertura/fechamento de caixa com saldo inicial e horário; detalhamento de entradas por forma de pagamento com percentual; registro de despesas do dia com categoria e quem lançou; conferência/bate de caixa em dinheiro (fundo de troco, entradas/saídas em espécie, "bate 100%").

---

## 9. `whatsapp-conexao.html`

### Estrutura
Sidebar 248px + topbar 64px + **sub-navegação de segundo nível fixa** (`h-12`, abas: Hora de voltar / Automações / Campanhas / Conversas / **Conexão** ativa) + `<main class="pt-28 px-space-xl pb-space-xl">`:
1. Cabeçalho com breadcrumb, título, descrição e ações ("Sincronizado há 1 min", "Atualizar status").
2. Cartão "status da linha" com KPIs de conexão (grid 4 col.) e painel de webhook oculto por padrão (`toggleWebhookDetails`).
3. `grid-cols-12`: bloco "Saúde e Limite de Envios de Hoje" (`col-span-6`) + bloco "Boas Práticas & Dicas Anti-bloqueio" (`col-span-6`, lista numerada de 5 itens).
4. Tabela "Histórico Recente de Sincronização e Disparos" (5 linhas).
5. Modal oculto de "Sincronização Meta" com QR code (SVG) — abre via `openReconnectModal()`.

### Blocos
- **Cartão de status principal**: ícone `verified` num quadrado 56px, nome do negócio + pílula "Conectado e Operacional"; subtítulo "WhatsApp Business Cloud API Oficial • Meta Verified Enterprise"; 3 botões ("Testar conexão", "Reconectar / QR Code", "Webhook & Meta ID"); grid de 4 KPIs (Número Oficial Conectado, Latência Média de Envio, Certificado Meta WABA, Taxa de Bloqueio 48h); painel de webhook oculto com endpoint e token mascarado + botões "Copiar".
- **"Saúde e Limite de Envios de Hoje"**: selo "ALTA • Excelente"; barra de consumo diário (68/250 disparos, 27,2%); 2 mini-cartões (Taxa de Entrega 99,4%, Denúncias/Spam 0); lista "Breakdown dos Envios de Hoje" (3 linhas com ícone, rótulo e contagem); botão "Solicitar aumento de limite de disparos".
- **"Boas Práticas & Dicas Anti-bloqueio"**: 5 itens numerados (bolinha 1-5) com título em negrito e explicação.
- **Tabela de histórico**: colunas Timestamp, Destinatário/Cliente (avatar+nome+telefone mascarado), Tipo de Disparo (ícone+texto), Latência, Status do Envio (chip "Entregue e Lido").
- **Modal QR**: cabeçalho com título + fechar; QR code (SVG estático); texto explicativo; botões "Fechar"/"Concluído".

### Textos
- "Canais & Mensageria / Linha Oficial" [fixo, uppercase]
- "Conexão e Saúde do WhatsApp" [fixo] · "Gerencie a linha oficial do Studio Aurora, monitore os limites seguros de envio e previna restrições operacionais junto à Meta." [fixo]
- "Sincronizado há 1 min" / "Atualizar status" [fixo]
- "Studio Aurora Beleza & Estética" [dado] · "Conectado e Operacional" [fixo]
- "WhatsApp Business Cloud API Oficial • Meta Verified Enterprise" [fixo — **termos proibidos**]
- "Testar conexão" / "Reconectar / QR Code" / "Webhook & Meta ID" [fixo]
- "Número Oficial Conectado" / "+55 (83) 98120-4000" [dado] / "Linha Própria Dedicada" [fixo]
- "Latência Média de Envio" / "1,4 s" / "p95" / "Resposta quase instantânea" [dado/fixo]
- "Certificado Meta WABA" / "Tier 1 Cloud API" / "WABA-ID: 498210398411" [fixo/dado — **termo proibido "WABA"**]
- "Taxa de Bloqueio (48h)" / "0,0%" / "Zero reports" / "Reputação Ótima" [dado/fixo]
- "Credenciais de Webhook Ativo" / "TLS 1.3 Criptografado" / "Endpoint: https://api.easyagenda.com.br/wh/v2/aurora-waba" / "Callback Token: ea_live_9941a87b***84b" / "Copiar" [fixo/dado]
- "Saúde e Limite de Envios de Hoje" / "ALTA • Excelente" [fixo]
- "Consumo diário seguro" / "68" / "/ 250 disparos" / "27% utilizado" / "182 mensagens disponíveis hoje" [dado]
- "Taxa de Entrega" / "99,4%" / "+0.2% comparado a ontem" [dado]
- "Denúncias / Spam" / "0" / "Zona verde da Meta" [dado/fixo]
- "Breakdown dos Envios de Hoje" / "Lembretes e confirmações automáticas" "42" / "Notificações de sinal Pix & Recibos" "16" / "Mensagens manuais / Chat humano" "10" [dado]
- "Solicitar aumento de limite de disparos" [fixo]
- "Boas Práticas & Dicas Anti-bloqueio" / "Diretrizes Meta" [fixo]
- "O EasyAgenda+ aplica proteções inteligentes em tempo real..." [fixo]
- 5 dicas: "Somente contatos com consentimento (LGPD)"; "Personalize com variáveis dinâmicas" (tags `{nome}`, `{horarios}`); "Intervalos seguros automáticos" ("pausa entre 45 e 90 segundos"); "Opção clara de descadastro automático" (responder "PARAR"); "Responda rápido aos chamados humanos" [fixo]
- "Conformidade Meta Business API v20.0" / "Consultar documentação →" [fixo]
- "Histórico Recente de Sincronização e Disparos" / "Últimos 5 eventos processados em tempo real pela Cloud API" / "Webhook Escutando (porta 443)" [fixo]
- Cabeçalhos: "Timestamp", "Destinatário / Cliente", "Tipo de Disparo", "Latência", "Status do Envio" [fixo]
- Linhas: "Hoje, 11:42:08"/"Juliana Mendes"/"+55 83 99611-****"/"Lembrete de Consulta (2h antes)"/"1.1s"/"Entregue e Lido"; "Hoje, 11:38:15"/"Camila Rocha"/"+55 83 98842-****"/"Comprovante de Sinal Pix R$ 35,00"/"0.9s"/"Entregue e Lido"; "Hoje, 11:15:22"/"Beatriz Silveira"/"+55 83 99105-****"/"Confirmação de Agendamento"/"1.4s"/"Entregue e Lido"; "Hoje, 10:52:49"/"Lucas Peixoto"/"+55 83 98722-****"/"Resposta manual via Painel"/"1.2s"/"Entregue e Lido"; "Hoje, 10:20:04"/"Mariana Costa"/"+55 83 99344-****"/"Campanha: Hora de Voltar (30 dias)"/"1.6s"/"Entregue e Lido" [dado]
- Modal: "Sincronização Meta" / "Escaneie com o app do WhatsApp Business" / "Apenas necessário caso deseje pareamento híbrido ou renovação de token expirado." / "Fechar" / "Concluído" [fixo — **"Sincronização Meta" e "pareamento híbrido" contrariam o modelo simples de QR code**]
- Alerta JS: "Sua solicitação de elevação de limite para 500 mensagens/dia foi encaminhada à equipe de suporte Meta da EasyAgenda+!" [fixo]

### Ícones
`calendar_month`, `today`, `calendar_today`, `group`, `point_of_sale`, `card_membership`, `chat`, `bar_chart`, `public`, `settings`, `verified`, `search`, `notifications`, `person`, `sync`, `cell_tower`, `qr_code_scanner`, `webhook`, `check_circle`, `code`, `health_metrics`, `trending_up`, `notifications_active`, `payments`, `support_agent`, `shield`, `lock`, `history_toggle_off`, `alarm`, `receipt_long`, `done_all`, `event_available`, `cached`, `close`.

### Cores e tipografia
- Muitos rótulos em `uppercase tracking-wider`: breadcrumb, "Número Oficial Conectado", "Latência Média de Envio", "Certificado Meta WABA", "Taxa de Bloqueio (48h)", "Breakdown dos Envios de Hoje", cabeçalhos de tabela — o arquivo com mais ocorrências desse padrão no conjunto.
- Números/telefones/tokens em `font-mono` extensivamente.
- Cor `tertiary` usada para o ícone de "Notificações de sinal Pix & Recibos" — mesma cor sem token do DESIGN.md vista em `agenda-desktop.html`.
- **"Plano Pro"** no rodapé da sidebar.

### Estados
- `animate-pulse` na bolinha "Sincronizado há 1 min".
- Botão "Testar conexão" (`runDiagnostic()`): desabilita, muda texto para "Testando ping API..." → "Online: 1,4s latência OK" → volta ao rótulo original (simulação de teste assíncrono via `setTimeout`).
- Ícone de "Atualizar status" gira (`animate-spin`) por 900ms ao clicar (`testConnection()`).
- Painel de webhook oculto por padrão, alternado por `toggleWebhookDetails()`.
- Modal de QR oculto por padrão (`hidden`), aberto por `openReconnectModal()`, fechado por `closeModal()` ou botão "Concluído".
- Botão "Solicitar aumento de limite" dispara um `alert()` nativo do navegador — não é um padrão de UI a reproduzir.

### Diferenças em relação ao DESIGN.md
Esta é a tela com mais contradições do conjunto — o README já avisa que ela carrega "WhatsApp Oficial"/"WABA":
1. "Linha Oficial", "WhatsApp Business Cloud API Oficial", "Meta Verified Enterprise", "Certificado Meta WABA", "WABA-ID", "Sincronização Meta", "Conformidade Meta Business API v20.0" — todos os termos que o DESIGN.md proíbe explicitamente ("Não usar 'WhatsApp Oficial', 'Meta Cloud API', 'Verified' nem 'WABA'").
2. Toda a arquitetura de métricas (limite diário de disparos, taxa de bloqueio 48h, latência p95, certificação por camadas/"Tier") pressupõe uma integração via Cloud API oficial da Meta, incompatível com o modelo de "conexão por QR code no celular do negócio" descrito no DESIGN.md.
3. Painel técnico de webhook com endpoint e token de callback expostos na UI — detalhe de infraestrutura que não deveria aparecer para o dono do negócio.
4. **"Plano Pro"** de novo na sidebar.
5. Uso extenso de caixa alta com tracking largo em rótulos comuns (o pior caso do conjunto).
6. Modal de reconexão fala em "pareamento híbrido" e "renovação de token expirado" — vocabulário técnico de API oficial, não de simples escaneamento de QR code.

### Dados que o sistema não tem
Toda a seção de saúde/limite de disparos (consumo diário, taxa de entrega, denúncias/spam, breakdown por tipo de mensagem); histórico de sincronização com status de entrega por mensagem; credenciais de webhook; sub-navegação inteira de "Hora de voltar", "Automações", "Campanhas", "Conversas" (não detalhada nesta tela, mas presente como abas); latência de envio; certificação/tier de conta; solicitação de aumento de limite de disparos.

---

## 10. `ajustes-plano.html`

### Estrutura
Sidebar 248px + topbar 64px + `<main class="pt-16 px-space-lg">` cujo conteúdo inteiro (sub-abas de Ajustes + todas as seções) está aninhado dentro de um único `<div class="w-full bg-[#FFFFFF] border border-[#E2DFDB] rounded-[16px] p-1.5 shadow-sm">` — estrutura de contêiner pouco convencional (um "cartão" que envolve toda a página, mas cujo conteúdo interno tem seus próprios cartões e paddings independentes):
1. Sub-navegação de Ajustes (pílulas): Geral / Perfil do Estúdio / Equipe e Acessos / **Plano e Cobrança** (ativa) / Integrações / Notificações.
2. Cabeçalho da seção + 2 botões ("Relatório de Gastos", "Dúvidas Financeiras").
3. `grid-cols-12`: cartão "Plano Atual" (`col-span-8`) + cartão "Forma de Pagamento" (`col-span-4`).
4. Tabela "Histórico de Faturas e Pagamentos".
5. Rodapé "Deseja pausar ou cancelar a assinatura?" + nota de conformidade + link de suporte.

### Blocos
- **Cartão "Plano Atual"**: mancha decorativa desfocada (`blur-3xl`) no canto; cabeçalho com nome do plano + selo "Ativo" (pulsante) à esquerda, preço + próxima cobrança à direita; grid 2×2 "Recursos inclusos" (cada item = ícone colorido + título + descrição): profissionais na grade, robô WhatsApp, clube de assinaturas, sinal Pix; rodapé com nota "Sem multas de fidelidade..." + botões "Trocar para anual" / "Mudar de plano".
- **Cartão "Forma de Pagamento"**: cabeçalho + selo "Padrão"; cartão de crédito estilizado (bandeiras Mastercard em círculos sobrepostos, número mascarado, nome do titular em maiúsculas, validade); linha "Pix Automático" com check verde; aviso de débito automático (fundo verde/10); botão "Atualizar método de pagamento".
- **Tabela de faturas**: colunas Data, Referência/Período, Valor, Forma de Pagamento, Status ("Pago", verde), Comprovante/NF (botões "Fatura" PDF e "NFS-e"); filtro "Filtrar por Ano (2026)"; rodapé "Exibindo os últimos 4 lançamentos" + "Carregar histórico completo (2026)".
- **Rodapé de cancelamento**: ícone `pause_circle` + pergunta + parágrafo explicativo + botão vermelho "Cancelar assinatura"; linha de rodapé com cadeado + texto de conformidade + link "Fale com nosso financeiro via WhatsApp".

### Textos
- Sub-abas: "Geral", "Perfil do Estúdio", "Equipe e Acessos", "Plano e Cobrança", "Integrações", "Notificações" [fixo]
- "ASSINATURA ATIVA" [fixo, uppercase] · "Studio Aurora" [dado]
- "Plano e Cobrança" [fixo] · "Gerencie sua assinatura, consulte próximas renovações, métodos de pagamento e notas fiscais do seu estúdio." [fixo]
- "Relatório de Gastos" / "Dúvidas Financeiras" [fixo]
- **"Plano Equipe (Mensal)"** [dado — correto] · "Ativo" [dado] · "Ciclo mensal com renovação automática debitada na fatura cadastrada." [fixo]
- "R$ 99,90 / mês" [dado — correto] · "Próxima cobrança: 15 de Outubro de 2026 (em 28 dias)" [dado]
- "Recursos inclusos no seu pacote" [fixo]
- "Até 5 profissionais na grade" / "Carla Silva, Bruno Santos e 3 vagas livres" [dado]
- "Robô WhatsApp ilimitado" / "Lembretes automáticos e confirmações ativas" [fixo]
- "Clube de assinaturas e pacotes" / "Recorrência automática de clientes no balcão" [fixo]
- "Sinal Pix no agendamento" / "Prevenção contra faltas e no-shows" [fixo]
- "Sem multas de fidelidade ou taxa de cancelamento." [fixo]
- "Trocar para anual" / "Mudar de plano" [fixo]
- "Forma de Pagamento" / "Padrão" [fixo]
- "Mastercard" / "Débito Automático" / "•••• •••• •••• 8821" / "CARLA R. SILVA" / "Exp: 08/28" [dado]
- "Pix Automático" / "Chave ativa para cobrança recorrente" [fixo]
- "Débito automático ativo. A cobrança de R$ 99,90 será processada automaticamente no vencimento sem interrupção dos serviços." [dado]
- "Atualizar método de pagamento" [fixo]
- "Histórico de Faturas e Pagamentos" / "Acesse os comprovantes de quitação e realize o download das notas fiscais de serviço (NFS-e)." / "Filtrar por Ano (2026)" [fixo]
- Cabeçalhos: "Data", "Referência / Período", "Valor", "Forma de Pagamento", "Status", "Comprovante / NF" [fixo]
- Linhas: "15/Set/2026"/"Mensalidade EasyAgenda+ Equipe"/"Período: 15/Set a 14/Out de 2026"/"R$ 99,90"/"Mastercard •••• 8821"/"Pago"; "15/Ago/2026"/.../"Período: 15/Ago a 14/Set de 2026"/"R$ 99,90"/"Mastercard •••• 8821"/"Pago"; "15/Jul/2026"/.../"Período: 15/Jul a 14/Ago de 2026"/"R$ 99,90"/"Pix Automático"/"Pago"; "15/Jun/2026"/.../"Período: 15/Jun a 14/Jul de 2026"/"R$ 99,90"/"Pix Automático"/"Pago" [dado]
- "Fatura" / "NFS-e" [fixo] · "Exibindo os últimos 4 lançamentos" / "Carregar histórico completo (2026)" [fixo]
- "Deseja pausar ou cancelar a assinatura do Studio Aurora?" [dado] · "Ao cancelar, seu estúdio mantém acesso irrestrito a todos os recursos até 14 de Outubro de 2026. Seus dados de clientes, histórico de agendamentos nunca são apagados e podem ser exportados a qualquer momento em formato CSV ou Excel." [dado]
- "Cancelar assinatura" [fixo]
- "Cobrança segura intermediada por Asaas Instituição de Pagamento S.A. regulada pelo Banco Central do Brasil." [fixo]
- "Dúvidas com notas ou faturamento? Fale com nosso financeiro via WhatsApp" [fixo]

### Ícones
`calendar_today`, `dashboard`, `calendar_month`, `group`, `point_of_sale`, `loyalty`, `chat`, `analytics`, `storefront`, `settings`, `local_florist`, `chevron_right`, `search`, `notifications`, `person`, `receipt_long`, `help`, `badge`, `smart_toy`, `loyalty`, `qr_code_2`, `info`, `arrow_forward`, `credit_card`, `payments`, `check_circle`, `verified_user`, `edit`, `filter_list`, `picture_as_pdf`, `description`, `pause_circle`, `lock`, `chat`.

### Cores e tipografia
- Este arquivo é o que mais usa **cor hex hardcoded** em vez dos tokens do próprio `tailwind.config` (que define `primary-container`, `ink-light` etc.): praticamente todo o corpo usa `bg-[#FFFFFF]`, `border-[#E2DFDB]`, `text-[#1A1817]`, `text-[#66605B]`, `bg-[#F6F5F4]`, `text-[#FF7A00]`, `text-[#16A34A]`, `text-[#B34D00]`, `text-[#994700]`, `text-[#006399]`, `text-[#128C4A]`, `text-[#DC2626]`, além das cores reais das bandeiras (`#EB001B`/`#F79E1B` Mastercard, `#32BCAD` Pix) — nenhuma delas é um token do DESIGN.md.
- "ASSINATURA ATIVA" e o rótulo "Recursos inclusos..." em `uppercase tracking-wider`.
- Nome do titular do cartão "CARLA R. SILVA" em caixa alta (convenção de cartão de crédito, mas ainda um texto em maiúsculas fixo no HTML).
- Sidebar: ícone "Hoje" = `dashboard` (único arquivo com esse ícone) e "Relatórios" = `analytics` (único arquivo com esse ícone).

### Estados
- Selo "Ativo" do plano com `animate-pulse`.
- Sem outros estados dinâmicos (hover simples em botões, `hover:bg-...`).
- Sem estados vazio/erro/carregamento.

### Diferenças em relação ao DESIGN.md
1. Uso maciço de cores hex hardcoded no lugar dos tokens já definidos no próprio `tailwind.config` do arquivo — o pior caso de inconsistência token→uso do conjunto.
2. "Trocar para anual": alternância de cobrança anual não existe nos planos descritos no DESIGN.md (que define apenas preço mensal para Solo/Equipe/Salão).
3. Menção a processador de pagamento específico ("Asaas Instituição de Pagamento S.A.") — detalhe de fornecedor não previsto no DESIGN.md.
4. "ASSINATURA ATIVA" em caixa alta com tracking largo.
5. Ícones "Hoje" (`dashboard`) e "Relatórios" (`analytics`) divergem dos usados nas outras 9 telas.

(Nome do plano "Plano Equipe" e preço "R$ 99,90/mês" aqui **batem** corretamente com o DESIGN.md — ao contrário de 5 outras telas que dizem "Plano Pro".)

### Dados que o sistema não tem
Cartão de crédito salvo com bandeira e validade; débito automático e Pix automático como métodos de cobrança da assinatura; histórico de faturas com download de PDF e NFS-e; alternância de ciclo mensal/anual; exportação de dados do negócio em CSV/Excel ao cancelar; menção a processador de pagamento terceirizado (Asaas); relatório de gastos e "dúvidas financeiras" como fluxos próprios; sub-abas de Ajustes "Perfil do Estúdio", "Equipe e Acessos", "Integrações", "Notificações" (não detalhadas em nenhuma tela do conjunto).

---

## 11. Onde uma reimplementação mais provavelmente erra

- **`hoje-desktop.html`**: trocar `font-mono` por `tabular-nums` sobre Plus Jakarta Sans nos valores; ajustar o cartão de métrica para 32-40px (está em 28px); resolver o ícone de avaliação (`red-600` sem token) com um token real de `danger`.
- **`hoje-mobile.html`**: raio de cartão deve ir para 16px (o arquivo usa uma config custom de 12px); remover o gradiente do cartão "Em atendimento"; decidir um nome único para a métrica de recuperação via WhatsApp (o texto muda entre "via lembretes" e "via bot" conforme a tela).
- **`agenda-desktop.html`**: a lógica de posicionamento absoluto por `top`/`height` em pixels (80px/hora) precisa virar cálculo dinâmico, não markup fixo; decidir se o "encaixe inteligente" dentro de pausas de procedimento é uma feature real antes de tentar replicar o comportamento; resolver a cor `tertiary` sem token.
- **`agenda-mobile.html`**: o gesto de swipe (revelar "Concluir"/"Marcar falta" arrastando o cartão) é a peça central da tela e exige componente de gesto real, não apenas o visual estático; decidir a fonte das fotos de profissional (substituir os links do Google por avatares/iniciais).
- **`agendamento-detalhes.html`**: a largura fixa de 440px do drawer e seu comportamento de abrir sobre a agenda (não substituindo a tela) são o ponto mais fácil de simplificar incorretamente; os 3 rótulos em caixa alta com tracking largo precisam ser corrigidos; a data "em 2024" precisa virar 2026.
- **`clientes-lista.html`**: toda a camada de "Fase CRM" (chips, cores, coluna) é fora de escopo — decidir se a tabela existe sem ela muda a contagem de colunas e a lógica de ordenação inteira; o atalho de teclado "/" e a paginação numérica com reticências são fáceis de esquecer.
- **`cliente-ficha.html`**: o card "Ficha técnica – Unhas" é o item mais arriscado de copiar ao pé da letra — é 100% específico de nail design; a linha do tempo mistura 4 tipos de evento com pontos e cores diferentes, fácil de simplificar demais; três datas de 2023/2024 precisam ir para 2026.
- **`caixa.html`**: é a referência mais fiel ao DESIGN.md em tokens e nomenclatura — o erro mais provável é não perceber que os ícones são SVG à mão (Feather-style) e não Material Symbols, e replicar a inconsistência para as outras telas em vez de padronizar.
- **`whatsapp-conexao.html`**: quase todo o conteúdo de texto e a métrica de "saúde da API" pressupõem uma integração Meta Cloud API oficial — isso precisa ser inteiramente reescrito para o modelo de QR code do DESIGN.md antes de copiar qualquer estrutura visual; é também o arquivo com mais ocorrências de caixa alta com tracking largo.
- **`ajustes-plano.html`**: a estrutura de contêiner (tudo dentro de um único cartão externo `p-1.5`) não deve ser copiada literalmente; a quantidade de cor hex hardcoded no meio do arquivo é enganosa porque o próprio `tailwind.config` já tem os tokens certos — vale usá-los em vez de repetir os hex.
