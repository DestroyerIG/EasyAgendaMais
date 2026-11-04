# Depoimentos reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os donos de negócio dão nota e depoimento pelo painel. O SuperAdmin aprova, e a landing mostra os aprovados.

**Architecture:** Um módulo novo no backend, `backend/src/modules/depoimentos/`, com regras puras, repositório SQL e três roteadores: o do dono, o do admin e o público. No frontend entram um modal no dashboard (com atalho no menu da conta), uma página no SuperAdmin e a landing lendo os publicados no servidor, com revalidação.

**Tech Stack:** Express + Prisma (`$queryRaw`) + Postgres, Zod, Vitest; Next.js (App Router), Tailwind com tokens, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-depoimentos-reais-design.md`. Esta branch parte de `feat/esconde-depoimentos-ficticios` (PR #33): antes de abrir o PR, faça rebase na `main` depois que o #33 for juntado.

## Global Constraints

- Migração no banco de produção só com autorização explícita do dono. Use o pooler de sessão: `DIRECT_URL` = `DATABASE_URL` trocando `:6543` por `:5432`, sem query string. Rode `migrate status` antes e depois.
- Textos de interface em pt-BR, no tom do sistema. Use exatamente os textos que a spec fixa.
- Sem cores fixas no frontend: o teste `src/__tests__/themeCompliance.test.ts` precisa continuar passando.
- Nenhum número que volte do Postgres pode chegar ao `res.json` como `BigInt`: converta com `Number()` no mapeamento. Esse bug causou o 500 do PR #30.
- A rota pública devolve só: `texto`, `nota`, `nomeExibido`, `negocio`, `cidade`, `logoUrl`. Nada de id, e-mail, plano ou texto original.
- Constantes (em `depoimentos.rules.ts`): `DIAS_MINIMOS = 14`, `ATENDIMENTOS_MINIMOS = 10`, `ADIAR_DIAS = 30`, `NOTA_MINIMA_PUBLICAVEL = 4`, `TEXTO_MIN = 20`, `TEXTO_MAX = 400`, `FEEDBACK_MAX = 1000`, `MAX_NA_LANDING = 6`. O mínimo de 3 para a seção aparecer já existe como `MIN_DEPOIMENTOS_NA_LANDING` em `frontend/src/app/page.tsx`.
- "Assinatura paga e em dia" = `businesses.subscription_status = 'active'` e `businesses.active = true`.
- Atendimento concluído = `appointments.status = 'concluido'`.
- Status de um depoimento: `pendente` | `publicado` | `recusado` | `interno` | `retirado` | `substituido`.

## Review Focus

1. Dono com depoimento publicado envia uma nota 2: o publicado precisa sair do ar na hora (vira `substituido`). Teste na Task 3.
2. Negócio publicado cancela a assinatura ou é desativado: some da rota pública sem nenhuma ação do admin. Teste na Task 5.
3. Profissional da equipe (`role` diferente de `tenant_admin`) nunca vê o pop-up nem consegue enviar. Teste na Task 3.
4. Texto com espaços nas pontas, só espaços ou acima do limite: validar depois do `trim`. Teste na Task 3.
5. O admin corrige o texto de um item já publicado ou interno: só pendente e publicado podem ser corrigidos, e o original fica guardado na primeira correção. Teste na Task 4.

---

### Task 1: Migração e modelo Prisma

**Files:**
- Create: `backend/prisma/migrations/20261105120000_depoimentos/migration.sql`
- Modify: `backend/prisma/schema.prisma` (modelos `Depoimento`, `DepoimentoPedido` e as relações em `Business`)

**Interfaces:**
- Produces: as tabelas `depoimentos` e `depoimento_pedidos`, com as colunas abaixo (as tasks seguintes usam esses nomes no SQL).

- [ ] **Step 1: Escrever a migração**

`depoimentos`:
- `id uuid pk default gen_random_uuid()`;
- `business_id uuid null references businesses(id) on delete set null`;
- `negocio_nome varchar(255) not null` e `logo_url text null` (cópia, para o registro sobreviver à exclusão do negócio);
- `nota smallint not null check (nota between 1 and 5)`;
- `texto text not null`, `texto_original text null`;
- `nome_exibido varchar(60) null`, `cidade varchar(80) null`;
- `autorizou boolean not null default false`, `autorizado_em timestamptz null`;
- `status varchar(20) not null`;
- `criado_em timestamptz not null default now()`, `publicado_em timestamptz null`, `publicado_por uuid null`, `atualizado_em timestamptz not null default now()`.

Índices: `(business_id, criado_em desc)` e `(status, publicado_em desc)`.

`depoimento_pedidos`:
- `business_id uuid pk references businesses(id) on delete cascade`;
- `adiado_ate timestamptz null`, `dispensado_em timestamptz null`.

- [ ] **Step 2: Espelhar no `schema.prisma`** os dois modelos, com `@@map`/`@map`. Em `Business`, `onDelete: SetNull` para `Depoimento` e `Cascade` para `DepoimentoPedido`.

- [ ] **Step 3: Validar sem tocar em produção**

Run: `cd backend && npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: sem erros. **Não** rodar `migrate deploy`: a aplicação em produção é a Task 9.

