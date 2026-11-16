# Política de cookies e pop-up de consentimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a política de cookies (`/cookies`) e um pop-up de consentimento que bloqueia o pixel da Meta até o aceite de Marketing.

**Architecture:** O consentimento vive em `localStorage` (`cookie_consent`), gerido por `lib/cookieConsent.ts` com um evento de janela para reagir a mudanças. `CookieBanner` (montado no `layout.tsx`, só nas rotas públicas) grava a escolha; `MetaPixel` só renderiza o script quando `marketing === true`. Banner e páginas legais ficam sempre no tema claro via `ForcedLight`.

**Tech Stack:** Next.js 15 (app router), React 18, Tailwind com tokens (`bg-surface`, `text-ink`, `border-line`, `bg-brand`), vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-16-politica-cookies-design.md`

## Global Constraints

- Pixel da Meta **bloqueado até o aceite** de Marketing; nenhum `fbq` antes disso.
- Banner e `/cookies` **sempre claros** (`ForcedLight`); `/termos` e `/privacidade` também passam a claros (pedido do usuário, posterior ao spec).
- Sem biblioteca nova. Textos em pt-BR; e-mail de contato `contato@easyconnectcg.com.br`.
- Chave `cookie_consent`, validade 12 meses, versão da política `CONSENT_VERSION = 1`.
- Três botões do banner com o mesmo peso visual: "Recusar não essenciais", "Personalizar", "Aceitar todos".
- Marketing desligado por padrão em "Personalizar"; Necessários travado em ligado.
- Cores só por tokens: `src/__tests__/themeCompliance.test.ts` varre `THEMED_PATHS` e exige que todo `.tsx` em `src/components` esteja lá ou isento. Registrar `src/components/cookies` e `src/app/cookies` em `src/lib/themedPaths.ts`.
- Nome do projeto em arquivos/slugs: `easyagendamais`.
- Trabalhar numa branch nova a partir de `main` (ex.: `feat/politica-cookies`), não em `fix/ci-tema-metapixel`.

## Review Focus

- `localStorage` bloqueado/lançando exceção (modo privado): banner aparece a cada visita, nada quebra, pixel não carrega.
- JSON corrompido ou versão antiga em `cookie_consent`: tratado como "sem escolha" (banner reaparece).
- Consentimento com mais de 12 meses: expirado, banner reaparece e pixel bloqueado.
- Revogar Marketing com o pixel já carregado: eventos `trackMetaEvent` deixam de disparar na hora.
- Rota fora da lista pública (`/dashboard`, `/login`): banner não aparece e pixel não carrega.

---

### Task 1: Módulo de consentimento

**Files:**
- Create: `frontend/src/lib/cookieConsent.ts`
- Test: `frontend/src/lib/__tests__/cookieConsent.test.ts`

**Interfaces:**
- Produces:
  - `export const CONSENT_KEY = 'cookie_consent'`, `CONSENT_VERSION = 1`, `CONSENT_MAX_AGE_MS` (365 dias)
  - `export type Consentimento = { versao: number; marketing: boolean; em: number }`
  - `export function lerConsentimento(agora?: number): Consentimento | null` (null se ausente, corrompido, de outra versão ou expirado; nunca lança)
  - `export function salvarConsentimento(marketing: boolean, agora?: number): Consentimento` (grava e dispara `CONSENT_EVENT`; tolera falha de `localStorage`, devolvendo o valor mesmo assim)
  - `export const CONSENT_EVENT = 'easyagenda:consent'`, `export const ABRIR_PREFERENCIAS_EVENT = 'easyagenda:cookies-abrir'`
  - `export function abrirPreferenciasCookies(): void` (dispara `ABRIR_PREFERENCIAS_EVENT`)
  - `export function marketingConsentido(): boolean`
  - `export function useConsentimento(): Consentimento | null` (hook; `useSyncExternalStore` ou estado + listener de `CONSENT_EVENT`; `null` no servidor/primeiro render)

- [ ] **Step 1: Escrever os testes que falham** em `cookieConsent.test.ts`, com `localStorage.clear()` no `beforeEach`:
  - `salvarConsentimento(true)` → `lerConsentimento()` devolve `{ versao: 1, marketing: true, em }`
  - sem nada gravado → `null`
  - JSON inválido (`'{x'`) → `null`
  - `versao: 0` gravada → `null`
  - gravado há 366 dias (`lerConsentimento(em + 366*864e5)`) → `null`; há 364 dias → válido
  - `localStorage.setItem` lançando (`vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x') })`) → `salvarConsentimento(true)` não lança; `getItem` lançando → `lerConsentimento()` é `null`
  - `salvarConsentimento` dispara `CONSENT_EVENT` (listener em `window`)
  - `marketingConsentido()` é `false` sem escolha, `false` após recusar, `true` após aceitar
