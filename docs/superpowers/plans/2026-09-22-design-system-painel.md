# Design system e estrutura do painel — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar os tokens do DESIGN.md para o frontend (temas claro e escuro), criar o kit de componentes, montar a nova estrutura do painel (barra lateral e barra inferior) e migrar as telas do painel, de autenticação e de pagamento sem mudar comportamento.

**Architecture:** Tokens como variáveis CSS (canais RGB) em `globals.css`, expostos pelo Tailwind com nomes semânticos; `next-themes` controla a classe `dark` no `<html>`. O kit fica em `src/components/ui/`, com Radix por baixo das camadas (modal, painel lateral, menu, abas). As páginas fora do escopo ficam dentro de um `ForcedDark`, que também faz os portais do kit abrirem no escuro. Um teste de conformidade varre os arquivos já migrados e falha se aparecer cor fixa.

**Tech Stack:** Next.js 15 (App Router), React 18, Tailwind 3.4, TypeScript, Radix UI, next-themes, class-variance-authority, clsx, tailwind-merge, lucide-react, Recharts, Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-22-design-system-painel-design.md`

## Global Constraints

- Tokens com os valores exatos do DESIGN.md (tabela na Parte 1 da especificação); claro em `:root`, escuro em `.dark`.
- Botão principal: `bg-brand text-on-brand`, no máximo um por tela. Verde (`whatsapp`) só em ações de WhatsApp. Laranja como texto: `text-brand-text`.
- Status: confirmado `status-confirmed`; aguardando `warning`; em atendimento `brand` (texto `brand-text`); concluído `success`; faltou `danger`; cancelado `muted` com texto riscado. Chip com fundo 12% da cor.
- Raios: 10px controles (`rounded-control`), 16px cartões (`rounded-card`), 999px chips (`rounded-full`). Sombra mínima; blocos separados por superfície e borda de 1px.
- Plus Jakarta Sans. Corpo 15px/1.5; rótulos 13px peso 600; título de tela 24px peso 700; métricas 32–40px peso 700 com `tabular-nums`. Sem caixa alta espaçada em rótulos.
- Área de toque mínima de 44px no celular. Nada cortado ou sobreposto; tabelas largas rolam no próprio contêiner; painéis e modais rolam por dentro.
- Tema padrão: seguir o aparelho; opções Sistema, Claro, Escuro; chave de armazenamento `easyagenda-theme`.
- Barra lateral (desktop ≥ 1024px, 248px): Hoje, Agenda, Clientes, Caixa, WhatsApp, Ajustes — nesta ordem, nada além disso.
- Barra inferior (celular): Hoje, Agenda, **+** (`/agendamentos?novo=1`), Clientes, Mais. Mais: Caixa, WhatsApp, Ajustes, tema, Sair.
- Ajustes ativo em `/configuracoes`, `/servicos` e `/planos`; abas Negócio, Serviços e equipe, Plano e cobrança.
- Endereços de página inalterados; middleware inalterado.
- Migração de tela: mesmas funções, chamadas à API, estados e textos. Só apresentação muda. Nenhuma funcionalidade nova.
- Única mudança de texto permitida: o título de cada tela passa a ser o nome do menu — Hoje, Agenda, Clientes, Caixa, WhatsApp, Ajustes, Serviços e equipe.
- Fora do escopo e sem mudança visual: landing (`src/app/page.tsx`), termos, privacidade, SuperAdmin, e o conteúdo de `PricingPlansSection`.
- Texto de interface em português do Brasil; nada de emoji na interface do painel.
- Nenhuma tarefa fecha com teste vermelho ou build quebrado. Um commit por tarefa (ou por passo de commit indicado).
- Comandos a partir da raiz do repositório, em Git Bash; frontend em subshell: `(cd frontend && npx vitest run)`.
- Branch de trabalho: `feat/design-system-painel` (já criado a partir de `feat/fundacao-easyagenda`).

### Checagem padrão de uma tela migrada

Toda tarefa de tela termina com estes quatro comandos, que devem passar:

```bash
(cd frontend && npx vitest run)
(cd frontend && npx tsc --noEmit)
(cd frontend && npm run build 2>&1 | tail -15)
git diff <BASE> -- <arquivos da tarefa> | grep -E '^[-+][^-+].*(api\.|await |fetch\(|useEffect\(|set[A-Z][A-Za-z]*\()' 
```

O último comando lista as linhas alteradas que tocam chamadas à API, efeitos e estados. Cada linha listada precisa ser só uma linha movida (aparece como `-` e `+` idênticas em conteúdo) ou estar justificada no relatório da tarefa. `<BASE>` é o commit anterior ao início da tarefa.

---

## Fatia 1 — Base visual

### Task 1: Tokens, tema, isolamento das páginas públicas e testes no frontend

**Files:**
- Modify: `frontend/package.json` (dependências e script `test`)
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx:81`, `frontend/src/app/termos/page.tsx:89`, `frontend/src/app/privacidade/page.tsx:84` (e o fechamento correspondente de cada um)
- Modify: `frontend/src/components/admin/AdminLayoutShell.tsx` (elemento raiz)
- Modify: `.github/workflows/ci.yml` (job `frontend-build`)
- Create: `frontend/vitest.config.ts`, `frontend/vitest.setup.ts`
- Create: `frontend/src/lib/cn.ts`
- Create: `frontend/src/components/theme/ThemeProvider.tsx`, `frontend/src/components/theme/ForcedDark.tsx`
- Create: `frontend/src/lib/colorRules.ts`, `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/lib/__tests__/colorRules.test.ts`, `frontend/src/components/theme/__tests__/ForcedDark.test.tsx`, `frontend/src/__tests__/themeCompliance.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` em `@/lib/cn`.
- Produces: `ThemeProvider({ children })` em `@/components/theme/ThemeProvider`.
- Produces: `ForcedDark({ className?, children })` e `useForcedDarkClass(): 'dark' | ''` em `@/components/theme/ForcedDark`.
- Produces: `findColorViolations(source: string): ColorViolation[]` e `interface ColorViolation { line: number; match: string }` em `@/lib/colorRules`.
- Produces: `THEMED_PATHS: readonly string[]` em `@/lib/themedPaths` (caminhos relativos a `frontend/`); cada tarefa seguinte acrescenta os seus.
- Produces: classes Tailwind `bg|text|border-{bg,surface,surface-2,ink,muted,line,brand,on-brand,brand-text,whatsapp,success,warning,danger,status-confirmed,scrim}`, opacidade `/12`, raios `rounded-control` e `rounded-card`, e a classe `app-theme`.

- [ ] **Step 1: Instalar as dependências**

```bash
(cd frontend && npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-visually-hidden next-themes class-variance-authority clsx tailwind-merge)
(cd frontend && npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom)
```

Em `frontend/package.json`, acrescentar ao bloco `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Configurar o Vitest**

Criar `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
```

Criar `frontend/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// next/image depende da configuração do Next; nos testes basta um <img> simples.
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, className }: Record<string, unknown>) =>
    createElement('img', {
      src: typeof src === 'string' ? src : (src as { src?: string } | undefined)?.src,
      alt,
      width,
      height,
      className,
    }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

// jsdom não implementa matchMedia; next-themes usa para o tema "Sistema".
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Radix usa ResizeObserver e scrollIntoView.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
```

- [ ] **Step 3: Escrever o teste que falha das regras de cor**

Criar `frontend/src/lib/__tests__/colorRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findColorViolations } from '../colorRules';