- [ ] **Step 4: Commit** `feat(depoimentos): tabelas depoimentos e depoimento_pedidos`

---

### Task 2: Regras puras

**Files:**
- Create: `backend/src/modules/depoimentos/depoimentos.rules.ts`
- Test: `backend/src/__tests__/depoimentosRules.test.ts`

**Interfaces:**
- Produces:
  - `podeMostrarPopup(e: { role: string; subscriptionStatus: string; negocioCriadoEm: Date; concluidos: number; pedido: { adiadoAte: Date | null; dispensadoEm: Date | null } | null; temEnvio: boolean; agora: Date }): boolean`
  - `classificarEnvio(e: { nota: number; autorizou: boolean }): 'pendente' | 'interno'`
  - `nomeSugerido(ownerName: string): string`
  - as constantes de Global Constraints.

- [ ] **Step 1: Testes que falham**
  - `podeMostrarPopup` é `true` com: `tenant_admin`, `active`, criado há 14 dias, 10 concluídos, sem pedido e sem envio.
  - Fica `false` (um caso por linha) com: `role: 'professional'`; `trialing`; `past_due`; 13 dias; 9 concluídos; `adiadoAte` no futuro; `dispensadoEm` preenchido; `temEnvio: true`.
  - Volta a ser `true` quando `adiadoAte` já passou.
  - `classificarEnvio({nota:5, autorizou:true})` é `'pendente'`; `{nota:4, autorizou:false}` é `'interno'`; `{nota:3, autorizou:true}` é `'interno'`.
  - `nomeSugerido('Diego Martins Souza')` é `'Diego M.'`; `nomeSugerido('Ana')` é `'Ana'`; `nomeSugerido('  maria   da silva ')` é `'Maria S.'` (ignora "da", "de", "do", "dos", "das"; primeira letra maiúscula).

- [ ] **Step 2:** Run `cd backend && npx vitest run src/__tests__/depoimentosRules.test.ts`. Expected: FAIL (o módulo não existe).
- [ ] **Step 3:** Implementar as três funções e as constantes.
- [ ] **Step 4:** Rodar de novo. Expected: PASS.
- [ ] **Step 5: Commit** `feat(depoimentos): regras do pop-up e da classificação`

---

### Task 3: Rotas do dono

**Files:**
- Create: `backend/src/modules/depoimentos/depoimentos.repository.ts`, `depoimentos.service.ts`, `depoimentos.routes.ts`, `depoimentos.types.ts`
- Modify: `backend/src/server.ts` (montar em `${API_V1}/depoimentos`, ao lado de `avaliacoes`)
- Test: `backend/src/__tests__/depoimentosService.test.ts` (mock de `../config/prisma.js` com `$queryRaw`/`$executeRaw`, como em `adminPainelRepository.test.ts`)

**Interfaces:**
- Consumes: Task 2.
- Produces (todas com `authMiddleware` + `requireRole(['tenant_admin'])`):
  - `GET /depoimentos/meu` devolve `{ mostrarPopup: boolean; nomeSugerido: string; atual: { status: 'em_analise' | 'publicado' | 'nao_publicado'; nota: number; texto: string; nomeExibido: string | null; cidade: string | null } | null }`. Mapeamento: `pendente` vira `em_analise`; `publicado` fica `publicado`; `recusado`, `interno` e `retirado` viram `nao_publicado`.
  - `POST /depoimentos` com corpo `{ nota: 1..5; texto: string; nomeExibido?: string; cidade?: string; autorizou: boolean }` devolve o mesmo `atual`.
  - `POST /depoimentos/adiar`: grava `adiado_ate = agora + ADIAR_DIAS`.
  - `POST /depoimentos/dispensar`: grava `dispensado_em = agora`.
  - `POST /depoimentos/retirar`: o atual `publicado` ou `pendente` vira `retirado`.
  - O service usa `depoimentosService.enviar(user, body)` e devolve o estado com `depoimentosService.estado(user)`.