- [ ] **Step 2: Rodar e ver falhar:** `cd frontend && npx vitest run src/lib/__tests__/cookieConsent.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `cookieConsent.ts` conforme as assinaturas acima. Envolver todo acesso a `localStorage` em try/catch.
- [ ] **Step 4: Rodar e ver passar:** mesmo comando → PASS.
- [ ] **Step 5: Commit:** `git add frontend/src/lib && git commit -m "feat(cookies): módulo de consentimento"` (mensagem termina com a linha de co-autoria exigida).

### Task 2: Pixel da Meta bloqueado até o aceite

**Files:**
- Modify: `frontend/src/components/analytics/MetaPixel.tsx`, `frontend/src/lib/metaPixel.ts`
- Test: `frontend/src/components/analytics/__tests__/MetaPixel.test.tsx` (criar), `frontend/src/lib/__tests__/metaPixel.test.ts` (estender)

**Interfaces:**
- Consumes: `useConsentimento`, `marketingConsentido` (Task 1).
- Produces: `trackMetaEvent` passa a ser no-op também sem `marketingConsentido()`; `ROTAS_COM_PIXEL` inclui `'/cookies'`.

- [ ] **Step 1: Escrever os testes que falham:**
  - `MetaPixel.test.tsx` (mock de `next/navigation` → `usePathname` retorna `/`, mock de `next/script` renderizando um `<script data-testid="meta-pixel">`, `NEXT_PUBLIC_META_PIXEL_ID` válido via `vi.stubEnv` + `vi.resetModules`): sem consentimento → `queryByTestId('meta-pixel')` é `null`; após `salvarConsentimento(true)` (dentro de `act`) → presente; após `salvarConsentimento(false)` → ausente; com consentimento mas rota `/dashboard` → ausente.
  - `metaPixel.test.ts`: com `window.fbq` definido e ID válido, mas sem consentimento, `trackMetaEvent('PageView')` não chama `fbq`; com consentimento chama. Ajustar os testes existentes de disparo para gravar consentimento antes. `rotaPermitePixel('/cookies')` é `true`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/components/analytics src/lib/__tests__/metaPixel.test.ts` → FAIL.
- [ ] **Step 3: Implementar:** em `MetaPixel`, `permitido` passa a exigir `useConsentimento()?.marketing === true`; em `trackMetaEvent`, retornar cedo se `!marketingConsentido()`; adicionar `'/cookies'` a `ROTAS_COM_PIXEL`; atualizar o comentário de privacidade do topo do arquivo.
- [ ] **Step 4: Rodar e ver passar:** mesmo comando → PASS.
- [ ] **Step 5: Commit:** `feat(cookies): pixel da Meta só carrega após o aceite`.

### Task 3: Pop-up de consentimento

**Files:**
- Create: `frontend/src/components/cookies/CookieBanner.tsx`
- Modify: `frontend/src/app/layout.tsx` (montar `<CookieBanner />` ao lado de `<MetaPixel />`), `frontend/src/lib/themedPaths.ts` (adicionar `'src/components/cookies'` e `'src/app/cookies'`)
- Test: `frontend/src/components/cookies/__tests__/CookieBanner.test.tsx`