describe('findColorViolations', () => {
  it.each([
    'bg-black',
    'hover:bg-white/10',
    'text-white',
    'text-gray-400',
    'border-primary/30',
    'text-primary',
    'bg-dark-light',
    'from-dark-light',
    'from-emerald-500/10',
    'bg-[#FF7A00]',
    'text-[rgba(0,0,0,0.5)]',
    'bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_transparent)]',
    'focus-visible:ring-offset-zinc-950',
  ])('aponta %s', (className) => {
    const result = findColorViolations(`<div className="p-4 ${className}" />`);
    expect(result.map((v) => v.match)).toContain(className.replace(/^[a-z-]+:/, ''));
  });

  it.each([
    'bg-bg',
    'bg-surface',
    'bg-surface-2',
    'text-ink',
    'text-muted',
    'border-line',
    'bg-brand/12',
    'text-on-brand',
    'text-brand-text',
    'bg-whatsapp',
    'text-status-confirmed',
    'bg-scrim/50',
    'rounded-card',
  ])('aceita %s', (className) => {
    expect(findColorViolations(`<div className="${className}" />`)).toEqual([]);
  });

  it('informa o número da linha', () => {
    const source = ['const a = 1;', '<p className="text-gray-500">x</p>'].join('\n');
    expect(findColorViolations(source)).toEqual([{ line: 2, match: 'text-gray-500' }]);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `(cd frontend && npx vitest run src/lib/__tests__/colorRules.test.ts)`
Expected: FAIL — `Failed to resolve import "../colorRules"`.

- [ ] **Step 5: Implementar as regras de cor**

Criar `frontend/src/lib/colorRules.ts`:

```ts
// Regras que impedem cores fixas nos arquivos já migrados para os tokens do DESIGN.md.
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
```

- [ ] **Step 6: Rodar e ver passar**

Run: `(cd frontend && npx vitest run src/lib/__tests__/colorRules.test.ts)`
Expected: todos passando.

- [ ] **Step 7: Criar o teste de conformidade e a lista de caminhos**

Criar `frontend/src/lib/themedPaths.ts`:

```ts
// Arquivos e pastas (relativos a frontend/) que já usam só os tokens do DESIGN.md.
// Cada tarefa de migração acrescenta os seus. O teste themeCompliance varre esta lista.
export const THEMED_PATHS: readonly string[] = [
  'src/lib/cn.ts',
  'src/components/theme/ThemeProvider.tsx',
];
```

Criar `frontend/src/__tests__/themeCompliance.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { findColorViolations } from '@/lib/colorRules';
import { THEMED_PATHS } from '@/lib/themedPaths';

const collectFiles = (target: string): string[] => {
  const absolute = path.resolve(process.cwd(), target);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === '__tests__') return [];
    const child = path.join(absolute, entry);
    if (statSync(child).isDirectory()) return collectFiles(path.relative(process.cwd(), child));
    return /\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
};

describe('conformidade com os tokens', () => {
  it('nenhum arquivo migrado usa cor fixa', () => {
    const report = THEMED_PATHS.flatMap(collectFiles).flatMap((file) =>
      findColorViolations(readFileSync(file, 'utf8')).map(
        (v) => `${path.relative(process.cwd(), file)}:${v.line} ${v.match}`,
      ),
    );
    expect(report).toEqual([]);
  });
});
```

- [ ] **Step 8: Configurar os tokens no Tailwind**

Substituir o conteúdo de `frontend/tailwind.config.js` por:

```js
/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './src/hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cores antigas: usadas só por páginas fora do escopo do design system (landing, SuperAdmin).
        primary: '#FF7A00',
        dark: '#000000',
        'dark-light': '#1a1a1a',
        'dark-lighter': '#252525',
        // Tokens do DESIGN.md (valores em globals.css, claro em :root e escuro em .dark).
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        brand: token('brand'),
        'on-brand': token('on-brand'),
        'brand-text': token('brand-text'),
        whatsapp: token('whatsapp'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        'status-confirmed': token('status-confirmed'),
        scrim: token('scrim'),
      },
      opacity: {
        12: '0.12',
      },
      borderRadius: {
        control: '10px',
        card: '16px',
      },
      fontWeight: {
        // Space Grotesk max=700, Plus Jakarta Sans max=800. Clamp black to 800
        // so Plus Jakarta Sans renders the true heaviest weight without browser synthesis.
        black: '800',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 9: Declarar os tokens e o contêiner do tema em `globals.css`**

Em `frontend/src/styles/globals.css`, dentro de `@layer base`:

1. Trocar a regra do `body`:

```css
  body {
    @apply antialiased;
    font-family: var(--font-sans), sans-serif;
  }
```

2. Acrescentar, logo após a regra `* { … }`:

```css
  /* Tokens do DESIGN.md em canais RGB (permitem transparência no Tailwind). */
  :root {
    --color-bg: 246 245 244;
    --color-surface: 255 255 255;
    --color-surface-2: 239 237 234;
    --color-ink: 26 24 23;
    --color-muted: 102 96 91;
    --color-line: 226 223 219;
    --color-brand: 255 122 0;
    --color-on-brand: 26 24 23;
    --color-brand-text: 179 77 0;
    --color-whatsapp: 18 140 74;
    --color-success: 22 163 74;
    --color-warning: 217 119 6;
    --color-danger: 220 38 38;
    --color-status-confirmed: 37 99 235;
    --color-scrim: 14 13 12;
  }

  .dark {
    --color-bg: 14 13 12;
    --color-surface: 24 22 21;
    --color-surface-2: 33 31 29;
    --color-ink: 243 241 239;
    --color-muted: 163 157 151;
    --color-line: 46 43 40;
    --color-brand: 255 122 0;
    --color-on-brand: 26 24 23;
    --color-brand-text: 255 154 61;
    --color-whatsapp: 37 211 102;
    --color-success: 74 222 128;
    --color-warning: 251 191 36;
    --color-danger: 248 113 113;
    --color-status-confirmed: 37 99 235;
    --color-scrim: 0 0 0;
  }

  /* Contêiner das telas que seguem o design system: fundo, texto e tipografia do DESIGN.md. */
  .app-theme {
    @apply bg-bg text-ink;
    --font-display: var(--font-sans);
    font-size: 0.9375rem;
    line-height: 1.5;
  }
```

Não mexer no resto de `globals.css`: as classes antigas continuam existindo para as páginas fora do escopo.

- [ ] **Step 10: Criar `cn`, `ThemeProvider` e `ForcedDark`**

Criar `frontend/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Criar `frontend/src/components/theme/ThemeProvider.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="easyagenda-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

Criar `frontend/src/components/theme/ForcedDark.tsx`:

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const ForcedDarkContext = createContext(false);

// Usado pelos componentes do kit que abrem em portal (modal, painel, menu):
// dentro de uma área forçada no escuro, o portal também abre no escuro.
export function useForcedDarkClass(): 'dark' | '' {
  return useContext(ForcedDarkContext) ? 'dark' : '';
}

// Áreas que ainda não seguem o design system (landing, termos, privacidade, SuperAdmin,
// e o conteúdo da página de planos): mantêm o visual escuro de hoje em qualquer tema.
export function ForcedDark({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ForcedDarkContext.Provider value>
      <div className={cn('dark bg-black text-white', className)}>{children}</div>
    </ForcedDarkContext.Provider>
  );
}
```

- [ ] **Step 11: Teste do `ForcedDark`**

Criar `frontend/src/components/theme/__tests__/ForcedDark.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForcedDark, useForcedDarkClass } from '../ForcedDark';

function Probe() {
  return <span data-testid="probe">{useForcedDarkClass() || 'none'}</span>;
}

describe('ForcedDark', () => {
  it('aplica a classe dark e o fundo escuro ao contêiner', () => {
    const { container } = render(<ForcedDark className="min-h-screen">conteúdo</ForcedDark>);
    expect(container.firstElementChild).toHaveClass('dark', 'bg-black', 'text-white', 'min-h-screen');
  });

  it('informa aos filhos que a área é escura', () => {
    render(<ForcedDark><Probe /></ForcedDark>);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('fora de uma área escura não força nada', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
```

Run: `(cd frontend && npx vitest run)`
Expected: todos passando (colorRules, ForcedDark, themeCompliance).

- [ ] **Step 12: Ligar o tema no layout raiz**

Em `frontend/src/app/layout.tsx`:
- importar `import { ThemeProvider } from '@/components/theme/ThemeProvider'`;
- trocar `<html lang="pt-BR">` por `<html lang="pt-BR" suppressHydrationWarning>`;
- trocar a classe do `<body>` por `` className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`} `` (sem `bg-dark text-white`);
- no link "Pular para o conteúdo", trocar `focus:bg-primary focus:text-black` por `focus:bg-brand focus:text-on-brand`;
- envolver `<ErrorBoundary>…</ErrorBoundary>` com `<ThemeProvider>…</ThemeProvider>`.

- [ ] **Step 13: Isolar as páginas fora do escopo**

- `frontend/src/app/page.tsx`, `frontend/src/app/termos/page.tsx`, `frontend/src/app/privacidade/page.tsx`: trocar a `div` raiz `<div className="min-h-screen bg-black text-white">` por `<ForcedDark className="min-h-screen">` (e o `</div>` de fechamento correspondente por `</ForcedDark>`); importar `ForcedDark` de `@/components/theme/ForcedDark`. Se o arquivo for componente de servidor, isso continua funcionando: `ForcedDark` é um componente de cliente que recebe os filhos.
- `frontend/src/components/admin/AdminLayoutShell.tsx`: trocar `<div className="min-h-screen bg-black text-white lg:flex">` por `<ForcedDark className="min-h-screen lg:flex">` e o fechamento correspondente.
- `frontend/src/app/admin/layout.tsx`: o estado de carregamento `return <LoadingSkeleton />;` passa a ser `return <ForcedDark className="min-h-screen"><LoadingSkeleton /></ForcedDark>;`, para não aparecer sobre fundo claro.

- [ ] **Step 14: Passo de testes no CI**

Em `.github/workflows/ci.yml`, no job `frontend-build`, acrescentar antes de `- run: npm run build`:

```yaml
      - run: npm test
```

- [ ] **Step 15: Verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -15)`
Expected: testes passando, typecheck limpo, build concluído.

Conferir com `git diff` que a landing, os termos, a privacidade e o `AdminLayoutShell` só trocaram a `div` raiz.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat(ui): add DESIGN.md tokens, theme provider and frontend test setup"
```

---

### Task 2: Referências do Stitch no repositório (executada pelo controlador)

Esta tarefa usa o servidor MCP do Stitch, disponível só para o controlador; não é despachada para um subagente.

**Files:**
- Create: `docs/design/DESIGN.md`
- Create: `docs/design/stitch/README.md` e um `.html` por tela listada abaixo

- [ ] **Step 1: Copiar o DESIGN.md**

Copiar o DESIGN.md do produto (a versão importada no Stitch) para `docs/design/DESIGN.md`.

- [ ] **Step 2: Baixar o HTML atual das telas**

No projeto do Stitch do EasyAgenda+ (`list_screens` do projeto), localizar a versão mais recente de cada tela e baixar o HTML (`get_screen` → `htmlCode`):

| Arquivo | Tela no Stitch |
|---|---|
| `hoje-desktop.html` | Studio Aurora - Hoje (Painel Desktop) |
| `hoje-mobile.html` | Studio Aurora - Hoje (Painel Mobile) |
| `agenda-desktop.html` | Studio Aurora - Agenda Diária (Timeline Desktop) |
| `agenda-mobile.html` | Studio Aurora - Agenda Mobile (Lista e Gesto de Deslizar) |
| `agendamento-detalhes.html` | Studio Aurora - Detalhes do Agendamento (Drawer Desktop) |
| `clientes-lista.html` | Studio Aurora - CRM Clientes (Lista Desktop) |
| `cliente-ficha.html` | Studio Aurora - Ficha da Cliente (Mariana Souza) |
| `caixa.html` | Studio Aurora - Caixa do Dia e Fechamento |
| `whatsapp-conexao.html` | Studio Aurora - WhatsApp (Conexão e Saúde) |
| `ajustes-plano.html` | Studio Aurora - Ajustes: Plano e Cobrança |

- [ ] **Step 3: README**

Criar `docs/design/stitch/README.md` com a tabela acima acrescida do ID de cada tela e a nota: "Referência de aparência, não de funcionalidade. O que a tela mostra e o sistema ainda não faz fica para os sub-projetos D a I."

- [ ] **Step 4: Commit**

```bash
git add docs/design
git commit -m "docs(design): add DESIGN.md and Stitch screen references"
```

---

## Fatia 2 — Kit de componentes

### Task 3: Kit — ações, conteúdo e página

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`, `IconButton.tsx`, `Card.tsx`, `MetricCard.tsx`, `StatusChip.tsx`, `Avatar.tsx`, `Skeleton.tsx`, `Banner.tsx`
- Modify (reescrever mantendo a API): `frontend/src/components/ui/EmptyState.tsx`, `frontend/src/components/ui/PageHeader.tsx`
- Modify: `frontend/src/components/ui/index.ts`
- Modify: `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/components/ui/__tests__/actions-content.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 1), tokens (Task 1).
- Produces (todas exportadas também por `@/components/ui`):
  - `Button` (`forwardRef<HTMLButtonElement, ButtonProps>`), `ButtonProps` = atributos de `<button>` + `variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp'`, `size?: 'sm' | 'md' | 'lg'`, `fullWidth?: boolean`, `loading?: boolean`; `buttonVariants` (cva).
  - `IconButton` (`forwardRef<HTMLButtonElement>`) com `icon: LucideIcon`, `label: string`, `variant?: 'ghost' | 'secondary'`.
  - `Card(props: HTMLAttributes<HTMLDivElement>)`.
  - `MetricCard({ label: string; value: ReactNode; delta?: { value: string; trend: 'up' | 'down' | 'flat'; tone?: 'positive' | 'negative' | 'neutral' }; className?: string })`.
  - `StatusChip({ status: AppointmentStatus; className?: string })`, `type AppointmentStatus = 'confirmado' | 'aguardando' | 'em_atendimento' | 'concluido' | 'faltou' | 'cancelado'`, `STATUS_LABEL`, `STATUS_STRIPE_CLASS: Record<AppointmentStatus, string>`.
  - `Avatar({ name: string; src?: string | null; size?: number; className?: string })`, `getInitials(name: string): string`.
  - `Skeleton({ className?: string })`.
  - `Banner({ tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; action?: ReactNode; className?: string })`.
  - `EmptyState` e `PageHeader` com as mesmas props de hoje.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/src/components/ui/__tests__/actions-content.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarX } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { MetricCard } from '../MetricCard';
import { StatusChip, STATUS_LABEL, type AppointmentStatus } from '../StatusChip';
import { Avatar, getInitials } from '../Avatar';
import { EmptyState } from '../EmptyState';
import { PageHeader } from '../PageHeader';

describe('Button', () => {
  it('é do tipo button por padrão e usa o botão principal da marca', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('bg-brand', 'text-on-brand');
  });

  it('fica desabilitado e ocupado enquanto carrega', () => {
    render(<Button loading>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('usa o verde só na variante WhatsApp', () => {
    render(<Button variant="whatsapp">Conectar</Button>);
    expect(screen.getByRole('button', { name: 'Conectar' })).toHaveClass('bg-whatsapp');
  });
});

describe('IconButton', () => {
  it('expõe o rótulo para leitores de tela', async () => {
    const onClick = vi.fn();
    render(<IconButton icon={CalendarX} label="Cancelar agendamento" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('MetricCard', () => {
  it('mostra rótulo e valor', () => {
    render(<MetricCard label="Atendimentos hoje" value={12} />);
    expect(screen.getByText('Atendimentos hoje')).toBeInTheDocument();
    expect(screen.getByText('12')).toHaveClass('tabular-nums');
  });

  it('subida é positiva por padrão', () => {
    render(<MetricCard label="Faturamento" value="R$ 800" delta={{ value: '+12%', trend: 'up' }} />);
    expect(screen.getByText('+12%').closest('[data-tone]')).toHaveAttribute('data-tone', 'positive');
  });

  it('aceita queda com tom positivo (por exemplo, despesas caindo)', () => {
    render(<MetricCard label="Despesas" value="R$ 90" delta={{ value: '-8%', trend: 'down', tone: 'positive' }} />);
    expect(screen.getByText('-8%').closest('[data-tone]')).toHaveClass('text-success');
  });
});

describe('StatusChip', () => {
  const expected: Record<AppointmentStatus, string> = {
    confirmado: 'text-status-confirmed',
    aguardando: 'text-warning',
    em_atendimento: 'text-brand-text',
    concluido: 'text-success',
    faltou: 'text-danger',
    cancelado: 'text-muted',
  };

  it.each(Object.keys(expected) as AppointmentStatus[])('status %s tem rótulo e cor', (status) => {
    render(<StatusChip status={status} />);
    const chip = screen.getByText(STATUS_LABEL[status]);
    expect(chip).toHaveClass(expected[status]);
  });

  it('cancelado aparece riscado', () => {
    render(<StatusChip status="cancelado" />);
    expect(screen.getByText('Cancelado')).toHaveClass('line-through');
  });
});

describe('Avatar', () => {
  it.each([
    ['Mariana Souza', 'MS'],
    ['Paula', 'P'],
    ['  ana   beatriz  lima ', 'AL'],
    ['   ', '?'],
  ])('iniciais de "%s" são %s', (name, initials) => {
    expect(getInitials(name)).toBe(initials);
  });

  it('sem foto mostra as iniciais com o nome acessível', () => {
    render(<Avatar name="Mariana Souza" />);
    expect(screen.getByRole('img', { name: 'Mariana Souza' })).toHaveTextContent('MS');
  });
});

describe('EmptyState e PageHeader', () => {
  it('estado vazio mostra a frase e o botão do próximo passo', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={CalendarX} title="Nenhum agendamento hoje" description="Crie o primeiro." action={{ label: 'Novo agendamento', onClick }} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('cabeçalho de página usa um título de nível 1', () => {
    render(<PageHeader title="Agenda" description="Seus horários" action={<Button>Novo</Button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd frontend && npx vitest run src/components/ui/__tests__/actions-content.test.tsx)`
Expected: FAIL — módulos `../Button`, `../IconButton` etc. não encontrados.

- [ ] **Step 3: Implementar os componentes**

`frontend/src/components/ui/Button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand/90',
        secondary: 'border border-line bg-surface-2 text-ink hover:bg-line/60',
        ghost: 'text-ink hover:bg-surface-2',
        danger: 'bg-danger text-surface hover:bg-danger/90',
        whatsapp: 'bg-whatsapp text-surface hover:bg-whatsapp/90',
      },
      size: {
        sm: 'h-11 px-3 text-[13px] lg:h-9',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-12 px-6 text-base',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, loading = false, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
```

`frontend/src/components/ui/IconButton.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: LucideIcon;
  label: string;
  variant?: 'ghost' | 'secondary';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 lg:h-9 lg:w-9',
        variant === 'secondary' ? 'border border-line bg-surface-2 hover:bg-line/60' : 'hover:bg-surface-2',
        className,
      )}
      {...props}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
});
```

`frontend/src/components/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface p-4 sm:p-6', className)} {...props} />;
}
```

`frontend/src/components/ui/MetricCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from './Card';

type Trend = 'up' | 'down' | 'flat';
type Tone = 'positive' | 'negative' | 'neutral';

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; trend: Trend; tone?: Tone };
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-muted',
};
const DEFAULT_TONE: Record<Trend, Tone> = { up: 'positive', down: 'negative', flat: 'neutral' };
const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

export function MetricCard({ label, value, delta, className }: MetricCardProps) {
  const tone = delta ? delta.tone ?? DEFAULT_TONE[delta.trend] : null;
  const Icon = delta ? TREND_ICON[delta.trend] : null;

  return (
    <Card className={cn('flex flex-col gap-2', className)}>
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="text-[32px] font-bold leading-none tabular-nums text-ink">{value}</p>
      {delta && tone && Icon ? (
        <p data-tone={tone} className={cn('inline-flex items-center gap-1 text-[13px] font-semibold', TONE_CLASS[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {delta.value}
        </p>
      ) : null}
    </Card>
  );
}
```

`frontend/src/components/ui/StatusChip.tsx`:

```tsx
import { cn } from '@/lib/cn';

export type AppointmentStatus = 'confirmado' | 'aguardando' | 'em_atendimento' | 'concluido' | 'faltou' | 'cancelado';

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmado: 'Confirmado',
  aguardando: 'Aguardando',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
};

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed/12 text-status-confirmed',
  aguardando: 'bg-warning/12 text-warning',
  em_atendimento: 'bg-brand/12 text-brand-text',
  concluido: 'bg-success/12 text-success',
  faltou: 'bg-danger/12 text-danger',
  cancelado: 'bg-muted/12 text-muted line-through',
};

// Faixa vertical da linha de agenda, na cor do status.
export const STATUS_STRIPE_CLASS: Record<AppointmentStatus, string> = {
  confirmado: 'bg-status-confirmed',
  aguardando: 'bg-warning',
  em_atendimento: 'bg-brand',
  concluido: 'bg-success',
  faltou: 'bg-danger',
  cancelado: 'bg-muted',
};

export function StatusChip({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold', STATUS_CLASS[status], className)}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
```

`frontend/src/components/ui/Avatar.tsx`:

```tsx
import { cn } from '@/lib/cn';

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const style = { width: size, height: size };

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={style} className={cn('shrink-0 rounded-full object-cover', className)} />;
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={style}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink', className)}
    >
      {getInitials(name)}
    </span>
  );
}
```

`frontend/src/components/ui/Skeleton.tsx`:

```tsx
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-surface-2', className)} />;
}
```

`frontend/src/components/ui/Banner.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const TONE_CLASS: Record<BannerTone, string> = {
  info: 'border-status-confirmed/30 bg-status-confirmed/12',
  warning: 'border-warning/30 bg-warning/12',
  danger: 'border-danger/30 bg-danger/12',
  success: 'border-success/30 bg-success/12',
};

export interface BannerProps {
  tone?: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = 'info', children, action, className }: BannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2.5 text-center text-[13px] text-ink',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
      {action}
    </div>
  );
}
```

Reescrever `frontend/src/components/ui/EmptyState.tsx` (mesma API):

```tsx
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon className="h-10 w-10 text-muted" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {action ? (
        <Button onClick={action.onClick}>
          {ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
```

Reescrever `frontend/src/components/ui/PageHeader.tsx` (mesma API):

```tsx
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-[15px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}
```

- [ ] **Step 4: Exportar e registrar na conformidade**

Em `frontend/src/components/ui/index.ts`, acrescentar (mantendo as exportações existentes):

```ts
export { Button, buttonVariants, type ButtonProps } from './Button';
export { IconButton } from './IconButton';
export { Card } from './Card';
export { MetricCard } from './MetricCard';
export { StatusChip, STATUS_LABEL, STATUS_STRIPE_CLASS, type AppointmentStatus } from './StatusChip';
export { Avatar, getInitials } from './Avatar';
export { Skeleton } from './Skeleton';
export { Banner } from './Banner';
```

Em `frontend/src/lib/themedPaths.ts`, acrescentar à lista:
`'src/components/ui/Button.tsx'`, `'src/components/ui/IconButton.tsx'`, `'src/components/ui/Card.tsx'`, `'src/components/ui/MetricCard.tsx'`, `'src/components/ui/StatusChip.tsx'`, `'src/components/ui/Avatar.tsx'`, `'src/components/ui/Skeleton.tsx'`, `'src/components/ui/Banner.tsx'`, `'src/components/ui/EmptyState.tsx'`, `'src/components/ui/PageHeader.tsx'`.

- [ ] **Step 5: Rodar e verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -10)`
Expected: todos os testes passando (incluindo a conformidade), typecheck limpo, build concluído.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add action, content and page components"
```

---

### Task 4: Kit — formulários e tabela

**Files:**
- Create: `frontend/src/components/ui/Field.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Switch.tsx`, `Table.tsx`
- Modify (reescrever mantendo a API): `frontend/src/components/ui/PasswordInput.tsx`
- Modify: `frontend/src/components/ui/index.ts`, `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/components/ui/__tests__/forms.test.tsx`

**Interfaces:**
- Consumes: `cn`, `IconButton` não é usado aqui (o botão do `PasswordInput` é próprio).
- Produces:
  - `controlClass: string` (classe base dos controles) em `./Input`.
  - `Field({ id: string; label: string; hint?: string; error?: string; required?: boolean; className?: string; children: ReactNode })` e `fieldDescribedBy(id: string, opts: { hint?: string; error?: string }): string | undefined`.
  - `Input`, `Textarea` (`forwardRef`) com `invalid?: boolean`; `Select` (`forwardRef<HTMLSelectElement>`) com `invalid?: boolean` e `wrapperClassName?: string`.
  - `Switch({ checked: boolean; onCheckedChange(checked: boolean): void; label: string; description?: string; disabled?: boolean; id?: string })`.
  - `PasswordInput` com as mesmas props de hoje (`toggleLabel?`, atributos de input exceto `type`) mais `invalid?: boolean`.
  - `Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell` (props dos elementos HTML correspondentes; `Table` aceita `minWidth?: number`, padrão 640).

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/src/components/ui/__tests__/forms.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, fieldDescribedBy } from '../Field';
import { Input } from '../Input';
import { Select } from '../Select';
import { Switch } from '../Switch';
import { PasswordInput } from '../PasswordInput';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../Table';

describe('Field', () => {
  it('liga rótulo, dica e erro ao controle', () => {
    render(
      <Field id="nome" label="Nome do negócio" hint="Aparece para as clientes" error="Obrigatório">
        <Input id="nome" invalid aria-describedby={fieldDescribedBy('nome', { hint: 'x', error: 'y' })} />
      </Field>,
    );
    const input = screen.getByLabelText('Nome do negócio');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'nome-hint nome-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório');
  });

  it('sem dica nem erro não descreve nada', () => {
    expect(fieldDescribedBy('x', {})).toBeUndefined();
  });
});

describe('Select', () => {
  it('é um select nativo com as opções', async () => {
    render(
      <Select aria-label="Intervalo" defaultValue="30">
        <option value="15">15 min</option>
        <option value="30">30 min</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Intervalo' });
    await userEvent.selectOptions(select, '15');
    expect(select).toHaveValue('15');
  });
});

describe('Switch', () => {
  it('alterna e informa o estado', async () => {
    function Controlled() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onCheckedChange={setOn} label="Lembretes por WhatsApp" />;
    }
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Lembretes por WhatsApp' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('desabilitado não muda', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="X" disabled />);
    await userEvent.click(screen.getByRole('switch', { name: 'X' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PasswordInput', () => {
  it('mostra e oculta a senha', async () => {
    render(<PasswordInput aria-label="Senha" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Table', () => {
  it('rola dentro do próprio contêiner', () => {
    const { container } = render(
      <Table>
        <TableHead>
          <TableRow><TableHeaderCell>Cliente</TableHeaderCell></TableRow>
        </TableHead>
        <TableBody>
          <TableRow><TableCell>Mariana</TableCell></TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.firstElementChild).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toHaveAttribute('scope', 'col');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd frontend && npx vitest run src/components/ui/__tests__/forms.test.tsx)`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar**

`frontend/src/components/ui/Input.tsx`:

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const controlClass =
  'w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60';

export const invalidClass = 'border-danger focus:border-danger focus:ring-danger/30';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, 'h-11', invalid && invalidClass, className)}
      {...props}
    />
  );
});
```

`frontend/src/components/ui/Textarea.tsx`:

```tsx
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { controlClass, invalidClass } from './Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, 'min-h-[96px] py-2', invalid && invalidClass, className)}
      {...props}
    />
  );
});
```

`frontend/src/components/ui/Select.tsx`:

```tsx
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlClass, invalidClass } from './Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, invalid, children, ...props },
  ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlClass, 'h-11 appearance-none pr-9', invalid && invalidClass, className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
    </div>
  );
});
```

`frontend/src/components/ui/Field.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function fieldDescribedBy(id: string, { hint, error }: { hint?: string; error?: string }): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`frontend/src/components/ui/Switch.tsx`:

