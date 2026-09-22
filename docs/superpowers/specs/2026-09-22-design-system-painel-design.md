# Design: Design system e estrutura do painel (sub-projeto B)

## Contexto

Sub-projeto B do relançamento EasyAgenda+ (ver `2026-09-17-fundacao-easyagenda-design.md` para a lista completa de sub-projetos). Depende da Fundação (sub-projeto A), ainda não mesclada: o trabalho parte do branch `feat/fundacao-easyagenda`, no branch `feat/design-system-painel`.

A referência visual é o DESIGN.md do produto e as telas geradas no Google Stitch.

Estado do frontend no momento da especificação:
- Next.js 15 (App Router), React 18, Tailwind 3 com `darkMode: 'class'`.
- O painel é inteiramente escuro, com cores fixas nas classes: cerca de 1.300 usos de `text-white`, `bg-black`, `text-gray-*`, `border-white/*` e parecidos, e nenhum uso de variante `dark:`.
- O Tailwind só conhece a cor `primary` (#FF7A00) e três tons de preto.
- `globals.css` impõe `bg-black text-white` no `body` e Space Grotesk nos títulos; o `layout.tsx` raiz repete `bg-dark text-white` no `body`.
- Existe um `ThemeToggle` que alterna a classe `dark` no `<html>` sem efeito visível, porque nenhuma tela tem estilo para o claro.
- Navegação: um `Navbar` com 8 abas no topo (Dashboard, Agendamentos, Financeiro, Clientes, Serviços, Planos, WhatsApp, Configurações).
- O frontend não tem nenhum teste automatizado.
- Arquivos grandes: `SettingsModule.tsx` (994 linhas), `PricingPlansSection.tsx` (992, compartilhado entre a landing e `/dashboard/planos`), `WhatsAppModule.tsx` (559), `AuthConfirmView.tsx` (529).

## Decisões que moldam o escopo

1. **Tema padrão:** segue o aparelho (claro ou escuro), com troca manual entre Sistema, Claro e Escuro.
2. **Navegação:** a barra lateral mostra só o que existe (Hoje, Agenda, Clientes, Caixa, WhatsApp, Ajustes). Clube e pacotes, Relatórios e Minha página entram quando os sub-projetos correspondentes entregarem as telas.
3. **Escopo das telas:** o painel inteiro, as telas de login, cadastro, verificação de e-mail, esqueci/redefinir senha e confirmação, e a página de pagamento. Ficam de fora: landing, termos, privacidade (sub-projeto H) e SuperAdmin.
4. **Abordagem:** kit de componentes próprio, com os tokens em variáveis CSS e os primitivos acessíveis do Radix nas partes difíceis (modal, painel lateral, menu, abas). Modelo shadcn/ui: o código dos componentes fica no repositório.

## Objetivos

- Os tokens do DESIGN.md disponíveis no Tailwind, nos temas claro e escuro.
- Um kit de componentes que os sub-projetos C a I reutilizam.
- A nova estrutura do painel: barra lateral no desktop, barra inferior no celular.
- Todas as telas do escopo migradas para os tokens e o kit, sem mudança de comportamento.
- Testes automatizados no frontend, rodando no CI.

## Não-objetivos

- Funcionalidades novas que aparecem nas telas do Stitch (linha do tempo da agenda, fases do CRM, comanda, campanhas, métricas novas). Pertencem aos sub-projetos D a G.
- Mudar endereços de página: todos os caminhos atuais continuam iguais.
- Redesenhar a página de planos: os planos mudam no sub-projeto H.
- Landing, termos, privacidade e SuperAdmin.
- Onboarding (sub-projeto C).

## Parte 1 — Fundamentos

### Tokens

Valores exatamente como no DESIGN.md:

| token | claro | escuro |
|---|---|---|
| bg | #F6F5F4 | #0E0D0C |
| surface | #FFFFFF | #181615 |
| surface-2 | #EFEDEA | #211F1D |
| ink | #1A1817 | #F3F1EF |
| muted | #66605B | #A39D97 |
| line | #E2DFDB | #2E2B28 |
| brand | #FF7A00 | #FF7A00 |
| on-brand | #1A1817 | #1A1817 |
| brand-text | #B34D00 | #FF9A3D |
| whatsapp | #128C4A | #25D366 |
| success | #16A34A | #4ADE80 |
| warning | #D97706 | #FBBF24 |
| danger | #DC2626 | #F87171 |
| status-confirmed | #2563EB | #2563EB |

- Definidos como variáveis CSS em `frontend/src/styles/globals.css`: valores claros em `:root`, escuros em `.dark`. Como variáveis em cascata, qualquer subárvore com a classe `.dark` usa os valores escuros.
- Formato que permite transparência no Tailwind (canais RGB), para classes como `bg-success/12`.
- O Tailwind expõe as cores com os mesmos nomes (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-muted`, `border-line`, `bg-brand`, `text-on-brand`, `text-brand-text`, `bg-whatsapp`, `text-success`, `text-warning`, `text-danger`, `text-status-confirmed`), além dos raios `rounded-control` (10px), `rounded-card` (16px) e `rounded-full` (999px).
- Utilitário para dígitos tabulares (`tabular-nums`), aplicado a horários, valores e métricas.

Regras de uso do DESIGN.md que o kit aplica:
- Botão principal sempre `brand` com texto `on-brand`; no máximo um por tela.
- Verde (`whatsapp`) só em ações de WhatsApp.
- Laranja usado como texto sempre em `brand-text`.
- Status: confirmado = `status-confirmed`; aguardando confirmação ou sinal = `warning`; em atendimento = `brand`; concluído = `success`; faltou = `danger`; cancelado = `muted` com texto riscado. O chip usa fundo com 12% da cor e texto na cor.

### Tema

- `next-themes`, com `attribute="class"`, `defaultTheme="system"` e `enableSystem`, envolvendo a aplicação no `layout.tsx` raiz. `suppressHydrationWarning` no `<html>`.
- A escolha do usuário fica guardada pela própria biblioteca, sob a chave `easyagenda-theme` (a mesma que o `ThemeToggle` atual usa).
- Seletor de tema com três opções (Sistema, Claro, Escuro) em Ajustes › Negócio e no menu Mais do celular; no desktop, também no menu da conta no rodapé da barra lateral.
- O `ThemeToggle` atual é removido.

### Tipografia

- Plus Jakarta Sans em todo o escopo do B (já carregada via `next/font/local` como `--font-sans`).
- Corpo 15px/1.5; rótulos 13px peso 600; título de tela 24px peso 700; métricas de 32 a 40px peso 700 com dígitos tabulares.
- Nada de caixa alta com espaçamento largo em rótulos comuns.
- O Space Grotesk deixa de valer dentro do escopo do B: o contêiner do tema redefine `--font-display` para a mesma fonte do corpo. As páginas públicas continuam com Space Grotesk nos títulos.

### Isolamento das páginas públicas

As páginas públicas (landing, termos, privacidade) e o SuperAdmin usam cores fixas escuras e não podem mudar:
- O `body` deixa de impor `bg-black text-white` (em `globals.css` e no `layout.tsx` raiz).
- Cada página pública e o layout do SuperAdmin ganham um contêiner com `bg-black text-white` (o mesmo visual de hoje) e a classe `.dark`, para que qualquer token usado por dentro resolva para o escuro.
- As telas do escopo do B ficam sob um contêiner com `bg-bg text-ink` e a fonte do corpo nos títulos.
- As classes antigas de `globals.css` (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.field-label`, `.section-eyebrow`, `.card`, `.badge`, `.modal-backdrop`, `.modal-content`, `.tab-active`, `.tab-inactive`, `.skeleton`, `.empty-state`) permanecem enquanto páginas fora do escopo as usarem.

### Dependências novas

- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-visually-hidden`.
- `next-themes`.
- `class-variance-authority`, `clsx`, `tailwind-merge` (utilitário `cn()` para compor classes).
- Para testes: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react`.

Todas compatíveis com React 18 e Next.js 15.

### Referências no repositório

- `docs/design/DESIGN.md`: cópia do DESIGN.md do produto.
- `docs/design/stitch/`: o HTML atual das telas do Stitch usadas como referência no B (Hoje desktop e celular, Agenda diária desktop e celular, Detalhes do agendamento, CRM Clientes lista, Ficha da cliente, Caixa do dia, WhatsApp conexão, Ajustes plano e cobrança), baixado do projeto no Stitch, com um `README.md` listando o nome e o ID de cada tela.
- As telas do Stitch são referência de aparência, não de funcionalidade: onde mostram algo que o sistema ainda não faz, a migração ignora essa parte.

## Parte 2 — Kit de componentes e estrutura do painel

### Kit (`frontend/src/components/ui/`)

Um arquivo por componente, todos usando só tokens:

| Componente | Responsabilidade |
|---|---|
| `Button` | Variantes primário, secundário (surface-2 com borda line), fantasma, perigo e WhatsApp; tamanhos; estado "carregando" que desabilita; altura mínima de 44px no celular |
| `IconButton` | Botão só com ícone, com `aria-label` obrigatório |
| `Card` | Superfície com borda de 1px e raio de 16px, sem sombra |
| `MetricCard` | Rótulo muted 13px, valor 32px tabular, variação opcional com seta e cor semântica |
| `StatusChip` | Os seis status de agendamento com as cores e o texto riscado de cancelado |
| `Avatar` | Círculo de 32px com foto ou iniciais |
| `Table` | Tabela que rola dentro do próprio contêiner |
| `EmptyState` | Ícone de traço simples, uma frase e um botão com o próximo passo |
| `Skeleton` | Bloco de carregamento |
| `Field` | Rótulo, controle, dica e erro, ligados por `id`/`aria-describedby` |
| `Input`, `Select`, `Textarea` | Controles com raio de 10px e foco em `brand` |
| `Switch` | Interruptor acessível (substitui o `ToggleRow` de Ajustes) |
| `PasswordInput` | O atual, com o visual novo |
| `Modal` | Diálogo centralizado sobre Radix Dialog; foco preso, fecha com Esc; rola por dentro |
| `SidePanel` | Painel lateral de altura inteira sobre Radix Dialog; no celular ocupa a tela |
| `Tabs` | Abas sobre Radix Tabs |
| `DropdownMenu` | Menu de ações sobre Radix Dropdown Menu |
| `PageHeader` | Título da tela e ações |
| `Banner` | Faixa de aviso ou informação |
| `ThemeSelect` | Seletor Sistema / Claro / Escuro |
| `Toast` | O provedor atual, com o visual novo |

Os componentes antigos equivalentes (`ui/Modal`, `ui/EmptyState`, `ui/PageHeader`, `ui/StatsCard`, `ui/ThemeToggle`, `LoadingSkeleton`, `DashboardCards`) são substituídos e removidos quando nada mais os usar.

### Galeria do kit

- Página `/dev/ui` que mostra todos os componentes, em todas as variações, com o seletor de tema.
- Não depende de login nem do backend.
- Só existe fora de produção: a página chama `notFound()` quando `process.env.NODE_ENV === 'production'`, e o middleware não a protege.

### Estrutura do painel

`frontend/src/app/dashboard/layout.tsx` passa a renderizar um `AppShell`:

- **Desktop (largura ≥ 1024px):** barra lateral fixa de 248px:
  - topo: símbolo EasyAgenda+ e o nome do negócio;
  - itens de navegação, com ícone e rótulo, item ativo destacado;
  - rodapé: menu da conta com o tema e "Sair".
- **Celular (< 1024px):**
  - barra superior com o título da tela;
  - barra inferior fixa com Hoje, Agenda, **+**, Clientes e Mais, com área de toque mínima de 44px;
  - **+** leva para `/agendamentos?novo=1`; a tela de Agenda abre o modal de novo agendamento que já existe quando o parâmetro está presente e remove o parâmetro do endereço ao fechar;
  - **Mais** abre uma folha inferior com Caixa, WhatsApp, Ajustes, o seletor de tema e "Sair".
- O aviso do período de teste (`TrialBanner`) passa a usar o `Banner` com o token `warning`.
- O conteúdo fica em `<main id="main-content">`, preservando o link "Pular para o conteúdo".

### Mapa de navegação

| Item | Endereço | Ativo quando o caminho é |
|---|---|---|
| Hoje | `/dashboard` | `/dashboard` |
| Agenda | `/agendamentos` | `/agendamentos` |
| Clientes | `/clientes` | `/clientes` |
| Caixa | `/financeiro` | `/financeiro` |
| WhatsApp | `/whatsapp` | `/whatsapp` |
| Ajustes | `/configuracoes` | `/configuracoes`, `/servicos` ou `/planos` |

- A ordem da barra lateral é a do DESIGN.md, sem os itens ainda inexistentes: Hoje, Agenda, Clientes, Caixa, WhatsApp, Ajustes.
- Ajustes tem abas no topo da página: **Negócio** (`/configuracoes`), **Serviços e equipe** (`/servicos`), **Plano e cobrança** (`/planos`).
- Os endereços `/dashboard/<aba>` e os atalhos `/<aba>` continuam funcionando como hoje (middleware inalterado).
- O tipo `TabId` e a lista de abas do `Navbar` são substituídos por uma definição única da navegação (`frontend/src/lib/navigation.ts`), usada pela barra lateral, pela barra inferior, pelo menu Mais e pelos testes.

## Parte 3 — Migração das telas

### Regra

Cada tela mantém as mesmas funções, chamadas à API, estados de carregamento e erro, e textos. A mudança é de apresentação: tokens, componentes do kit e layout aproximado da tela do Stitch correspondente, onde a função já existe. Nenhuma funcionalidade nova. O diff fora de classes, marcação e imports deve ser mínimo e justificado.

### Telas e componentes

| Tela | Componentes envolvidos | Observação |
|---|---|---|
| Hoje (`/dashboard`) | `dashboard/page.tsx`, `DashboardCards`, `WeeklyChart`, `ProfitBar` | Métricas com `MetricCard`; gráficos com cores lidas dos tokens |
| Agenda (`/agendamentos`) | `AppointmentModule`, `appointments/*`, `ProfessionalAgenda` | Linha de agenda com horário tabular, faixa vertical na cor do status, `StatusChip`; abre o modal com `?novo=1` |
| Clientes (`/clientes`) | `ClientModule`, `clients/*` | Tabela no desktop, lista no celular; ficha no `SidePanel`; formulário no `Modal` |
| Caixa (`/financeiro`) | `FinanceModule`, `finance/*` | O PDF exportado não muda |
| WhatsApp (`/whatsapp`) | `WhatsAppModule`, `whatsapp/*` | Botões verdes só nas ações de WhatsApp |
| Ajustes › Negócio (`/configuracoes`) | `SettingsModule` | Dividido em componentes por seção, com o código movido sem mudar lógica; seletor de tema incluído |
| Ajustes › Serviços e equipe (`/servicos`) | `ServiceProfessionalModule`, `services/*` | — |
| Ajustes › Plano e cobrança (`/planos`) | `PricingPlansSection` | Não é migrado: fica dentro de um contêiner com a classe `.dark` e o fundo escuro atual, com as abas de Ajustes acima, até o sub-projeto H |
| Login e cadastro | `auth/AuthForm` | — |
| Verificação, esqueci/redefinir senha, confirmação | `auth/EmailVerificationView`, `auth/ForgotPasswordView`, `auth/ResetPasswordView`, `auth/AuthConfirmView` | — |
| Pagamento (`/pagamento`) | `pagamento/page.tsx` | — |
| Comuns | `billing/FeatureGate`, `billing/SubscriptionBlockCard`, `billing/CpfCnpjModal`, `Toast`, `ErrorBoundary` | — |

### Cores dos gráficos

Os gráficos (Recharts) recebem as cores lidas das variáveis CSS do tema ativo por um hook (`useThemeColors`), e são redesenhados quando o tema muda.

## Testes e verificação

- **Ferramenta:** Vitest com Testing Library e jsdom em `frontend/`, com script `npm test`. O CI ganha o passo `npm test` no job do frontend, antes do build.
- **Testes obrigatórios:**
  - variações e estados do kit (por exemplo: cada status do `StatusChip` com seu rótulo e cor; `Button` carregando fica desabilitado; `MetricCard` com variação positiva e negativa);
  - `Modal` e `SidePanel` abrem, prendem o foco e fecham com Esc;
  - navegação: itens e ordem exatos da barra lateral, da barra inferior e do menu Mais; item ativo para cada caminho da tabela, inclusive Ajustes em `/servicos` e `/planos`; destino do **+**;
  - `ThemeSelect` troca entre Sistema, Claro e Escuro;
  - Agenda abre o modal de novo agendamento quando há `?novo=1`.
- **Regra de cores por busca:** nos arquivos das telas do escopo e do kit, nenhuma ocorrência de `bg-black`, `text-white`, `text-black`, `bg-white`, `*-gray-*`, `*-zinc-*`, `*-neutral-*`, `white/…`, `black/…`, `bg-dark*`, `text-primary`, `bg-primary`, `border-primary`, `emerald-*`, `amber-*`, `rose-*`, `red-*`, `green-*`, `orange-*`, `sky-*`. Exceção única: o contêiner da página de planos.
- **Regra de comportamento:** a revisão de cada tela confere que chamadas à API, handlers e estados não mudaram.
- **Build e typecheck** do frontend continuam obrigatórios; os testes do backend continuam verdes.
- **Verificação visual:**
  - a galeria `/dev/ui` nos dois temas, no desktop e em 375px de largura;
  - a landing, os termos, a privacidade e o SuperAdmin conferidos visualmente contra o estado anterior depois da Parte 1;
  - no fim, o sistema rodando localmente para o dono percorrer as telas nos dois temas; isso exige as variáveis de ambiente do backend e do Supabase.

## Ordem de execução

1. **Base visual:** tokens, Tailwind, `next-themes`, tipografia, isolamento das páginas públicas e do SuperAdmin, referências em `docs/design/`, Vitest e o passo no CI.
2. **Kit de componentes** e galeria `/dev/ui`, com testes.
3. **Estrutura do painel:** `AppShell`, barra lateral, barra inferior, menu Mais, aviso do teste, abas de Ajustes, definição única da navegação.
4. **Telas**, uma tarefa cada: Hoje; Agenda; Clientes; Caixa; WhatsApp; Ajustes (Negócio, Serviços e equipe, contêiner de Plano); login e cadastro; demais telas de autenticação; pagamento e peças comuns.
5. **Limpeza:** remoção do `Navbar`, do `ThemeToggle` e dos componentes antigos substituídos; busca final de cores fixas.

## Riscos

| Risco | Mitigação |
|---|---|
| Lógica escondida em arquivos grandes quebrar na migração | Código movido sem alteração; a revisão compara o diff fora de classes e marcação |
| Landing, termos, privacidade ou SuperAdmin mudarem ao tirar o fundo do `body` | Contêiner escuro explícito em cada um, conferido visualmente logo após a Parte 1 |
| Contraste insuficiente no tema claro | Uso estrito dos tokens do DESIGN.md (laranja como texto só em `brand-text`) |
| Gráficos com cores erradas ao trocar de tema | `useThemeColors` e novo desenho na troca |
| Aviso de hidratação por causa do tema | `suppressHydrationWarning` no `<html>` e tema aplicado pelo `next-themes` antes da pintura |
| Galeria vazando para produção | `notFound()` em produção, verificado no build |