**Interfaces:**
- Consumes: `lerConsentimento`, `salvarConsentimento`, `useConsentimento`, `ABRIR_PREFERENCIAS_EVENT` (Task 1); `rotaPermitePixel` (Task 2, decide em que rotas aparece).
- Produces: `export function CookieBanner(): JSX.Element | null`.

- [ ] **Step 1: Escrever os testes que falham** (mock de `usePathname`; `localStorage.clear()` no `beforeEach`):
  - rota `/` sem escolha → `getByRole('dialog', { name: 'Cookies no EasyAgenda+' })` presente com os botões "Recusar não essenciais", "Personalizar", "Aceitar todos"
  - "Aceitar todos" → `lerConsentimento()?.marketing === true` e o diálogo some
  - "Recusar não essenciais" → `marketing === false` e some
  - "Personalizar" → mostra interruptores "Necessários" (`disabled`, marcado) e "Marketing" (desmarcado por padrão); ligar Marketing e "Salvar preferências" → `marketing === true`; "Voltar" retorna aos 3 botões
  - com consentimento válido → não renderiza; `window.dispatchEvent(new Event(ABRIR_PREFERENCIAS_EVENT))` → reabre já na tela de preferências, com Marketing refletindo a escolha atual
  - rota `/dashboard` → não renderiza
  - `localStorage` lançando → ainda renderiza e aceitar não lança
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/components/cookies` → FAIL.
- [ ] **Step 3: Implementar** `CookieBanner` (`'use client'`): envolve o cartão em `ForcedLight`; cartão fixo `bottom-4`, `max-w-3xl`, centralizado; `role="dialog"` com `aria-label`; botões iguais em tamanho (`flex-1`), "Aceitar todos" em `bg-brand text-on-brand`, os outros dois com `border-line bg-surface-2`; empilham no mobile (`flex-col sm:flex-row`); texto com link para `/cookies`; interruptores como `<input type="checkbox" role="switch">`. Só tokens, sem cores fixas. Foco inicial no cartão ao abrir; `Esc` não fecha sem escolha.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run src/components/cookies src/__tests__/themeCompliance.test.ts` → PASS.
- [ ] **Step 5: Commit:** `feat(cookies): pop-up de consentimento`.

### Task 4: Página `/cookies` e rodapé

**Files:**
- Create: `frontend/src/app/cookies/page.tsx`, `frontend/src/components/cookies/GerenciarCookiesButton.tsx` (`'use client'`; botão que chama `abrirPreferenciasCookies()`; prop `className`/`children` opcionais)
- Modify: `frontend/src/components/marketing/PublicFooter.tsx` (link "Política de Cookies" e botão "Gerenciar cookies" em "Legal e suporte"; "Cookies" na linha inferior), `frontend/src/app/sitemap.ts` (`{ caminho: '/cookies', prioridade: 0.3 }`)
- Test: `frontend/src/app/cookies/__tests__/Cookies.test.tsx`

**Interfaces:**
- Consumes: `abrirPreferenciasCookies`, `useConsentimento` (Task 1).
- Produces: rota `/cookies`; `export function GerenciarCookiesButton(props: { className?: string; children?: React.ReactNode }): JSX.Element`.