- [ ] **Step 1: Testes que falham** (no service, com repositório mockado ou prisma mockado)
  - Envio com nota 5 e autorização cria uma linha `pendente` com `autorizado_em`, `negocio_nome` e `logo_url` copiados do negócio.
  - Envio com nota 2 cria uma linha `interno`.
  - **Review Focus 1:** com um `publicado` existente, um envio de nota 2 marca o anterior como `substituido` e o novo como `interno`.
  - **Review Focus 4:** um texto com 19 caracteres depois do `trim` é recusado com 400. Com nota ≥ 4, o limite é `TEXTO_MAX` (400); com nota ≤ 3, é `FEEDBACK_MAX` (1000).
  - Com nota ≥ 4 e `autorizou: true`, `nomeExibido` e `cidade` são obrigatórios (400 se faltarem).
  - **Review Focus 3:** `role: 'professional'` recebe 403. Teste de rota com supertest, se o projeto já usa; senão, confira `requireRole` no arquivo de rotas.
  - `estado` devolve `mostrarPopup: false` quando já existe envio.
- [ ] **Step 2:** Run `npx vitest run src/__tests__/depoimentosService.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar**
  - Validação com Zod em `depoimentos.types.ts`.
  - Contagem de concluídos com `SELECT count(*)::int FROM appointments WHERE business_id = $1 AND status = 'concluido'`.
  - O "atual" é a linha mais recente do negócio com status diferente de `substituido`.
  - Envio numa transação: marca as linhas anteriores do negócio (exceto `substituido`) como `substituido` e insere a nova.
- [ ] **Step 4:** Rodar os testes e `npx tsc --noEmit`. Expected: PASS, sem erros.
- [ ] **Step 5: Commit** `feat(depoimentos): envio, adiar, dispensar e retirar pelo dono`

---

### Task 4: Rotas do SuperAdmin

**Files:**
- Create: `backend/src/modules/depoimentos/depoimentos.admin.routes.ts`
- Modify: `backend/src/server.ts` (montar em `${API_V1}/admin/depoimentos` com `authMiddleware, requireAdmin`, de `../middleware/rbac.js`), `depoimentos.service.ts`, `depoimentos.repository.ts`
- Test: `backend/src/__tests__/depoimentosAdmin.test.ts`

**Interfaces:**
- Produces:
  - `GET /admin/depoimentos?aba=pendentes|publicados|recusados|internos` devolve `Array<{ id; negocio; negocioId: string | null; plano: string | null; nomeExibido; cidade; nota; texto; textoOriginal: string | null; autorizadoEm: string | null; criadoEm: string; status }>` e `meta: { publicados: number }`. A aba `internos` lista `interno` e `retirado`.
  - `POST /admin/depoimentos/:id/publicar`: só de `pendente`. Grava `publicado_em` e `publicado_por`.
  - `POST /admin/depoimentos/:id/recusar`: só de `pendente`.
  - `POST /admin/depoimentos/:id/corrigir`, com corpo `{ texto: string }`: só em `pendente` ou `publicado`. Na primeira correção, guarda o texto anterior em `texto_original`. Aplica `TEXTO_MIN`/`TEXTO_MAX`.
  - Toda ação chama `auditLogService.logAdminAction` com `actionType` `DEPOIMENTO_PUBLICADO`, `DEPOIMENTO_RECUSADO` ou `DEPOIMENTO_CORRIGIDO`, `resourceType: 'depoimento'` e `resourceId: id`.

- [ ] **Step 1: Testes que falham**
  - Publicar um `pendente` muda o status e chama a auditoria.
  - Publicar um `interno` ou um `substituido` devolve 409.
  - **Review Focus 5:** corrigir um `interno` devolve 409. Corrigir duas vezes um `pendente` mantém em `texto_original` o texto da primeira versão.
  - `meta.publicados` conta só `publicado`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implementar. Use `ConflictError` de `utils/errors.js` para transição inválida e `NotFoundError` para id inexistente.
- [ ] **Step 4:** Rodar os testes e o `tsc`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(depoimentos): fila de aprovação no SuperAdmin`

---

### Task 5: Rota pública

**Files:**
- Modify: `depoimentos.routes.ts` (`GET /depoimentos/publicos`, sem autenticação, declarada **antes** das rotas do dono), `depoimentos.service.ts`, `depoimentos.repository.ts`
- Test: `backend/src/__tests__/depoimentosPublicos.test.ts`