```tsx
'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descriptionId = description ? `${switchId}-description` : undefined;

  return (
    <div className="flex items-start justify-between gap-4 rounded-control border border-line bg-surface p-4">
      <div>
        <label htmlFor={switchId} className="text-[15px] font-semibold text-ink">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-1 text-[13px] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}
```

Reescrever `frontend/src/components/ui/PasswordInput.tsx` (mesma API, mais `invalid`):

```tsx
'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type MouseEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlClass, invalidClass } from './Input';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  toggleLabel?: string;
  invalid?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleLabel = 'senha', id, invalid, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [isVisible, setIsVisible] = useState(false);

    const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    };

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={inputId}
          type={isVisible ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={cn(controlClass, 'h-11 pr-12', invalid && invalidClass, className)}
        />
        <button
          type="button"
          aria-label={isVisible ? `Ocultar ${toggleLabel}` : `Mostrar ${toggleLabel}`}
          aria-pressed={isVisible}
          aria-controls={inputId}
          onMouseDown={handleMouseDown}
          onClick={() => setIsVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center rounded-r-control px-3 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50"
        >
          {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
```

`frontend/src/components/ui/Table.tsx`:

```tsx
import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Table({ className, minWidth = 640, style, ...props }: TableHTMLAttributes<HTMLTableElement> & { minWidth?: number }) {
  return (
    <div className="w-full overflow-x-auto rounded-card border border-line bg-surface">
      <table className={cn('w-full border-collapse text-left text-[15px]', className)} style={{ minWidth, ...style }} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-2 text-[13px] font-semibold text-muted', className)} {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t border-line first:border-t-0', className)} {...props} />;
}

export function TableHeaderCell({ className, scope = 'col', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope={scope} className={cn('px-4 py-3 font-semibold', className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-ink', className)} {...props} />;
}
```

- [ ] **Step 4: Exportar e registrar**

Em `frontend/src/components/ui/index.ts`, acrescentar:

```ts
export { Field, fieldDescribedBy } from './Field';
export { Input, controlClass } from './Input';
export { Select } from './Select';
export { Textarea } from './Textarea';
export { Switch } from './Switch';
export { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from './Table';
```

(`PasswordInput` já é exportado.)

Em `frontend/src/lib/themedPaths.ts`, acrescentar: `'src/components/ui/Field.tsx'`, `'src/components/ui/Input.tsx'`, `'src/components/ui/Select.tsx'`, `'src/components/ui/Textarea.tsx'`, `'src/components/ui/Switch.tsx'`, `'src/components/ui/PasswordInput.tsx'`, `'src/components/ui/Table.tsx'`.

- [ ] **Step 5: Rodar e verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -10)`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add form controls and table"
```

---

### Task 5: Kit — camadas, abas, menu, tema e toasts

**Files:**
- Modify (reescrever mantendo a API): `frontend/src/components/ui/Modal.tsx`
- Create: `frontend/src/components/ui/SidePanel.tsx`, `Tabs.tsx`, `DropdownMenu.tsx`, `ThemeSelect.tsx`
- Modify: `frontend/src/components/Toast.tsx` (só apresentação)
- Modify: `frontend/src/components/ui/index.ts`, `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/components/ui/__tests__/layers.test.tsx`

**Interfaces:**
- Consumes: `cn`, `useForcedDarkClass` (Task 1), `ThemeProvider` (Task 1), `Button`, `IconButton` (Task 3).
- Produces:
  - `Modal({ isOpen: boolean; onClose(): void; title: string; icon?: LucideIcon; description?: string; size?: 'sm' | 'md' | 'lg'; children: ReactNode; footer?: ReactNode })` e `ModalFooter({ onCancel; onSubmit; submitLabel; submitIcon?; submitting?; disabled? })` — mesmas props de hoje (mais `description` e `size` opcionais).
  - `SidePanel({ open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; side?: 'right' | 'bottom'; children: ReactNode; footer?: ReactNode })`.
  - `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (Radix, com estilo).
  - `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (com `destructive?: boolean`), `DropdownMenuLabel`, `DropdownMenuSeparator`.
  - `ThemeSelect({ className?: string })` — grupo de rádio "Tema" com Sistema, Claro, Escuro.

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/src/components/ui/__tests__/layers.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalFooter } from '../Modal';
import { SidePanel } from '../SidePanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../Tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu';
import { ThemeSelect } from '../ThemeSelect';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ForcedDark } from '@/components/theme/ForcedDark';