- [ ] **Step 1: Escrever os testes que falham** (mesmo padrão de mocks do teste de Privacidade, trocando `ForcedDark` por `ForcedLight`):
  - o texto contém "Política de Cookies", "Necessários", "Marketing", "pixel da Meta", `access_token`, `cookie_consent`, `contato@easyconnectcg.com.br`
  - botão "Gerenciar cookies" presente; clicar dispara `ABRIR_PREFERENCIAS_EVENT`
  - mostra a escolha atual ("Marketing desativado" sem consentimento; "Marketing ativado" após aceitar)
  - `sitemap()` inclui `/cookies`
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/app/cookies` → FAIL.
- [ ] **Step 3: Implementar** a página no layout da `/privacidade` (`PublicNavbar`, `main` `max-w-4xl`, `PublicFooter`) dentro de `ForcedLight`, com `metadata` (title "Política de Cookies - EasyAgenda+"), `LAST_UPDATE = '16 de novembro de 2026'` e as seções do mockup: 1 O que são, 2 Categorias, 3 Lista (tabela: `access_token`, `easyagenda-theme`, `cookie_consent`, `_fbp`/`fr`), 4 Como mudar sua escolha, 5 Contato. **Antes de escrever a tabela**, conferir na documentação da Meta os nomes e durações reais de `_fbp` e `fr` e usar esses valores; conferir também o nome real da chave do tema (`easyagenda-theme`, em `ThemeProvider.tsx`) e o cookie `access_token`/validade em `backend`/`middleware.ts`.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run src/app/cookies src/__tests__/themeCompliance.test.ts` → PASS.
- [ ] **Step 5: Commit:** `feat(cookies): página de política de cookies e links no rodapé`.

### Task 5: Termos e privacidade em tema claro

**Files:**
- Modify: `frontend/src/app/privacidade/page.tsx`, `frontend/src/app/termos/page.tsx`
- Test: `frontend/src/app/privacidade/__tests__/Privacidade.test.tsx` (mock de `ForcedDark` → `ForcedLight`; novo teste da seção 9)

**Interfaces:**
- Consumes: rota `/cookies` (Task 4), `ForcedLight` (`@/components/theme/ForcedLight`).

- [ ] **Step 1: Escrever o teste que falha** em `Privacidade.test.tsx`: trocar o mock para `@/components/theme/ForcedLight`; novo `it`: o texto da seção 9 menciona "pixel da Meta" e o link "Política de Cookies" tem `href="/cookies"`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/app/privacidade` → FAIL.
- [ ] **Step 3: Implementar:** nas duas páginas trocar `ForcedDark` por `ForcedLight` (com `className="min-h-screen bg-bg text-ink"`) e converter as classes do escuro para tokens: `text-white` → `text-ink`, `text-gray-300` → `text-muted`, `text-gray-500`/`text-gray-400` → `text-muted`, `border-white/10` → `border-line`, `text-primary` → `text-brand-text`. Na seção 9 da privacidade, acrescentar parágrafo informando que cookies de marketing (pixel da Meta) só são ativados com consentimento e linkando `/cookies`; atualizar `LAST_UPDATE` da privacidade para `'16 de novembro de 2026'`. Se o link precisar de JSX, mudar o tipo de `paragraphs` para aceitar `ReactNode`.
- [ ] **Step 4: Rodar e ver passar:** `npx vitest run src/app/privacidade src/__tests__/themeCompliance.test.ts` → PASS. Conferir visualmente `/termos` e `/privacidade` no `npm run dev` (contraste do texto no fundo claro).
- [ ] **Step 5: Commit:** `feat(cookies): termos e privacidade em tema claro e seção de cookies`.

### Task 6: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1:** `cd frontend && npx tsc --noEmit && npm run lint` → sem erros.
- [ ] **Step 2:** `npm test` (suíte completa, inclui `themeCompliance`) → tudo PASS.
- [ ] **Step 3:** `npm run build` → build conclui; `/cookies` aparece na lista de rotas.
- [ ] **Step 4:** Rodar o app (`npm run dev`) e conferir no navegador com `NEXT_PUBLIC_META_PIXEL_ID` válido: primeira visita mostra o banner claro e **nenhuma** requisição a `connect.facebook.net` (aba Network); após "Aceitar todos" o script carrega; "Gerenciar cookies" no rodapé reabre; `/dashboard` e `/login` não mostram banner; mobile empilha os botões. Testar também com o sistema do navegador em modo escuro (banner continua claro).
- [ ] **Step 5:** Abrir PR para `main` (somente se o usuário pedir).