**Interfaces:**
- Produces: `GET /depoimentos/publicos` devolve `Array<{ texto: string; nota: number; nomeExibido: string; negocio: string; cidade: string; logoUrl: string | null }>`, no máximo `MAX_NA_LANDING`, ordenado por `publicado_em desc`.

- [ ] **Step 1: Testes que falham**
  - O SQL filtra `status = 'publicado'`, `b.active = true` e `b.subscription_status = 'active'` (faz `JOIN` com `businesses`, então negócio excluído também fica de fora). **Review Focus 2.**
  - O objeto devolvido tem exatamente as seis chaves.
  - `nota` vinda como `5n` sai como `5`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implementar com `LIMIT ${MAX_NA_LANDING}::int`.
- [ ] **Step 4:** Rodar a suíte completa do backend: `npx vitest run`. Expected: tudo PASS.
- [ ] **Step 5: Commit** `feat(depoimentos): rota pública dos publicados`

---

### Task 6: Pop-up e menu do dono (frontend)

**Files:**
- Create: `frontend/src/lib/depoimentos.ts`, `frontend/src/app/api/depoimentos/[...path]/route.ts` (`catchAllProxy('depoimentos')`), `frontend/src/components/depoimentos/AvaliarSistemaModal.tsx`, `frontend/src/components/depoimentos/PedidoDepoimento.tsx`
- Modify: `frontend/src/app/dashboard/page.tsx` (renderiza `<PedidoDepoimento />`), `frontend/src/components/shell/AccountMenu.tsx` (item "Avaliar o EasyAgenda+", só para `tenant_admin`)
- Test: `frontend/src/components/depoimentos/__tests__/AvaliarSistemaModal.test.tsx`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `depoimentosApi` com `meu()`, `enviar(body)`, `adiar()`, `dispensar()`, `retirar()`, tipados como na Task 3.
  - `<AvaliarSistemaModal open onClose origem: 'popup' | 'menu' />`.
  - `<PedidoDepoimento />` chama `meu()` uma vez por sessão (guarda em `sessionStorage` dentro de try/catch) e abre o modal com `origem: 'popup'` quando `mostrarPopup` é `true` e não há outro diálogo aberto (`document.querySelector('[role="dialog"]')` nulo). Se houver outro diálogo, não abre nesta sessão.

Textos exatos (spec):
- Passo 1: "Como está sendo o EasyAgenda+ pra você?" com 5 estrelas. Os links "Agora não" (chama `adiar`) e "Não perguntar mais" (chama `dispensar`) aparecem só com `origem: 'popup'`.
- Nota 4 ou 5: título "Que bom! Conta pra outros profissionais?". Campos: o depoimento, "Nome exibido" (preenchido com `nomeSugerido`) e "Cidade". Autorização: "Autorizo exibir este depoimento, com meu nome, o nome do meu negócio e a cidade, no site do EasyAgenda+." Botão "Enviar". Aviso: "Sem marcar a autorização, vai só como avaliação interna."
- Nota 1 a 3: título "Obrigado pela sinceridade. O que podemos melhorar?". Botão "Enviar para a equipe". Aviso: "Vai direto para os responsáveis pelo sistema. Não aparece no site."
- Pelo menu, com `atual` preenchido, mostra a situação: "Em análise", "Publicado no site" ou "Não publicado". Se o atual for `publicado` ou `em_analise`, mostra o botão "Retirar meu depoimento do site". Também mostra "Enviar outra avaliação", que leva ao passo 1.