describe('Modal', () => {
  it('abre com título, fecha com Esc e chama onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Novo agendamento">
        <input aria-label="Cliente" />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Novo agendamento' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('botão Fechar chama onClose', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="X">conteúdo</Modal>);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('dentro de uma área escura, o portal abre no escuro', () => {
    render(
      <ForcedDark>
        <Modal isOpen onClose={() => {}} title="Escuro">conteúdo</Modal>
      </ForcedDark>,
    );
    expect(screen.getByRole('dialog', { name: 'Escuro' }).closest('.dark')).not.toBeNull();
  });

  it('rodapé padrão com Cancelar e a ação principal', async () => {
    const onSubmit = vi.fn();
    render(<ModalFooter onCancel={() => {}} onSubmit={onSubmit} submitLabel="Salvar" />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});

describe('SidePanel', () => {
  it('abre como diálogo e fecha pelo botão', async () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <SidePanel open={open} onOpenChange={setOpen} title="Ficha da cliente">
          conteúdo
        </SidePanel>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('dialog', { name: 'Ficha da cliente' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: 'Ficha da cliente' })).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('troca de conteúdo ao escolher outra aba', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Seções">
          <TabsTrigger value="a">Mensagens</TabsTrigger>
          <TabsTrigger value="b">Menu</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Conteúdo A</TabsContent>
        <TabsContent value="b">Conteúdo B</TabsContent>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Menu' }));
    expect(screen.getByText('Conteúdo B')).toBeVisible();
  });
});

describe('DropdownMenu', () => {
  it('abre e executa a ação escolhida', async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Ações</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('ThemeSelect', () => {
  it('troca entre Escuro e Claro', async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('começa em Sistema', async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    expect(await screen.findByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd frontend && npx vitest run src/components/ui/__tests__/layers.test.tsx)`
Expected: FAIL — `SidePanel`, `Tabs`, `DropdownMenu`, `ThemeSelect` não encontrados; os testes do `Modal` falham porque o modal atual não tem papel de diálogo nem botão "Fechar" com esse nome.

- [ ] **Step 3: Implementar**

Reescrever `frontend/src/components/ui/Modal.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';
import { Button } from './Button';
import { IconButton } from './IconButton';

const SIZE_CLASS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  description?: string;
  size?: keyof typeof SIZE_CLASS;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, icon: Icon, description, size = 'md', children, footer }: ModalProps) {
  const themeClass = useForcedDarkClass();

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <div className={themeClass}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
          <Dialog.Content
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-line bg-surface text-ink shadow-xl focus:outline-none',
              SIZE_CLASS[size],
            )}
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              {Icon ? <Icon className="h-5 w-5 text-brand-text" aria-hidden="true" /> : null}
              <Dialog.Title className="flex-1 text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Fechar" />
              </Dialog.Close>
            </header>
            {description ? (
              <Dialog.Description className="px-5 pt-4 text-[15px] text-muted">{description}</Dialog.Description>
            ) : null}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? (
              <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
                {footer}
              </footer>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  disabled?: boolean;
}

export function ModalFooter({ onCancel, onSubmit, submitLabel, submitIcon: SubmitIcon, submitting, disabled }: ModalFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={submitting}>
        Cancelar
      </Button>
      <Button onClick={onSubmit} loading={submitting} disabled={disabled}>
        {SubmitIcon && !submitting ? <SubmitIcon className="h-4 w-4" aria-hidden="true" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
```

Antes de trocar, ler a versão atual de `Modal.tsx` e `ModalFooter` e confirmar que os consumidores usam só as props listadas; se algum usar outra, manter o suporte e registrar no relatório.

`frontend/src/components/ui/SidePanel.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';
import { IconButton } from './IconButton';

const SIDE_CLASS = {
  right: 'inset-y-0 right-0 h-full w-full border-l sm:max-w-[480px]',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-card border-t',
} as const;

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: keyof typeof SIDE_CLASS;
  children: ReactNode;
  footer?: ReactNode;
}

export function SidePanel({ open, onOpenChange, title, description, side = 'right', children, footer }: SidePanelProps) {
  const themeClass = useForcedDarkClass();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className={themeClass}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
          <Dialog.Content
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn('fixed z-50 flex flex-col border-line bg-surface text-ink shadow-xl focus:outline-none', SIDE_CLASS[side])}
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Dialog.Title className="flex-1 text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Fechar" />
              </Dialog.Close>
            </header>
            {description ? (
              <Dialog.Description className="px-5 pt-4 text-[15px] text-muted">{description}</Dialog.Description>
            ) : null}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

`frontend/src/components/ui/Tabs.tsx`:

```tsx
'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  function TabsList({ className, ...props }, ref) {
    return (
      <TabsPrimitive.List
        ref={ref}
        className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-line bg-surface-2 p-1', className)}
        {...props}
      />
    );
  },
);

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          'inline-flex min-h-11 items-center whitespace-nowrap rounded-[8px] px-3 text-[13px] font-semibold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[state=active]:bg-surface data-[state=active]:text-ink lg:min-h-9',
          className,
        )}
        {...props}
      />
    );
  },
);

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  function TabsContent({ className, ...props }, ref) {
    return <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus:outline-none', className)} {...props} />;
  },
);
```

`frontend/src/components/ui/DropdownMenu.tsx`:

```tsx
'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export const DropdownMenuContent = forwardRef<ElementRef<typeof Menu.Content>, ComponentPropsWithoutRef<typeof Menu.Content>>(
  function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
    const themeClass = useForcedDarkClass();
    return (
      <Menu.Portal>
        <div className={themeClass}>
          <Menu.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn('z-50 min-w-[200px] rounded-control border border-line bg-surface p-1 text-ink shadow-lg', className)}
            {...props}
          />
        </div>
      </Menu.Portal>
    );
  },
);

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof Menu.Item>,
  ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(
        'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-[8px] px-3 text-[15px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 lg:min-h-9',
        destructive ? 'text-danger' : 'text-ink',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = forwardRef<ElementRef<typeof Menu.Label>, ComponentPropsWithoutRef<typeof Menu.Label>>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return <Menu.Label ref={ref} className={cn('px-3 py-2 text-[13px] font-semibold text-muted', className)} {...props} />;
  },
);

export const DropdownMenuSeparator = forwardRef<ElementRef<typeof Menu.Separator>, ComponentPropsWithoutRef<typeof Menu.Separator>>(
  function DropdownMenuSeparator({ className, ...props }, ref) {
    return <Menu.Separator ref={ref} className={cn('my-1 h-px bg-line', className)} {...props} />;
  },
);
```

`frontend/src/components/ui/ThemeSelect.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';

const OPTIONS = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
] as const;

export function ThemeSelect({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? 'system' : undefined;

  return (
    <div role="radiogroup" aria-label="Tema" className={cn('inline-flex gap-1 rounded-control border border-line bg-surface-2 p-1', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-9',
              selected ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

Em `frontend/src/components/Toast.tsx`, mudar só a apresentação, mantendo a lógica e a API:
- ícones: `success` → `className="text-success"`, `error` → `className="text-danger"`, `info` → `className="text-status-confirmed"`;
- `borderColors`: `success` → `'border-success/30'`, `error` → `'border-danger/30'`, `info` → `'border-status-confirmed/30'`;
- contêiner: `className="fixed top-4 right-4 z-50 flex flex-col gap-3"` ganha `aria-live="polite"`;
- cartão do toast: `` className={`relative rounded-control border ${borderColors[toast.type]} bg-surface p-4 pr-10 text-ink shadow-lg min-w-[300px] max-w-[420px] animate-slide-in`} `` com `role="status"`;
- texto: `className="text-[15px] leading-relaxed text-ink"`;
- botão de fechar: `className="absolute top-3 right-3 text-muted transition-colors hover:text-ink"` com `aria-label="Fechar aviso"`.

- [ ] **Step 4: Exportar e registrar**

Em `frontend/src/components/ui/index.ts`, acrescentar:

```ts
export { SidePanel } from './SidePanel';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './DropdownMenu';
export { ThemeSelect } from './ThemeSelect';
```

(`Modal` e `ModalFooter` já são exportados.)

Em `frontend/src/lib/themedPaths.ts`, acrescentar: `'src/components/ui/Modal.tsx'`, `'src/components/ui/SidePanel.tsx'`, `'src/components/ui/Tabs.tsx'`, `'src/components/ui/DropdownMenu.tsx'`, `'src/components/ui/ThemeSelect.tsx'`, `'src/components/Toast.tsx'`.

- [ ] **Step 5: Rodar e verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -10)`
Expected: tudo verde. Os modais existentes (agendamento, cliente, despesa, serviço, CPF/CNPJ, SuperAdmin, planos) passam a usar o novo `Modal` sem mudança nos consumidores.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add dialog, side panel, tabs, menu and theme select"
```

---

### Task 6: Galeria do kit (`/dev/ui`)

**Files:**
- Create: `frontend/src/app/dev/ui/page.tsx`
- Create: `frontend/src/components/dev/UiGallery.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/components/dev/__tests__/UiGallery.test.tsx`

**Interfaces:**
- Consumes: todo o kit (Tasks 3–5), `ThemeProvider` já aplicado no layout raiz.
- Produces: rota `/dev/ui`, disponível só fora de produção.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/components/dev/__tests__/UiGallery.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { UiGallery } from '../UiGallery';

describe('UiGallery', () => {
  it('mostra uma seção para cada grupo de componentes', () => {
    render(
      <ThemeProvider>
        <UiGallery />
      </ThemeProvider>,
    );
    for (const heading of ['Tema', 'Botões', 'Cartões e métricas', 'Status', 'Avatares', 'Avisos', 'Formulário', 'Tabela', 'Abas', 'Menu', 'Camadas', 'Estado vazio e carregamento']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
  });
});
```

Run: `(cd frontend && npx vitest run src/components/dev)`
Expected: FAIL — `../UiGallery` não encontrado.

- [ ] **Step 2: Implementar a galeria**

Criar `frontend/src/components/dev/UiGallery.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { CalendarPlus, CalendarX, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Avatar,
  Banner,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetricCard,
  Modal,
  ModalFooter,
  PageHeader,
  PasswordInput,
  Select,
  SidePanel,
  Skeleton,
  StatusChip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ThemeSelect,
  type AppointmentStatus,
} from '@/components/ui';

const STATUSES: AppointmentStatus[] = ['confirmado', 'aguardando', 'em_atendimento', 'concluido', 'faltou', 'cancelado'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function UiGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="app-theme min-h-screen">
      <main id="main-content" className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        <PageHeader title="Galeria do kit" description="Componentes do design system EasyAgenda+ nos dois temas." />

        <Section title="Tema">
          <ThemeSelect />
        </Section>

        <Section title="Botões">
          <div className="flex flex-wrap gap-3">
            <Button>Salvar</Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="ghost">Ver detalhes</Button>
            <Button variant="danger">Excluir</Button>
            <Button variant="whatsapp">Conectar WhatsApp</Button>
            <Button loading>Salvando</Button>
            <Button size="sm">Pequeno</Button>
            <Button size="lg">Grande</Button>
            <IconButton icon={Pencil} label="Editar" />
            <IconButton icon={Trash2} label="Excluir" variant="secondary" />
          </div>
        </Section>

        <Section title="Cartões e métricas">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Atendimentos hoje" value={12} delta={{ value: '+3 que ontem', trend: 'up' }} />
            <MetricCard label="Faturamento do dia" value="R$ 1.240,00" delta={{ value: '-5%', trend: 'down' }} />
            <MetricCard label="Despesas do mês" value="R$ 380,00" delta={{ value: '-12%', trend: 'down', tone: 'positive' }} />
          </div>
          <Card>
            <p className="text-[15px] text-ink">Cartão simples com borda de 1px e raio de 16px.</p>
          </Card>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
        </Section>

        <Section title="Avatares">
          <div className="flex items-center gap-3">
            <Avatar name="Mariana Souza" />
            <Avatar name="Paula Lima" size={40} />
            <Avatar name="Rafa" />
          </div>
        </Section>

        <Section title="Avisos">
          <div className="overflow-hidden rounded-card border border-line">
            <Banner tone="info">Informação para o negócio.</Banner>
            <Banner tone="warning">Faltam 3 dias no período gratuito.</Banner>
            <Banner tone="danger">Pagamento recusado.</Banner>
            <Banner tone="success">WhatsApp conectado.</Banner>
          </div>
        </Section>

        <Section title="Formulário">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="g-nome" label="Nome do negócio" hint="Aparece para as clientes">
              <Input id="g-nome" defaultValue="Studio Aurora" aria-describedby="g-nome-hint" />
            </Field>
            <Field id="g-email" label="E-mail" error="E-mail inválido">
              <Input id="g-email" invalid defaultValue="studio@" aria-describedby="g-email-error" />
            </Field>
            <Field id="g-intervalo" label="Intervalo da agenda">
              <Select id="g-intervalo" defaultValue="30">
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
              </Select>
            </Field>
            <Field id="g-senha" label="Senha">
              <PasswordInput id="g-senha" defaultValue="segredo123" />
            </Field>
            <Field id="g-obs" label="Observações" className="sm:col-span-2">
              <Textarea id="g-obs" placeholder="Preferências da cliente" />
            </Field>
            <div className="sm:col-span-2">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="Enviar lembretes por WhatsApp" description="Duas horas antes do horário." />
            </div>
          </div>
        </Section>

        <Section title="Tabela">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Cliente</TableHeaderCell>
                <TableHeaderCell>Último atendimento</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Mariana Souza</TableCell>
                <TableCell className="tabular-nums">12/09/2026</TableCell>
                <TableCell><StatusChip status="concluido" /></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Paula Lima</TableCell>
                <TableCell className="tabular-nums">17/09/2026</TableCell>
                <TableCell><StatusChip status="confirmado" /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section title="Abas">
          <Tabs defaultValue="mensagens">
            <TabsList aria-label="Seções do WhatsApp">
              <TabsTrigger value="mensagens">Mensagens</TabsTrigger>
              <TabsTrigger value="menu">Menu do bot</TabsTrigger>
            </TabsList>
            <TabsContent value="mensagens">Conteúdo de mensagens.</TabsContent>
            <TabsContent value="menu">Conteúdo do menu.</TabsContent>
          </Tabs>
        </Section>

        <Section title="Menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={MoreHorizontal} label="Ações" variant="secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section title="Camadas">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Abrir modal</Button>
            <Button variant="secondary" onClick={() => setPanelOpen(true)}>Abrir painel lateral</Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>Abrir folha inferior</Button>
          </div>
          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Novo agendamento"
            icon={CalendarPlus}
            footer={<ModalFooter onCancel={() => setModalOpen(false)} onSubmit={() => setModalOpen(false)} submitLabel="Agendar" />}
          >
            <p className="text-[15px] text-muted">Conteúdo do modal.</p>
          </Modal>
          <SidePanel open={panelOpen} onOpenChange={setPanelOpen} title="Ficha da cliente">
            <p className="text-[15px] text-muted">Conteúdo do painel lateral.</p>
          </SidePanel>
          <SidePanel open={sheetOpen} onOpenChange={setSheetOpen} title="Mais" side="bottom">
            <p className="text-[15px] text-muted">Conteúdo da folha inferior.</p>
          </SidePanel>
        </Section>

        <Section title="Estado vazio e carregamento">
          <Card>
            <EmptyState icon={CalendarX} title="Nenhum agendamento hoje" description="Os horários marcados aparecem aqui." action={{ label: 'Novo agendamento', onClick: () => undefined }} />
          </Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </Section>
      </main>
    </div>
  );
}
```

Criar `frontend/src/app/dev/ui/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { UiGallery } from '@/components/dev/UiGallery';

export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <UiGallery />;
}
```

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/dev'` e `'src/app/dev'`.

- [ ] **Step 3: Rodar e verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -15)`
Expected: tudo verde; no build de produção a rota `/dev/ui` responde 404.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): add development-only component gallery"
```

---

## Fatia 3 — Estrutura do painel

### Task 7: Navegação, barra lateral, barra inferior e abas de Ajustes

**Files:**
- Create: `frontend/src/lib/navigation.ts`
- Create: `frontend/src/components/shell/AppShell.tsx`, `Sidebar.tsx`, `BottomNav.tsx`, `MoreSheet.tsx`, `AccountMenu.tsx`, `TopBar.tsx`, `TrialBanner.tsx`, `SettingsTabs.tsx`
- Modify: `frontend/src/app/dashboard/layout.tsx` (substituído)
- Modify: `frontend/src/app/dashboard/configuracoes/page.tsx`, `frontend/src/app/dashboard/servicos/page.tsx`, `frontend/src/app/dashboard/planos/page.tsx` (acrescentar `<SettingsTabs />` no topo do conteúdo)
- Modify: `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/lib/__tests__/navigation.test.ts`, `frontend/src/components/shell/__tests__/AppShell.test.tsx`

**Interfaces:**
- Consumes: kit (Tasks 3–5), `useAuth()` de `@/contexts/AuthContext` (`user?.businessName: string`, `user?.subscriptionStatus`, `user?.subscriptionCurrentPeriodEnd`, `logout(): Promise<void>`).
- Produces:
  - `type NavItemId = 'hoje' | 'agenda' | 'clientes' | 'caixa' | 'whatsapp' | 'ajustes'`; `interface NavItem { id: NavItemId; label: string; href: string; icon: LucideIcon; matches: readonly string[] }`; `NAV_ITEMS: readonly NavItem[]`; `BOTTOM_NAV_IDS`; `MORE_MENU_IDS`; `NEW_APPOINTMENT_HREF = '/agendamentos?novo=1'`; `SETTINGS_TABS: readonly { label: string; href: string }[]`; `normalizePath(pathname: string): string`; `getActiveNavItem(pathname: string): NavItemId | null`; `getNavItem(id: NavItemId): NavItem`.
  - `AppShell({ children })`, `SettingsTabs()`.

- [ ] **Step 1: Escrever os testes que falham da navegação**

Criar `frontend/src/lib/__tests__/navigation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BOTTOM_NAV_IDS,
  MORE_MENU_IDS,
  NAV_ITEMS,
  NEW_APPOINTMENT_HREF,
  SETTINGS_TABS,
  getActiveNavItem,
  normalizePath,
} from '../navigation';

describe('navegação', () => {
  it('barra lateral tem exatamente estes itens, nesta ordem', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Hoje', 'Agenda', 'Clientes', 'Caixa', 'WhatsApp', 'Ajustes']);
  });

  it('endereços atuais não mudam', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/agendamentos',
      '/clientes',
      '/financeiro',
      '/whatsapp',
      '/configuracoes',
    ]);
  });

  it('barra inferior e menu Mais', () => {
    expect(BOTTOM_NAV_IDS).toEqual(['hoje', 'agenda', 'clientes']);
    expect(MORE_MENU_IDS).toEqual(['caixa', 'whatsapp', 'ajustes']);
    expect(NEW_APPOINTMENT_HREF).toBe('/agendamentos?novo=1');
  });

  it('abas de Ajustes', () => {
    expect(SETTINGS_TABS).toEqual([
      { label: 'Negócio', href: '/configuracoes' },
      { label: 'Serviços e equipe', href: '/servicos' },
      { label: 'Plano e cobrança', href: '/planos' },
    ]);
  });

  it.each([
    ['/dashboard', 'hoje'],
    ['/dashboard/', 'hoje'],
    ['/agendamentos', 'agenda'],
    ['/dashboard/agendamentos', 'agenda'],
    ['/clientes', 'clientes'],
    ['/financeiro', 'caixa'],
    ['/whatsapp', 'whatsapp'],
    ['/configuracoes', 'ajustes'],
    ['/servicos', 'ajustes'],
    ['/planos', 'ajustes'],
    ['/dashboard/planos', 'ajustes'],
    ['/pagamento', null],
  ])('%s ativa %s', (path, expected) => {
    expect(getActiveNavItem(path)).toBe(expected);
  });

  it('normaliza os endereços com /dashboard', () => {
    expect(normalizePath('/dashboard/clientes/')).toBe('/clientes');
    expect(normalizePath('/dashboard')).toBe('/dashboard');
  });
});
```

Run: `(cd frontend && npx vitest run src/lib/__tests__/navigation.test.ts)`
Expected: FAIL — `../navigation` não encontrado.

- [ ] **Step 2: Implementar a navegação**

Criar `frontend/src/lib/navigation.ts`:

```ts
import { CalendarDays, Home, MessageCircle, Settings, Users, Wallet, type LucideIcon } from 'lucide-react';

export type NavItemId = 'hoje' | 'agenda' | 'clientes' | 'caixa' | 'whatsapp' | 'ajustes';

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: LucideIcon;
  matches: readonly string[];
}

// Itens da barra lateral, na ordem do DESIGN.md, só os que já existem.
// Clube e pacotes, Relatórios e Minha página entram quando os sub-projetos entregarem as telas.
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'hoje', label: 'Hoje', href: '/dashboard', icon: Home, matches: ['/dashboard'] },
  { id: 'agenda', label: 'Agenda', href: '/agendamentos', icon: CalendarDays, matches: ['/agendamentos'] },
  { id: 'clientes', label: 'Clientes', href: '/clientes', icon: Users, matches: ['/clientes'] },
  { id: 'caixa', label: 'Caixa', href: '/financeiro', icon: Wallet, matches: ['/financeiro'] },
  { id: 'whatsapp', label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, matches: ['/whatsapp'] },
  { id: 'ajustes', label: 'Ajustes', href: '/configuracoes', icon: Settings, matches: ['/configuracoes', '/servicos', '/planos'] },
];

// Barra inferior do celular: Hoje, Agenda, [+], Clientes, [Mais].
export const BOTTOM_NAV_IDS: readonly NavItemId[] = ['hoje', 'agenda', 'clientes'];
export const MORE_MENU_IDS: readonly NavItemId[] = ['caixa', 'whatsapp', 'ajustes'];
export const NEW_APPOINTMENT_HREF = '/agendamentos?novo=1';

export const SETTINGS_TABS: readonly { label: string; href: string }[] = [
  { label: 'Negócio', href: '/configuracoes' },
  { label: 'Serviços e equipe', href: '/servicos' },
  { label: 'Plano e cobrança', href: '/planos' },
];

export function normalizePath(pathname: string): string {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (trimmed.startsWith('/dashboard/')) {
    return trimmed.slice('/dashboard'.length);
  }
  return trimmed;
}

export function getActiveNavItem(pathname: string): NavItemId | null {
  const path = normalizePath(pathname);
  const found = NAV_ITEMS.find((item) =>
    item.matches.some((match) => path === match || path.startsWith(`${match}/`)),
  );
  return found?.id ?? null;
}

export function getNavItem(id: NavItemId): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Item de navegação desconhecido: ${id}`);
  return item;
}
```

Run: `(cd frontend && npx vitest run src/lib/__tests__/navigation.test.ts)`
Expected: PASS.

- [ ] **Step 3: Escrever o teste que falha da estrutura**

Criar `frontend/src/components/shell/__tests__/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

const mockPathname = vi.hoisted(() => ({ value: '/dashboard' }));
const mockLogout = vi.hoisted(() => vi.fn());
const mockUser = vi.hoisted(() => ({
  value: { businessName: 'Studio Aurora', subscriptionStatus: 'active', subscriptionCurrentPeriodEnd: null } as Record<string, unknown>,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: mockLogout }),
}));

const { AppShell } = await import('../AppShell');

const renderShell = () =>
  render(
    <ThemeProvider>
      <AppShell>
        <p>conteúdo</p>
      </AppShell>
    </ThemeProvider>,
  );

describe('AppShell', () => {
  beforeEach(() => {
    mockPathname.value = '/dashboard';
    mockLogout.mockReset();
    mockUser.value = { businessName: 'Studio Aurora', subscriptionStatus: 'active', subscriptionCurrentPeriodEnd: null };
  });

  it('barra lateral com os seis itens na ordem', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Hoje',
      'Agenda',
      'Clientes',
      'Caixa',
      'WhatsApp',
      'Ajustes',
    ]);
    expect(screen.getAllByText('Studio Aurora').length).toBeGreaterThan(0);
  });

  it('Ajustes fica ativo em /servicos', () => {
    mockPathname.value = '/servicos';
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('barra inferior com Hoje, Agenda, +, Clientes e Mais', () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    const links = within(bottom).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual([
      'Hoje',
      'Agenda',
      'Novo agendamento',
      'Clientes',
    ]);
    expect(within(bottom).getByRole('link', { name: 'Novo agendamento' })).toHaveAttribute('href', '/agendamentos?novo=1');
    expect(within(bottom).getByRole('button', { name: 'Mais' })).toBeInTheDocument();
  });

  it('menu Mais tem Caixa, WhatsApp, Ajustes, tema e Sair', async () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    await userEvent.click(within(bottom).getByRole('button', { name: 'Mais' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mais' });
    expect(within(sheet).getAllByRole('link').map((link) => link.textContent)).toEqual(['Caixa', 'WhatsApp', 'Ajustes']);
    expect(within(sheet).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sair' }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('mostra o aviso do período de teste quando está em trial', () => {
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockUser.value = { businessName: 'Studio Aurora', subscriptionStatus: 'trialing', subscriptionCurrentPeriodEnd: inFiveDays };
    renderShell();
    expect(screen.getByRole('status')).toHaveTextContent('5 dias restantes');
  });

  it('o conteúdo fica em main#main-content', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
```

Run: `(cd frontend && npx vitest run src/components/shell)`
Expected: FAIL — `../AppShell` não encontrado.

- [ ] **Step 4: Implementar a estrutura**

Criar `frontend/src/components/shell/Sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { NAV_ITEMS, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';
import { AccountMenu } from './AccountMenu';

export interface SidebarProps {
  activeId: NavItemId | null;
  businessName: string;
  onLogout: () => void;
}

export function Sidebar({ activeId, businessName, onLogout }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <Image src={easyAgendaLogo} alt="" width={32} height={32} className="h-8 w-8" priority />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">EasyAgenda+</p>
          <p className="truncate text-[15px] font-bold text-ink">{businessName}</p>
        </div>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, label, href, icon: Icon }) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-control px-3 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                    active ? 'bg-brand/12 text-brand-text' : 'text-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-line p-3">
        <AccountMenu businessName={businessName} onLogout={onLogout} />
      </div>
    </aside>
  );
}
```

Criar `frontend/src/components/shell/AccountMenu.tsx`:

```tsx
'use client';

import { ChevronUp, LogOut } from 'lucide-react';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ThemeSelect,
} from '@/components/ui';

export function AccountMenu({ businessName, onLogout }: { businessName: string; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-h-11 items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Avatar name={businessName} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{businessName}</span>
        <ChevronUp className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="sr-only">Menu da conta</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[232px]">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <ThemeSelect className="w-full justify-between" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onLogout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Criar `frontend/src/components/shell/TopBar.tsx`:

```tsx
import Image from 'next/image';
import easyAgendaLogo from '@/icons/easyagenda-logo.svg';

export function TopBar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
      <Image src={easyAgendaLogo} alt="" width={28} height={28} className="h-7 w-7" />
      <p className="text-lg font-bold text-ink">{title}</p>
    </header>
  );
}
```

Criar `frontend/src/components/shell/BottomNav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { MoreHorizontal, Plus } from 'lucide-react';
import { BOTTOM_NAV_IDS, NEW_APPOINTMENT_HREF, getNavItem, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';

export interface BottomNavProps {
  activeId: NavItemId | null;
  onOpenMore: () => void;
}

const itemClass =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand';

function NavLink({ id, activeId }: { id: NavItemId; activeId: NavItemId | null }) {
  const { label, href, icon: Icon } = getNavItem(id);
  const active = id === activeId;
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={cn(itemClass, active ? 'text-brand-text' : 'text-muted')}>
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function BottomNav({ activeId, onOpenMore }: BottomNavProps) {
  const [first, second, third] = BOTTOM_NAV_IDS;
  const moreActive = activeId !== null && !BOTTOM_NAV_IDS.includes(activeId);

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <NavLink id={first} activeId={activeId} />
      <NavLink id={second} activeId={activeId} />
      <div className="flex flex-1 items-center justify-center">
        <Link
          href={NEW_APPOINTMENT_HREF}
          aria-label="Novo agendamento"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      </div>
      <NavLink id={third} activeId={activeId} />
      <button type="button" onClick={onOpenMore} className={cn(itemClass, moreActive ? 'text-brand-text' : 'text-muted')}>
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        Mais
      </button>
    </nav>
  );
}
```

Criar `frontend/src/components/shell/MoreSheet.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { MORE_MENU_IDS, getNavItem, type NavItemId } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import { Button, SidePanel, ThemeSelect } from '@/components/ui';

export interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: NavItemId | null;
  onLogout: () => void;
}

export function MoreSheet({ open, onOpenChange, activeId, onLogout }: MoreSheetProps) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Mais" side="bottom">
      <ul className="flex flex-col gap-1">
        {MORE_MENU_IDS.map((id) => {
          const { label, href, icon: Icon } = getNavItem(id);
          const active = id === activeId;
          return (
            <li key={id}>
              <Link
                href={href}
                onClick={() => onOpenChange(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-control px-3 text-[15px] font-semibold',
                  active ? 'bg-brand/12 text-brand-text' : 'text-ink hover:bg-surface-2',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-[13px] font-semibold text-muted">Tema</p>
        <ThemeSelect className="w-full justify-between" />
      </div>
      <Button variant="ghost" fullWidth className="mt-4 justify-start" onClick={() => { onOpenChange(false); onLogout(); }}>
        <LogOut className="h-5 w-5" aria-hidden="true" />
        Sair
      </Button>
    </SidePanel>
  );
}
```

Criar `frontend/src/components/shell/TrialBanner.tsx` (mesma regra do aviso atual em `dashboard/layout.tsx`):

```tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Banner } from '@/components/ui';

export function TrialBanner() {
  const { user } = useAuth();

  if (user?.subscriptionStatus !== 'trialing' || !user.subscriptionCurrentPeriodEnd) {
    return null;
  }

  const endsAt = new Date(user.subscriptionCurrentPeriodEnd);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const linkClass = 'font-bold text-brand-text underline underline-offset-2';

  return (
    <Banner tone="warning">
      {daysLeft > 0 ? (
        <span>
          <span className="font-semibold">
            {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}
          </span>{' '}
          no período gratuito · <Link href="/planos" className={linkClass}>Assine agora</Link> para não perder o acesso
        </span>
      ) : (
        <span>
          Seu período gratuito encerrou · <Link href="/planos" className={linkClass}>Escolha um plano</Link>
        </span>
      )}
    </Banner>
  );
}
```

Criar `frontend/src/components/shell/AppShell.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, getActiveNavItem } from '@/lib/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { TrialBanner } from './TrialBanner';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeId = getActiveNavItem(pathname);
  const businessName = user?.businessName || 'Seu negócio';
  const title = NAV_ITEMS.find((item) => item.id === activeId)?.label ?? 'EasyAgenda+';
  const handleLogout = () => {
    void logout();
  };

  return (
    <div className="app-theme min-h-screen">
      <Sidebar activeId={activeId} businessName={businessName} onLogout={handleLogout} />
      <div className="lg:pl-[248px]">
        <TopBar title={title} />
        <TrialBanner />
        <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav activeId={activeId} onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} activeId={activeId} onLogout={handleLogout} />
    </div>
  );
}
```

Criar `frontend/src/components/shell/SettingsTabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS, normalizePath } from '@/lib/navigation';
import { cn } from '@/lib/cn';

export function SettingsTabs() {
  const current = normalizePath(usePathname());

  return (
    <nav aria-label="Seções de Ajustes" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {SETTINGS_TABS.map((tab) => {
        const active = current === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-semibold transition-colors',
              active ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Substituir o conteúdo de `frontend/src/app/dashboard/layout.tsx`:

```tsx
'use client';

import { AppShell } from '@/components/shell/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

Nas páginas `frontend/src/app/dashboard/configuracoes/page.tsx`, `servicos/page.tsx` e `planos/page.tsx`: importar `SettingsTabs` de `@/components/shell/SettingsTabs` e renderizar `<SettingsTabs />` como primeiro elemento do conteúdo retornado (envolvendo com um fragmento se necessário). Não mexer no resto dessas páginas nesta tarefa.

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/lib/navigation.ts'`, `'src/components/shell'` e `'src/app/dashboard/layout.tsx'`.

- [ ] **Step 5: Rodar e verificar**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -15)`
Expected: tudo verde. O `Navbar` antigo não é mais renderizado (é removido na Task 18).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shell): add sidebar, bottom navigation and settings tabs"
```

---

## Fatia 4 — Telas

Regras comuns a todas as tarefas desta fatia (repetidas aqui para quem ler só uma tarefa):
- Mesmas funções, chamadas à API, estados, validações e textos. Só apresentação muda. Exceção: o título da tela passa a ser o nome do menu (Hoje, Agenda, Clientes, Caixa, WhatsApp, Ajustes, Serviços e equipe).
- Usar os componentes de `@/components/ui` no lugar de marcação equivalente feita à mão; usar só classes de token.
- A tela do Stitch indicada é referência de aparência; ignorar o que ela mostra e o sistema ainda não faz.
- Ao final, acrescentar os arquivos da tarefa em `frontend/src/lib/themedPaths.ts` e rodar a checagem padrão (Global Constraints).

### Task 8: Hoje (`/dashboard`)

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`, `frontend/src/components/DashboardCards.tsx`, `frontend/src/components/WeeklyChart.tsx`, `frontend/src/components/ProfitBar.tsx`
- Create: `frontend/src/hooks/useThemeColors.ts`
- Modify: `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/hooks/__tests__/useThemeColors.test.ts`
- Referência: `docs/design/stitch/hoje-desktop.html`, `hoje-mobile.html`

**Interfaces:**
- Consumes: `MetricCard`, `Card`, `Skeleton`, `PageHeader` (Task 3).
- Produces: `THEME_COLOR_TOKENS`, `type ThemeColorToken`, `type ThemeColors = Record<ThemeColorToken, string>`, `readThemeColors(getValue?: (cssVar: string) => string): ThemeColors`, `useThemeColors(): ThemeColors | null` em `@/hooks/useThemeColors`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/hooks/__tests__/useThemeColors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { THEME_COLOR_TOKENS, readThemeColors } from '../useThemeColors';

describe('readThemeColors', () => {
  it('converte as variáveis do tema em cores rgb', () => {
    const values: Record<string, string> = { '--color-brand': ' 255 122 0 ', '--color-success': '22 163 74' };
    const colors = readThemeColors((name) => values[name] ?? '');
    expect(colors.brand).toBe('rgb(255 122 0)');
    expect(colors.success).toBe('rgb(22 163 74)');
  });

  it('token ausente vira string vazia', () => {
    const colors = readThemeColors(() => '');
    expect(colors.danger).toBe('');
  });

  it('cobre os tokens usados pelos gráficos', () => {
    expect(THEME_COLOR_TOKENS).toEqual(['brand', 'success', 'danger', 'warning', 'muted', 'line', 'ink', 'surface', 'status-confirmed']);
  });
});
```

Run: `(cd frontend && npx vitest run src/hooks)`
Expected: FAIL — `../useThemeColors` não encontrado.

- [ ] **Step 2: Implementar o hook**

Criar `frontend/src/hooks/useThemeColors.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export const THEME_COLOR_TOKENS = ['brand', 'success', 'danger', 'warning', 'muted', 'line', 'ink', 'surface', 'status-confirmed'] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
export type ThemeColors = Record<ThemeColorToken, string>;

const readFromDocument = (cssVar: string) => getComputedStyle(document.documentElement).getPropertyValue(cssVar);

// Gráficos (Recharts) precisam de cores concretas; esta função lê os tokens do tema ativo.
export function readThemeColors(getValue: (cssVar: string) => string = readFromDocument): ThemeColors {
  return Object.fromEntries(
    THEME_COLOR_TOKENS.map((token) => {
      const channels = getValue(`--color-${token}`).trim();
      return [token, channels ? `rgb(${channels})` : ''];
    }),
  ) as ThemeColors;
}

export function useThemeColors(): ThemeColors | null {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ThemeColors | null>(null);

  useEffect(() => {
    setColors(readThemeColors());
  }, [resolvedTheme]);

  return colors;
}
```

Run: `(cd frontend && npx vitest run src/hooks)`
Expected: PASS.

- [ ] **Step 3: Migrar a tela**

- `DashboardCards.tsx`: manter as props e os dados; renderizar cada indicador com `MetricCard` (rótulo, valor formatado com os mesmos formatadores de hoje) numa grade `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`.
- `WeeklyChart.tsx` e `ProfitBar.tsx`: dentro de `Card`; cores das séries, eixos e grade vindas de `useThemeColors()` (`brand` para a série principal, `success`/`danger` para ganho/despesa quando houver, `line` para a grade, `muted` para os rótulos dos eixos, `surface`/`ink` para o tooltip). Enquanto `useThemeColors()` retornar `null`, renderizar `Skeleton` com a altura do gráfico.
- `dashboard/page.tsx`: título da tela com `PageHeader title="Hoje"` e o mesmo texto de apoio (se houver); o estado de carregamento troca `LoadingSkeleton` por uma grade de `Skeleton` com o formato da tela; a lógica de busca, o tratamento de `SUBSCRIPTION_REQUIRED`, o redirecionamento e o checkout via `PIX_STORAGE_KEY` ficam exatamente como estão.
- Se o `ProfessionalAgenda` aparecer nesta tela, ele é migrado na Task 9; aqui só continua sendo renderizado.

- [ ] **Step 4: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/app/dashboard/page.tsx'`, `'src/components/DashboardCards.tsx'`, `'src/components/WeeklyChart.tsx'`, `'src/components/ProfitBar.tsx'`, `'src/hooks/useThemeColors.ts'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(today): migrate the dashboard home to the design system"
```

---

### Task 9: Agenda (`/agendamentos`)

**Files:**
- Modify: `frontend/src/components/AppointmentModule.tsx`, `frontend/src/components/appointments/AppointmentCard.tsx`, `frontend/src/components/appointments/DateNavigationBar.tsx`, `frontend/src/components/appointments/CreateAppointmentModal.tsx`, `frontend/src/components/ProfessionalAgenda.tsx`
- Modify: `frontend/src/app/dashboard/agendamentos/page.tsx` (envolver o módulo em `<Suspense>`)
- Create: `frontend/src/hooks/useNewAppointmentParam.ts`
- Modify: `frontend/src/lib/themedPaths.ts`
- Test: `frontend/src/hooks/__tests__/useNewAppointmentParam.test.ts`
- Referência: `docs/design/stitch/agenda-desktop.html`, `agenda-mobile.html`, `agendamento-detalhes.html`

**Interfaces:**
- Consumes: `NEW_APPOINTMENT_HREF` (Task 7), `StatusChip`, `STATUS_STRIPE_CLASS`, `type AppointmentStatus`, `MetricCard`, `Button`, `IconButton`, `EmptyState`, `PageHeader`, `Skeleton` (Task 3), `Modal`, `ModalFooter`, `Tabs` (Task 5), `Field`, `Select`, `Input`, `Textarea` (Task 4).
- Produces: `useNewAppointmentParam(): { open: boolean; clear(): void }` em `@/hooks/useNewAppointmentParam`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/src/hooks/__tests__/useNewAppointmentParam.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSearch = vi.hoisted(() => ({ value: '' }));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(mockSearch.value),
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const { useNewAppointmentParam } = await import('../useNewAppointmentParam');

describe('useNewAppointmentParam', () => {
  beforeEach(() => {
    mockSearch.value = '';
    mockReplace.mockReset();
  });

  it('abre quando o endereço tem novo=1', () => {
    mockSearch.value = 'novo=1';
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.open).toBe(true);
  });

  it('não abre sem o parâmetro', () => {
    const { result } = renderHook(() => useNewAppointmentParam());
    expect(result.current.open).toBe(false);
  });

  it('limpar remove o parâmetro do endereço', () => {
    mockSearch.value = 'novo=1';
    const { result } = renderHook(() => useNewAppointmentParam());
    act(() => result.current.clear());
    expect(mockReplace).toHaveBeenCalledWith('/agendamentos', { scroll: false });
  });

  it('limpar sem o parâmetro não navega', () => {
    const { result } = renderHook(() => useNewAppointmentParam());
    act(() => result.current.clear());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
```

Run: `(cd frontend && npx vitest run src/hooks/__tests__/useNewAppointmentParam.test.ts)`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 2: Implementar o hook**

Criar `frontend/src/hooks/useNewAppointmentParam.ts`:

```ts
'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// O botão "+" da barra inferior leva a /agendamentos?novo=1; a Agenda abre o modal de criação.
export function useNewAppointmentParam(): { open: boolean; clear: () => void } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const open = searchParams.get('novo') === '1';

  const clear = useCallback(() => {
    if (open) {
      router.replace('/agendamentos', { scroll: false });
    }
  }, [open, router]);

  return { open, clear };
}
```

Run: `(cd frontend && npx vitest run src/hooks/__tests__/useNewAppointmentParam.test.ts)`
Expected: PASS.

- [ ] **Step 3: Ligar o parâmetro na Agenda**

Em `AppointmentModule.tsx`:
- `const newAppointment = useNewAppointmentParam();`
- `useEffect(() => { if (newAppointment.open) setShowModal(true); }, [newAppointment.open]);`
- no `onClose` do `CreateAppointmentModal` (e após criar com sucesso, onde hoje o modal fecha): além de `setShowModal(false)`, chamar `newAppointment.clear()`.

Em `frontend/src/app/dashboard/agendamentos/page.tsx`, envolver o conteúdo que renderiza `AppointmentModule` em `<Suspense fallback={null}>` (importado de `react`), porque `useSearchParams` exige a fronteira de suspense no App Router.

- [ ] **Step 4: Migrar a apresentação**

- `AppointmentCard.tsx` (linha de agenda): horário à esquerda com `tabular-nums`; faixa vertical de 4px na cor do status (`STATUS_STRIPE_CLASS[status]`); nome da cliente em negrito (`text-ink font-semibold`); serviço, profissional e valor em `text-muted`; `StatusChip` com o status; ações com `IconButton` (rótulos acessíveis em português) ou `DropdownMenu`. Os status que existem hoje no backend são `confirmado`, `concluido` e `cancelado`; mapear direto para `AppointmentStatus`.
- `AppointmentModule.tsx`: `StatsCard` → `MetricCard`; filtros de status e modo de visualização com `Tabs` (ou botões segmentados com as classes do `TabsList`), mantendo os mesmos valores e handlers; `EmptyState` e `PageHeader` já vêm do kit.
- `DateNavigationBar.tsx`: `IconButton` para anterior/próximo, data com `tabular-nums`, `Button variant="secondary"` para "Hoje".
- `CreateAppointmentModal.tsx`: campos com `Field` + `Select`/`Input`/`Textarea`; horários disponíveis como botões com as classes de chip (selecionado: `bg-brand text-on-brand`; livre: `border border-line bg-surface text-ink`); mantém `Modal`/`ModalFooter`.
- `ProfessionalAgenda.tsx`: mesmas regras da linha de agenda.

- [ ] **Step 5: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/AppointmentModule.tsx'`, `'src/components/appointments'`, `'src/components/ProfessionalAgenda.tsx'`, `'src/app/dashboard/agendamentos/page.tsx'`, `'src/hooks/useNewAppointmentParam.ts'`.

Rodar a checagem padrão com os arquivos acima.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agenda): migrate appointments to the design system and open creation from +"
```

---

### Task 10: Clientes (`/clientes`)

**Files:**
- Modify: `frontend/src/components/ClientModule.tsx`, `frontend/src/components/clients/ClientDetailPanel.tsx`, `frontend/src/components/clients/ClientFormModal.tsx`, `frontend/src/app/dashboard/clientes/page.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`
- Referência: `docs/design/stitch/clientes-lista.html`, `cliente-ficha.html`

**Interfaces:**
- Consumes: `Table*`, `Field`, `Input`, `Textarea` (Task 4); `SidePanel`, `Modal`, `ModalFooter`, `DropdownMenu*` (Task 5); `Avatar`, `Button`, `IconButton`, `EmptyState`, `PageHeader`, `Skeleton`, `Card` (Task 3).

- [ ] **Step 1: Migrar**

- `ClientModule.tsx`: busca com `Input` (ícone de lupa à esquerda); no desktop (`lg:`) a lista vira `Table` com Avatar + nome, telefone, último atendimento (`tabular-nums`) e ações (`DropdownMenu` ou `IconButton`s); no celular, lista de `Card`s compactos com as mesmas informações. Mesmos handlers, filtros e paginação de hoje.
- `ClientDetailPanel.tsx`: passa a ser renderizado dentro de `SidePanel` (`open` ligado ao estado que hoje abre o painel; `onOpenChange(false)` chama o mesmo handler de fechar). Conteúdo com os mesmos dados e ações.
- `ClientFormModal.tsx`: campos com `Field` + `Input`/`Textarea`; mantém `Modal`/`ModalFooter` e as mesmas validações e mensagens.
- `clientes/page.tsx`: só o que for apresentação (o `FeatureGate` é migrado na Task 17).

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/ClientModule.tsx'`, `'src/components/clients'`, `'src/app/dashboard/clientes/page.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(clients): migrate clients to the design system"
```

---

### Task 11: Caixa (`/financeiro`)

**Files:**
- Modify: `frontend/src/components/FinanceModule.tsx`, `frontend/src/components/finance/FinanceChart.tsx`, `frontend/src/components/finance/ExpensesTable.tsx`, `frontend/src/components/finance/ExpenseModal.tsx`, `frontend/src/app/dashboard/financeiro/page.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`
- Referência: `docs/design/stitch/caixa.html`

**Interfaces:**
- Consumes: `useThemeColors` (Task 8); `MetricCard`, `Card`, `Button`, `IconButton`, `PageHeader`, `Skeleton`, `EmptyState` (Task 3); `Table*`, `Field`, `Input`, `Select` (Task 4); `Modal`, `ModalFooter`, `Tabs` (Task 5).

- [ ] **Step 1: Migrar**

- `FinanceModule.tsx`: resumo (ganhos, despesas, lucro) com `MetricCard`; seletor de período com `Tabs` ou botões segmentados mantendo os mesmos valores; botões de exportação com `Button variant="secondary"`; o bloqueio por plano segue usando o `FeatureGate` (migrado na Task 17). **A geração do PDF (jsPDF) não muda** — as cores dentro do PDF ficam como estão.
- `FinanceChart.tsx`: dentro de `Card`, cores via `useThemeColors()` (`success` para ganhos, `danger` para despesas, `brand` para lucro, `line` na grade, `muted` nos eixos); `Skeleton` enquanto as cores não estão prontas.
- `ExpensesTable.tsx`: `Table` com valores em `tabular-nums` e ações com `IconButton`; `EmptyState` quando vazio.
- `ExpenseModal.tsx`: `Field` + `Input`/`Select`; mantém `Modal`/`ModalFooter`.

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/FinanceModule.tsx'`, `'src/components/finance'`, `'src/app/dashboard/financeiro/page.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(cash): migrate finance to the design system"
```

---

### Task 12: WhatsApp (`/whatsapp`)

**Files:**
- Modify: `frontend/src/components/WhatsAppModule.tsx`, `frontend/src/components/whatsapp/ConnectionPanel.tsx`, `frontend/src/components/whatsapp/MessageConfigPanel.tsx`, `frontend/src/components/whatsapp/MenuOptionsPanel.tsx`, `frontend/src/components/whatsapp/ChatSimulator.tsx`, `frontend/src/app/dashboard/whatsapp/page.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`
- Referência: `docs/design/stitch/whatsapp-conexao.html`

**Interfaces:**
- Consumes: `Button` (variante `whatsapp` só em ações de WhatsApp), `Card`, `Banner`, `PageHeader`, `IconButton`, `Skeleton` (Task 3); `Field`, `Input`, `Textarea`, `Switch`, `Select` (Task 4); `Tabs`, `Modal`, `DropdownMenu*` (Task 5).

- [ ] **Step 1: Migrar**

- `WhatsAppModule.tsx`: seções (conexão, mensagens, menu do bot, simulador) com `Tabs` se hoje já são abas; se forem blocos empilhados, `Card`s empilhados. Mesmos estados de conexão, polling e handlers.
- `ConnectionPanel.tsx`: estado da conexão com um chip (conectado: `bg-success/12 text-success`; desconectado: `bg-danger/12 text-danger`; conectando: `bg-warning/12 text-warning`); QR code dentro de `Card` com fundo `bg-surface` e borda `border-line`; "Conectar"/"Gerar QR code" com `Button variant="whatsapp"`; "Desconectar" com `Button variant="danger"`.
- `MessageConfigPanel.tsx`: cada mensagem com `Field` + `Textarea`; as dicas de variáveis continuam no `hint`; salvar com `Button` (principal).
- `MenuOptionsPanel.tsx`: lista de opções em `Card`/linhas com `IconButton` para editar/remover/reordenar; formulário em `Modal` com `Field`s.
- `ChatSimulator.tsx`: balões do cliente em `bg-surface-2 text-ink`, balões do bot em `bg-whatsapp/12 text-ink`, campo de digitação com `Input`, enviar com `IconButton`. Emojis continuam nas mensagens do bot (são conteúdo), mas nenhum emoji novo na interface.

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/WhatsAppModule.tsx'`, `'src/components/whatsapp'`, `'src/app/dashboard/whatsapp/page.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(whatsapp): migrate WhatsApp screens to the design system"
```

---

### Task 13: Ajustes › Negócio (`/configuracoes`)

**Files:**
- Modify: `frontend/src/components/SettingsModule.tsx` (vira o contêiner com estado e handlers)
- Create: `frontend/src/components/settings/` — um componente por seção existente do `SettingsModule` (os nomes seguem as seções atuais; por exemplo `BusinessProfileSection.tsx`, `AccountSection.tsx`, `ScheduleSection.tsx`, `RemindersSection.tsx`, `IntegrationsSection.tsx`) e `AppearanceSection.tsx`
- Modify: `frontend/src/app/dashboard/configuracoes/page.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`

**Interfaces:**
- Consumes: `SettingsTabs` (Task 7); `ThemeSelect` (Task 5); `Card`, `Button`, `PageHeader`, `Skeleton`, `Banner` (Task 3); `Field`, `Input`, `Select`, `Switch`, `PasswordInput` (Task 4).
- Produces: componentes de seção que recebem por props os valores e handlers que já existem no `SettingsModule` (nenhum estado novo dentro das seções).

- [ ] **Step 1: Dividir sem mudar lógica**

- Ler `SettingsModule.tsx` inteiro e listar as seções atuais (cada `SettingsPanel`).
- Para cada seção, criar um componente em `src/components/settings/` que recebe via props exatamente os valores, setters e handlers que aquela seção usa hoje. **Mover o JSX; não reescrever a lógica.** Estado, efeitos, carregamento, salvamento e validação ficam no `SettingsModule`.
- Criar `AppearanceSection.tsx` com um `Card` "Aparência" contendo o `ThemeSelect` e a frase "O tema segue o seu aparelho quando está em Sistema."
- O `SettingsModule` passa a compor as seções, com `AppearanceSection` incluída.

- [ ] **Step 2: Migrar a apresentação**

- Cada seção dentro de `Card`, com título 17–18px peso 700 e descrição `text-muted`.
- Campos com `Field` + `Input`/`Select`; senhas com `PasswordInput`; o `ToggleRow` de lembretes vira `Switch`; dias de funcionamento como botões de alternância com as classes de chip (ativo `bg-brand text-on-brand`, inativo `border border-line bg-surface text-ink`), com `aria-pressed`.
- Um único botão principal de salvar por formulário, como hoje.
- `configuracoes/page.tsx`: `<SettingsTabs />` (já incluído na Task 7) seguido de `PageHeader title="Ajustes"`; o `FeatureGate` é migrado na Task 17.

- [ ] **Step 3: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/SettingsModule.tsx'`, `'src/components/settings'`, `'src/app/dashboard/configuracoes/page.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima. Na checagem de comportamento, as linhas de estado e handlers devem aparecer só como movidas (mesmo conteúdo entre `-` e `+`).

Confirmar também que `wc -l frontend/src/components/SettingsModule.tsx` ficou bem abaixo das 994 linhas iniciais.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(settings): split business settings into sections and migrate to the design system"
```

---

### Task 14: Ajustes › Serviços e equipe (`/servicos`) e contêiner de Plano (`/planos`)

**Files:**
- Modify: `frontend/src/components/ServiceProfessionalModule.tsx`, `frontend/src/components/services/ServiceCard.tsx`, `frontend/src/components/services/ProfessionalCard.tsx`, `frontend/src/components/services/ServiceProfessionalModal.tsx`, `frontend/src/app/dashboard/servicos/page.tsx`
- Modify: `frontend/src/app/dashboard/planos/page.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`

**Interfaces:**
- Consumes: `SettingsTabs` (Task 7); `ForcedDark` (Task 1); `Card`, `Avatar`, `Button`, `IconButton`, `PageHeader`, `EmptyState`, `Skeleton` (Task 3); `Field`, `Input`, `Select`, `Textarea` (Task 4); `Modal`, `ModalFooter`, `Tabs`, `DropdownMenu*` (Task 5).

- [ ] **Step 1: Migrar Serviços e equipe**

- `ServiceProfessionalModule.tsx`: as duas listas (serviços e profissionais) com `Tabs` usando os mesmos valores de aba de hoje (`'servicos'` e `'profissionais'`); `PageHeader title="Serviços e equipe"`.
- `ServiceCard.tsx`: `Card` com nome, duração e preço em `tabular-nums`, ações com `IconButton`.
- `ProfessionalCard.tsx`: `Card` com `Avatar` (foto quando houver), nome e ações.
- `ServiceProfessionalModal.tsx`: `Field` + `Input`/`Select`/`Textarea`; envio de foto continua usando o bucket `professional-photos` exatamente como hoje; mantém `Modal`/`ModalFooter`.
- `servicos/page.tsx`: `<SettingsTabs />` (já incluído) e o módulo.

- [ ] **Step 2: Contêiner da página de Plano**

Em `frontend/src/app/dashboard/planos/page.tsx`: manter `<SettingsTabs />` no topo e envolver o `PricingPlansSection` em `<ForcedDark className="rounded-card p-4 sm:p-6">…</ForcedDark>`. **Não mexer em `PricingPlansSection.tsx`.** O arquivo `planos/page.tsx` não entra na lista de conformidade (usa o `ForcedDark`, cujo visual escuro é intencional).

- [ ] **Step 3: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/ServiceProfessionalModule.tsx'`, `'src/components/services'`, `'src/app/dashboard/servicos/page.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima. Conferir com `git diff <BASE> -- frontend/src/components/marketing/PricingPlansSection.tsx` que o componente não mudou (saída vazia).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(settings): migrate services and team, keep plans in a dark container"
```

---

### Task 15: Login e cadastro

**Files:**
- Modify: `frontend/src/components/auth/AuthForm.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`

**Interfaces:**
- Consumes: `Button`, `Card`, `Banner` (Task 3); `Field`, `Input`, `Select`, `PasswordInput` (Task 4); `ThemeSelect` (Task 5, opcional no rodapé).

- [ ] **Step 1: Migrar**

- A `div` raiz troca `min-h-screen bg-[radial-gradient(...)] px-4 py-10` por `app-theme min-h-screen px-4 py-10` (fundo `bg-bg` vem do `app-theme`).
- O formulário fica num `Card` centralizado (`mx-auto w-full max-w-md`), com o símbolo EasyAgenda+ e o título da tela (24px peso 700).
- Campos com `Field` + `Input`/`Select`/`PasswordInput`, mantendo nomes, validações, mensagens de erro, máscaras (WhatsApp, CPF/CNPJ) e a escolha de plano do cadastro exatamente como hoje.
- Mensagens de erro gerais com `Banner tone="danger"`; o botão de enviar é o único botão principal (`Button fullWidth loading={…}`).
- Links (entrar/criar conta/esqueci a senha) em `text-brand-text font-semibold`.

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/auth/AuthForm.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e o arquivo acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(auth): migrate login and signup to the design system"
```

---

### Task 16: Verificação de e-mail, esqueci/redefinir senha e confirmação

**Files:**
- Modify: `frontend/src/components/auth/EmailVerificationView.tsx`, `frontend/src/components/auth/ForgotPasswordView.tsx`, `frontend/src/components/auth/ResetPasswordView.tsx`, `frontend/src/components/auth/AuthConfirmView.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`

**Interfaces:**
- Consumes: `Button`, `Card`, `Banner`, `Skeleton` (Task 3); `Field`, `Input`, `PasswordInput` (Task 4).

- [ ] **Step 1: Migrar**

Mesmas regras da Task 15 para cada uma das quatro telas:
- raiz com `app-theme min-h-screen px-4 py-10` no lugar do gradiente;
- conteúdo num `Card` centralizado com o símbolo e o título;
- campos com `Field` + `Input`/`PasswordInput`;
- estados (enviando, enviado, erro, link expirado, confirmando) com `Banner` no tom adequado (`info`, `success`, `danger`, `warning`) e os mesmos textos;
- um único botão principal por estado.

`AuthConfirmView.tsx` tem 529 linhas com lógica de confirmação e redirecionamento: mudar só marcação e classes.

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/components/auth'` (a pasta inteira, já que `AuthForm.tsx` foi migrado na Task 15).

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(auth): migrate verification, password and confirmation screens"
```

---

### Task 17: Pagamento e peças comuns

**Files:**
- Modify: `frontend/src/app/pagamento/page.tsx`
- Modify: `frontend/src/components/billing/FeatureGate.tsx`, `frontend/src/components/billing/SubscriptionBlockCard.tsx`, `frontend/src/components/billing/CpfCnpjModal.tsx`, `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/lib/themedPaths.ts`

**Interfaces:**
- Consumes: `Button`, `Card`, `Banner`, `Skeleton`, `PageHeader` (Task 3); `Field`, `Input` (Task 4); `Modal`, `ModalFooter` (Task 5).

- [ ] **Step 1: Migrar**

- `pagamento/page.tsx`: as duas raízes (`<main className="flex min-h-screen items-center justify-center bg-black px-4">` e `<main id="main-content" className="min-h-screen bg-black px-4 py-8">`) passam a usar `app-theme` no lugar de `bg-black`; cabeçalho com o símbolo e o nome EasyAgenda+; opções de pagamento em `Card`s; ações de pagamento (Pix, cartão, assinar) com o botão principal (`bg-brand`), nunca verde; QR code do Pix dentro de `Card` com `bg-surface`; o texto copia-e-cola com `Input readOnly` + `Button variant="secondary"` "Copiar". Toda a lógica de checkout, polling e redirecionamento fica igual.
- `FeatureGate.tsx` e `SubscriptionBlockCard.tsx`: `Card` com ícone `text-muted`, texto e o botão principal de upgrade.
- `CpfCnpjModal.tsx`: `Field` + `Input`, mantendo máscara e validação; `Modal`/`ModalFooter`.
- `ErrorBoundary.tsx`: tela de erro com `app-theme`, `Card`, texto e `Button` "Tentar novamente".

- [ ] **Step 2: Registrar e verificar**

Em `frontend/src/lib/themedPaths.ts`, acrescentar `'src/app/pagamento/page.tsx'`, `'src/components/billing'`, `'src/components/ErrorBoundary.tsx'`.

Rodar a checagem padrão (Global Constraints) com `<BASE>` = commit anterior à tarefa e os arquivos acima.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(billing): migrate payment page and shared billing components"
```

---

## Fatia 5 — Limpeza

### Task 18: Remover o que foi substituído e fechar a conformidade

**Files:**
- Delete: `frontend/src/components/Navbar.tsx`, `frontend/src/components/ui/ThemeToggle.tsx`, `frontend/src/components/ui/StatsCard.tsx`
- Modify: `frontend/src/components/ui/index.ts` (remover as exportações apagadas)
- Modify: `frontend/src/types/index.ts` (remover `TabId` e `TabItem` se não houver mais uso)
- Modify: `frontend/src/lib/themedPaths.ts`

- [ ] **Step 1: Confirmar que nada mais usa**

Run: `grep -rn "Navbar\b\|ThemeToggle\|StatsCard\|TabId\|TabItem" frontend/src --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: nenhuma ocorrência fora das definições que serão apagadas. `LoadingSkeleton` continua (é usado pelo SuperAdmin).

- [ ] **Step 2: Apagar e ajustar exportações**

```bash
git rm frontend/src/components/Navbar.tsx frontend/src/components/ui/ThemeToggle.tsx frontend/src/components/ui/StatsCard.tsx
```

Em `frontend/src/components/ui/index.ts`, remover as linhas de `StatsCard` e `ThemeToggle`. Em `frontend/src/types/index.ts`, remover `TabId` e `TabItem` se o grep do Step 1 confirmou que não há uso.

- [ ] **Step 3: Fechar a lista de conformidade**

Substituir os arquivos individuais de `src/components/ui/` na lista por `'src/components/ui'` (a pasta inteira) e acrescentar `'src/app/dashboard'` com uma exceção: como `src/app/dashboard/planos/page.tsx` usa o `ForcedDark`, ele não tem classes de cor fixa e pode entrar também — confirmar rodando o teste.

Run: `(cd frontend && npx vitest run src/__tests__/themeCompliance.test.ts)`
Expected: PASS.

- [ ] **Step 4: Varredura final**

Run: `grep -rnE "bg-black|text-white|bg-dark-light|text-gray-[0-9]|border-white/" frontend/src/app/dashboard frontend/src/app/pagamento frontend/src/components/shell frontend/src/components/ui frontend/src/components/settings frontend/src/components/auth frontend/src/components/appointments frontend/src/components/clients frontend/src/components/finance frontend/src/components/whatsapp frontend/src/components/services frontend/src/components/billing`
Expected: nenhuma ocorrência.

- [ ] **Step 5: Verificação completa**

Run: `(cd frontend && npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -15)`
Run: `(cd backend && npm run typecheck && npm test 2>&1 | tail -5)`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(ui): remove replaced navbar, theme toggle and stats card"
```

---

### Task 19: Verificação visual com o dono (manual)

Esta tarefa não altera código; é feita com o dono do produto.

- [ ] **Step 1: Galeria**

Com `(cd frontend && npm run dev)`, abrir `http://localhost:3000/dev/ui` e conferir cada seção nos temas Claro e Escuro, no desktop e com a janela em 375px de largura.

- [ ] **Step 2: Páginas fora do escopo**

Abrir `/`, `/termos`, `/privacidade` e o SuperAdmin nos dois temas do aparelho e confirmar que estão iguais ao que eram antes do B (fundo preto, mesmos textos e fontes).

- [ ] **Step 3: Telas do painel**

Com as variáveis de ambiente do backend e do Supabase fornecidas pelo dono, subir backend e frontend, entrar com uma conta de teste e percorrer: Hoje, Agenda (incluindo o **+** no celular), Clientes (ficha no painel lateral), Caixa, WhatsApp, Ajustes (as três abas), login, cadastro, esqueci a senha e pagamento — nos dois temas, no desktop e em 375px. Anotar qualquer corte, sobreposição ou contraste ruim como item de correção.

---

## Verificação de cobertura da especificação

| Item da especificação | Tarefa |
|---|---|
| Tokens em variáveis CSS, claro e escuro, no Tailwind com transparência | 1 |
| Tema com next-themes, padrão do aparelho, chave `easyagenda-theme` | 1 |
| Seletor Sistema / Claro / Escuro (Ajustes, Mais, menu da conta) | 5, 7, 13 |
| Plus Jakarta Sans no escopo; Space Grotesk fora dele | 1 |
| Isolamento de landing, termos, privacidade e SuperAdmin | 1 |
| Portais do kit no escuro dentro de áreas forçadas | 1, 5 |
| Dependências (Radix, next-themes, cva, clsx, tailwind-merge, Vitest) | 1 |
| Referências `docs/design/` | 2 |
| Kit de componentes | 3, 4, 5 |
| Galeria `/dev/ui` fora de produção | 6 |
| Barra lateral, barra inferior, Mais, aviso do teste, `main#main-content` | 7 |
| Mapa de navegação e abas de Ajustes, definição única | 7 |
| `?novo=1` abre o novo agendamento | 9 |
| Hoje, Agenda, Clientes, Caixa, WhatsApp | 8, 9, 10, 11, 12 |
| Ajustes › Negócio com divisão do `SettingsModule` | 13 |
| Serviços e equipe; Plano em contêiner escuro sem mexer no componente | 14 |
| Login, cadastro, demais telas de autenticação | 15, 16 |
| Pagamento e peças comuns | 17 |
| Cores dos gráficos pelos tokens | 8, 11 |
| Testes no frontend e no CI | 1 (e em cada tarefa) |
| Regra de cores por busca (teste de conformidade) | 1, 3–18 |
| Regra de comportamento | checagem padrão em 8–17 |
| Remoção do `Navbar`, `ThemeToggle`, componentes antigos | 18 |
| Verificação visual (galeria, páginas públicas, telas com o dono) | 19 |