- [ ] **Step 1: Testes que falham**
  - Clicar em 5 estrelas mostra o campo de autorização.
  - Clicar em 2 estrelas mostra "Vai direto para os responsáveis pelo sistema. Não aparece no site." e não mostra a autorização.
  - "Agora não" chama `adiar` e fecha.
  - Com `origem: 'menu'`, os links de adiar e dispensar não aparecem.
  - Enviar nota 5 sem marcar a autorização chama `enviar` com `autorizou: false`.
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/components/depoimentos`. Expected: FAIL.
- [ ] **Step 3:** Implementar com `Modal`, `Field`, `Input`, `Textarea` e `Button` de `@/components/ui` e as cores dos tokens.
- [ ] **Step 4:** Rodar os testes, `npx tsc --noEmit` e `npx vitest run src/__tests__/themeCompliance.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(depoimentos): pop-up e avaliação pelo menu da conta`

---

### Task 7: Página do SuperAdmin (frontend)

**Files:**
- Create: `frontend/src/app/admin/depoimentos/page.tsx`, `frontend/src/app/api/admin/depoimentos/[...path]/route.ts` (`catchAllProxy('admin/depoimentos')`)
- Modify: `frontend/src/lib/adminApi.ts` (`listarDepoimentos(aba)`, `publicarDepoimento(id)`, `recusarDepoimento(id)`, `corrigirDepoimento(id, texto)`), `frontend/src/components/admin/AdminSidebar.tsx` (`ADMIN_LINKS`: `{ href: '/admin/depoimentos', label: 'Depoimentos', icon: 'reviews' }`)
- Test: `frontend/src/app/admin/depoimentos/__tests__/Depoimentos.test.tsx`

**Interfaces:**
- Consumes: Task 4.

- [ ] **Step 1: Testes que falham**
  - Abas "Pendentes", "Publicados", "Recusados" e "Avaliações internas".
  - Com `meta.publicados = 1`, a aba Publicados mostra "1 de 3 para a seção aparecer". Com 3 ou mais, não mostra.
  - Num pendente, "Publicar" chama `publicarDepoimento(id)` e recarrega a lista.
  - Na aba de avaliações internas não aparece nenhum botão de ação.
  - Num item corrigido, o texto original aparece para conferência.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implementar. Cada item mostra negócio, nome exibido, cidade, plano, estrelas, texto e "Autorizou exibir no site em DD/MM/AAAA". "Corrigir texto" abre um `Textarea` no próprio card.
- [ ] **Step 4:** Rodar os testes e o `tsc`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(depoimentos): tela de aprovação no SuperAdmin`

---

### Task 8: Landing com os depoimentos publicados

**Files:**
- Create: `frontend/src/lib/server/depoimentosPublicos.ts`
- Modify: `frontend/src/lib/server/proxy.ts` (exportar `BACKEND_URL`), `frontend/src/app/page.tsx` (vira `async`; troca `const testimonials: Testimonial[] = []` por `await buscarDepoimentosPublicos()`; avatar com `logoUrl`)
- Test: `frontend/src/lib/server/__tests__/depoimentosPublicos.test.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces: `buscarDepoimentosPublicos(): Promise<Testimonial[]>`. Ela chama `fetch(\`${BACKEND_URL}/depoimentos/publicos\`, { next: { revalidate: 300 } })` e mapeia `texto` para `quote`, `nomeExibido` para `name`, `negocio` para `business`, além de `cidade`, `nota` e `logoUrl`. Em qualquer erro ou resposta diferente de 200, devolve `[]`: a landing nunca quebra por causa disso. O tipo `Testimonial` ganha `logoUrl: string | null`.

- [ ] **Step 1: Testes que falham**
  - Com `fetch` mockado devolvendo 2 itens, o mapeamento sai certo.
  - Com `fetch` rejeitando, devolve `[]`.
  - Com status 500, devolve `[]`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implementar**
  - Avatar: `<Image>` com `logoUrl` quando houver (o `next.config` precisa aceitar o domínio onde as logos ficam; confira `images.remotePatterns`). Sem logo, a inicial, como hoje.
  - Defina `export const revalidate = 300` na página.
- [ ] **Step 4: Verificar**
  - `npx tsc --noEmit`, `npx next lint` e a suíte do frontend.
  - Conferir no `next dev`: sem backend, a seção não aparece. Com um mock em `:5000` devolvendo 3 itens, a seção aparece com o título "Quem usa todos os dias recomenda".
- [ ] **Step 5: Commit** `feat(depoimentos): landing mostra os depoimentos publicados`

---

### Task 9: PR e migração em produção

- [ ] **Step 1:** Rebase na `main` (depois do merge do #33), rodar as suítes completas do backend e do frontend e abrir o PR `feat(depoimentos): depoimentos reais com aprovação no SuperAdmin`. No corpo, dizer que ele tem a migração `20261105120000_depoimentos`.
- [ ] **Step 2: Pedir autorização explícita ao dono** para aplicar a migração em produção. Sem um "sim" no chat, pare aqui.
- [ ] **Step 3: Com autorização, aplicar a migração**
  - Run: `cd backend && npx prisma migrate status`, depois `npx prisma migrate deploy`, depois `npx prisma migrate status`, usando o pooler de sessão como em Global Constraints.
  - Expected: `20261105120000_depoimentos` aplicada e "Database schema is up to date".
- [ ] **Step 4: Conferência em produção** depois do deploy, que é feito pelo dono:
  - `GET https://www.easybarber.tech/api/depoimentos/publicos` responde 200 com `[]`;
  - o item "Depoimentos" aparece no SuperAdmin.
