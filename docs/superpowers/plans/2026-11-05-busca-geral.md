# Busca geral do painel: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a barra de pesquisa do painel passa a funcionar em todas as telas, no computador e no celular, achando clientes, agendamentos e telas.

**Architecture:** uma rota leve `POST /api/v1/busca` devolve clientes e agendamentos do negócio. No frontend, o hook `useBuscaGeral` cuida do termo, da espera, do teclado e do destino; `BuscaResultados` desenha a lista, usada por `BuscaGeral` (computador) e `BuscaCelular` (tela cheia). As telas são filtradas no navegador.

**Tech Stack:** Express, Prisma, zod e Vitest no backend. Next.js 15, React, Radix Dialog e Vitest no frontend.

**Spec:** `docs/superpowers/specs/2026-11-05-busca-geral-design.md`

## Global Constraints

- Branch `feat/busca-geral`, a partir da `main`. Código vai por PR; o dono junta.
- Sem migração e sem dependência nova.
- O `backend/.env` aponta para produção: nenhum teste ou conferência local usa esse banco.
- Mínimo para buscar: 2 caracteres, ou 3 quando o termo só tem dígitos e sinais de telefone. Máximo: 80 caracteres.
- Até 5 clientes, 5 agendamentos e 4 telas. Espera de 250 ms depois da última tecla.
- Clientes inativas e agendamentos com status `cancelado` ficam de fora. O `businessId` vem sempre de `req.user`.
- Textos em português, com o vocabulário do segmento (`useVocabulario`). Frase normal, com maiúscula só na primeira palavra.
- Depois do pull, o backend pode precisar de `npm install` e `npx prisma generate`. No `next dev`, usar porta diferente da 3000.

## Review Focus

1. Telefone digitado com máscara, como `(83) 9999`: acha a cliente (teste na Task 1).
2. Apagar o texto para abaixo do mínimo com um pedido em andamento: a lista some e a resposta atrasada é ignorada (Task 2).
3. Enter com a lista vazia ou ainda buscando, e texto colado com mais de 80 caracteres: nada quebra (Tasks 2 e 3).
4. Escolher um agendamento já estando na Agenda, em outro dia: troca de dia sem recarregar a tela (Task 5).
5. Link com `data` inválida ou `agendamento` que não é um id: abre a agenda normalmente, sem erro, e limpa a URL (Task 5).

---

### Task 1: Rota de busca no backend

**Files:**
- Create: `backend/src/utils/textoBusca.ts`
- Create: `backend/src/modules/busca/busca.types.ts`, `busca.repository.ts`, `busca.service.ts`, `busca.controller.ts`, `busca.routes.ts`
- Modify: `backend/src/modules/crm/crm.service.ts:14-15`, `backend/src/server.ts` (junto das rotas de `/clients`, perto da linha 471), `backend/src/modules/conta/carencia.rules.ts`
- Test: `backend/src/__tests__/buscaService.test.ts`, `buscaRepository.test.ts`, `buscaRoutes.test.ts`, `carenciaMiddleware.test.ts`

**Interfaces:**
- Produces, em `busca.types.ts`:
  - `BuscaQuerySchema = z.object({ q: z.string().trim().min(2).max(80) })`
  - `ClienteBusca = { id: string; nome: string; telefone: string }`
  - `AgendamentoBusca = { id: string; data: string /* AAAA-MM-DD */; hora: string /* HH:MM */; status: string; clienteNome: string; servicoNome: string; profissionalNome: string }`
  - `ResultadoBusca = { clientes: ClienteBusca[]; agendamentos: AgendamentoBusca[] }`
- Produces: `semAcento(s: string): string` e `digitos(s: string): string` em `utils/textoBusca.ts`.
- Produces: `POST /api/v1/busca`, com corpo `{ q }`, responde `sendSuccess(res, ResultadoBusca)` com status 200.

- [ ] **Step 1: Criar a branch**

```bash
git checkout -b feat/busca-geral docs/spec-busca-geral
```

- [ ] **Step 2: Escrever os testes do service** em `buscaService.test.ts`, com o repositório mockado como em `crmService.test.ts` (`vi.hoisted` e `getBusinessScheduleSettings` mockado com `timezone: 'America/Fortaleza'`).

```ts
// repo = { clientesAtivos, agendamentosFuturos, agendamentosPassados }
it('acha por nome sem acento e sem diferenciar maiúscula')  // 'jose' acha 'José Lima'
it('acha por parte do telefone')                            // '9999' acha phone '83999990000'
it('acha telefone digitado com máscara')                    // '(83) 9999' acha phone '83999990000'
it('acha por e-mail e aceita cliente sem e-mail')           // email null não quebra
it('não usa telefone com menos de 3 dígitos')               // '99' não acha só pelo telefone
it('quem começa com o termo vem antes, depois alfabética')  // 'ana': ['Ana Lima','Ana Souza','Mariana']
it('corta em 5 clientes')
it('devolve futuros antes dos passados e corta em 5')       // 3 futuros + 4 passados => 3 + 2
it('consulta agendamentos com no máximo 50 clientes')       // 60 casam => ids.length === 50
it('sem cliente encontrada não consulta agendamentos')
it('termo só com símbolos devolve vazio')                   // '()' => { clientes: [], agendamentos: [] }
```

- [ ] **Step 3: Escrever os testes do repositório** em `buscaRepository.test.ts`, com `../config/prisma.js` mockado.

```ts
it('clientesAtivos filtra por negócio e por active')
// where: { businessId: 'b1', active: true }; select só id, name, phone, email
it('agendamentosFuturos filtra negócio, clientes e cancelados, do mais próximo ao mais distante')
// where: { businessId: 'b1', clientId: { in: ['c1'] }, status: { not: 'cancelado' },
//          date: { gte: new Date('2026-11-05T00:00:00.000Z') } }
// orderBy: [{ date: 'asc' }, { time: 'asc' }], take: 5
it('agendamentosPassados usa date lt e ordem decrescente')
it('converte date e time para texto')
// date 2026-11-06T00:00:00Z => '2026-11-06'; time 1970-01-01T14:30:00Z => '14:30'
```

- [ ] **Step 4: Escrever os testes da rota** em `buscaRoutes.test.ts`, com o molde de `reportsRoutes.test.ts`. O mock de `authMiddleware` responde 401 quando o pedido traz o cabeçalho `x-anon`.

```ts
it('devolve o resultado do service e usa o businessId do login')  // service chamado com ('b1', 'ana')
it('responde com Cache-Control: no-store')
it('tira os espaços do termo')                                    // q='  ana  ' => 'ana'
it('responde 200, não 201')
it('400 com termo curto')                                         // q='a'
it('400 sem q no corpo')
it('400 com termo acima de 80 caracteres')
it('401 sem login')
it('403 para o papel professional')
```

Em `carenciaMiddleware.test.ts`, inclua `['POST', '/api/v1/busca']` na tabela do que fica liberado (linha 103) e `['DELETE', '/api/v1/busca']` na do que fica bloqueado (linha 122).

- [ ] **Step 5: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/__tests__/busca`
Expected: FAIL, os módulos ainda não existem.

- [ ] **Step 6: Implementar**

- `utils/textoBusca.ts`: mover `semAcento` e `digitos` de `crm.service.ts` sem mudar o corpo, e importar de lá no CRM.
- `busca.repository.ts`: `buscaRepository.clientesAtivos(businessId)`, `agendamentosFuturos(businessId, clienteIds, hoje)` e `agendamentosPassados(businessId, clienteIds, hoje)`, com `prisma.client.findMany` e `prisma.appointment.findMany`. `hoje` é `AAAA-MM-DD`, passado ao Prisma como `new Date(`${hoje}T00:00:00.000Z`)`. Os dois de agendamento usam `take: 5` e selecionam os nomes de `client`, `service` e `professional`.
- `busca.service.ts`: `buscaService.buscar(businessId: string, q: string): Promise<ResultadoBusca>`. Casa nome e e-mail com `semAcento`, telefone só com `digitos(q).length >= 3`. Ordena, corta os ids em 50 e os clientes em 5. `hoje` vem de `todayInTimezone(timezone)`, com `timezone` de `getBusinessScheduleSettings`, como em `crm.service.ts:36`.
- `busca.routes.ts`: `router.post('/', authMiddleware, requireTenantRoles, requireFeature('clients'), validate({ body: BuscaQuerySchema }), buscar)`.
- `busca.controller.ts`: `res.set('Cache-Control', 'no-store')`, depois `BuscaQuerySchema.parse(req.body).q` e `sendSuccess`.
- `server.ts`: `app.use(`${API_V1}/busca`, buscaRoutes);`
- `carencia.rules.ts`: `regra(['POST'], '/busca')` em `ESCRITAS_NA_CARENCIA`, com um comentário de que a rota só lê: é `POST` para o termo não ir na URL.

`GET /appointments` não restringe o papel `employee` (`appointments.controller.ts:13`), então a busca também não. Não acrescente log do termo nesta rota.

- [ ] **Step 7: Rodar e ver passar**

Run: `cd backend && npx tsc --noEmit && npx vitest run src/__tests__/busca src/__tests__/crmService.test.ts`
Expected: `tsc` sem erro e todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "feat(busca): rota de busca de clientes e agendamentos"
```

---

### Task 2: Dados da busca no frontend

**Files:**
- Create: `frontend/src/lib/busca.ts`, `frontend/src/lib/buscaTelas.ts`, `frontend/src/hooks/useBuscaGeral.ts`, `frontend/src/app/api/busca/[[...path]]/route.ts`
- Test: `frontend/src/lib/__tests__/busca.test.ts`, `buscaTelas.test.ts`, `frontend/src/hooks/__tests__/useBuscaGeral.test.tsx`

**Interfaces:**
- Consumes: `POST /busca` da Task 1.
- Produces, em `lib/busca.ts`:
  - tipos `ClienteBusca`, `AgendamentoBusca`, `ResultadoBusca` iguais aos da Task 1
  - `TERMO_MAX = 80`
  - `podeBuscar(termo: string): boolean`
  - `rotuloQuando(data: string, hora: string, hoje: string): string`
  - `buscaApi.buscar(q: string, signal?: AbortSignal): Promise<ResultadoBusca>`
  - `ItemBusca = { chave: string; grupo: 'clientes' | 'agendamentos' | 'telas'; titulo: string; detalhe?: string; icone?: string; href: string }`
  - `montarItens(r: ResultadoBusca, telas: ItemBusca[], hoje: string): ItemBusca[]`, na ordem clientes, agendamentos, telas
- Produces, em `lib/buscaTelas.ts`: `filtrarTelas(termo: string, rotuloClientes: string): ItemBusca[]`
- Produces, em `hooks/useBuscaGeral.ts`:

```ts
type StatusBusca = 'ocioso' | 'buscando' | 'pronto' | 'erro' | 'bloqueada';
function useBuscaGeral(opcoes?: { aoEscolher?: () => void }): {
  termo: string; setTermo(v: string): void; itens: ItemBusca[]; status: StatusBusca;
  aberta: boolean; setAberta(v: boolean): void; ativo: number; setAtivo(i: number): void;
  aoTeclar(e: KeyboardEvent<HTMLInputElement>): void; escolher(item: ItemBusca): void;
};
```

- [ ] **Step 1: Escrever os testes de `lib/`**

```ts
// busca.test.ts
podeBuscar('a') === false; podeBuscar('an') === true; podeBuscar('  a  ') === false;
podeBuscar('83') === false; podeBuscar('839') === true; podeBuscar('(83') === false;
rotuloQuando('2026-11-05', '14:30', '2026-11-05') === 'Hoje, 14:30';
rotuloQuando('2026-11-06', '14:30', '2026-11-05') === 'Amanhã, 14:30';
rotuloQuando('2026-10-12', '09:00', '2026-11-05') === '12/10, 09:00';
rotuloQuando('2025-10-12', '09:00', '2026-11-05') === '12/10/2025, 09:00';
// montarItens: cliente => href '/clientes/c1', detalhe com formatPhone
// agendamento => href '/agendamentos?data=2026-11-06&agendamento=a1',
//                titulo 'Carla Souza · Corte', detalhe 'Amanhã, 14:30 · João'

// buscaTelas.test.ts
filtrarTelas('caixa', 'Clientes')[0].href === '/financeiro';
filtrarTelas('financeiro', 'Clientes')[0].titulo === 'Caixa';          // sinônimo
filtrarTelas('configuracoes', 'Clientes')[0].titulo === 'Ajustes';     // sem acento
filtrarTelas('novo', 'Clientes')[0].href === '/agendamentos?novo=1';
filtrarTelas('a', 'Clientes').length <= 4;
filtrarTelas('clientes', 'Clientas')[0].titulo === 'Clientas';         // vocabulário
```

- [ ] **Step 2: Escrever os testes do hook**, com `renderHook`, timers falsos e `next/navigation` e `@/lib/busca` (`buscaApi`) mockados.

```ts
it('não busca abaixo do mínimo')
it('faz um pedido só para vários toques seguidos, 250 ms depois do último')
it('mostra as telas na hora, antes da resposta do servidor')
it('resposta antiga não sobrescreve a nova')
it('apagar para abaixo do mínimo cancela o pedido e limpa a lista')   // Review Focus 2
it('corta o termo em 80 caracteres')                                  // Review Focus 3
it('falha vira status erro e mantém as telas')
it('402 vira status bloqueada e mantém as telas')
it('setas andam em volta da lista e o ativo volta a 0 quando o termo muda')
it('Enter abre o item ativo, limpa o termo, fecha e chama aoEscolher') // router.push com o href
it('Enter sem itens não faz nada')                                    // Review Focus 3
it('Esc fecha a lista e mantém o termo')
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/__tests__/busca src/hooks/__tests__/useBuscaGeral`
Expected: FAIL, os módulos ainda não existem.

- [ ] **Step 4: Implementar**

- `podeBuscar`: tira os espaços; se o texto só tem dígitos e `()+-. `, exige 3 dígitos; se não, 2 caracteres.
- `buscaTelas.ts`: monta de `NAV_ITEMS`, `SETTINGS_TABS` e da ação "Novo agendamento" (`NEW_APPOINTMENT_HREF`, ícone `add`), sem repetir `href`: "Negócio" fica de fora porque `/configuracoes` já é Ajustes. Compara sem acento com o rótulo e os sinônimos; quem começa com o termo vem antes; corta em 4.

```ts
const SINONIMOS: Record<string, string[]> = {
  '/clientes': ['clientes'],
  '/financeiro': ['financeiro', 'dinheiro', 'pagamentos'],
  '/configuracoes': ['configurações', 'negócio'],
  '/agendamentos': ['calendário', 'horários'],
  '/relatorios': ['comissões'],
  '/planos': ['assinatura', 'cobrança'],
  '/servicos': ['serviços', 'equipe', 'preços'],
  '/minha-pagina': ['link', 'vitrine'],
};
```

- `useBuscaGeral`: `AbortController` por pedido e contador para descartar respostas antigas, como `pedidoAtual` em `admin/depoimentos/page.tsx`. `hoje` é a data local em `AAAA-MM-DD`. O rótulo de clientes vem de `useVocabulario().cli.P`. Status 402 vira `bloqueada`; qualquer outra falha vira `erro`.
- `app/api/busca/[[...path]]/route.ts`: `export const { POST } = catchAllProxy('busca');`

- [ ] **Step 5: Rodar e ver passar**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/lib/__tests__/busca src/hooks/__tests__/useBuscaGeral`
Expected: `tsc` sem erro e todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(busca): dados, telas e hook da busca geral"
```

---

### Task 3: Barra e lista no computador

**Files:**
- Create: `frontend/src/components/shell/BuscaResultados.tsx`, `frontend/src/components/shell/BuscaGeral.tsx`
- Modify: `frontend/src/components/shell/TopBar.tsx:55-90,108`, `TopBarSearchContext.tsx`, `frontend/src/components/clientes/ListaClientes.tsx:162`
- Test: `frontend/src/components/shell/__tests__/BuscaGeral.test.tsx`, `AppShell.test.tsx:144-149`, `TopBar.test.tsx`, `TopBarSearchContext.test.tsx`

**Interfaces:**
- Consumes: `useBuscaGeral`, `ItemBusca`, `StatusBusca` da Task 2.
- Produces: `BuscaResultados({ idLista, itens, status, termo, ativo, onEscolher, onPassar }: { idLista: string; itens: ItemBusca[]; status: StatusBusca; termo: string; ativo: number; onEscolher(item: ItemBusca): void; onPassar(indice: number): void })`
- Produces: `TopBarSearchConfig` ganha `placeholder?: string`.

- [ ] **Step 1: Escrever os testes**, em `BuscaGeral.test.tsx`, com `useBuscaGeral` real, `buscaApi` e `next/navigation` mockados.

```ts
it('a barra fica ativa com o texto "Buscar cliente, agendamento ou tela..."')
it('mostra os grupos Clientes, Agendamentos e Telas')
it('clicar em um resultado navega para o href')
it('nada encontrado mostra: Nada encontrado para "xyz".')
it('falha mostra as telas e: Não foi possível buscar clientes agora.')
it('bloqueada mostra só as telas, sem mensagem de falha')
it('expõe combobox: aria-expanded, aria-controls e aria-activedescendant')
it('anuncia a quantidade de resultados em aria-live')
it('Ctrl K leva o foco à barra')
it('Ctrl K dentro de outro campo de texto não tira o foco dele')
it('clique fora fecha a lista')
it('com busca registrada, filtra a tela e não abre a lista')
it('com busca registrada, usa o placeholder da tela')
```

Atualize também:
- `AppShell.test.tsx`: troque "a busca da barra superior fica desabilitada fora de Clientes" por um teste de que a barra fica ativa. Mantenha o teste de regressão do "uncontrolled input".
- `TopBar.test.tsx`: acrescente o mock de `next/navigation`, porque a barra passa a usar `useRouter`.
- `TopBarSearchContext.test.tsx`: `placeholder` chega a `useTopBarSearchConfig`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/components/shell`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

- `BuscaResultados`: `role="listbox"`, grupos com título e opções com `role="option"` e `id` `${idLista}-${indice}`. Título do grupo de clientes: `cli.P`. "Buscando..." aparece abaixo das telas enquanto `status === 'buscando'`. Mensagem de falha: `Não foi possível buscar ${cli.p} agora.`. Região `aria-live="polite"` com "N resultados". Use `onMouseDown` com `preventDefault` nas opções, para o campo não perder o foco antes do clique.
- `BuscaGeral`: mantém **um único `<input>`, sempre controlado**, com `maxLength={80}`. Sem busca registrada, usa `useBuscaGeral`, com `role="combobox"` e a lista em um painel absoluto abaixo do campo. Com busca registrada (`useTopBarSearchConfig`), `value` e `onChange` vêm da config e a lista não abre. A dica `Ctrl K` fica à direita do campo, ou `⌘ K` no Mac (`navigator.platform`).
- `Ctrl K` / `Cmd K`: um `keydown` em `document`, com `preventDefault` só quando o campo está visível (`getClientRects().length > 0`). Ignora se o foco está em `input`, `textarea`, `select` ou `contenteditable` que não seja a própria barra.
- `TopBar.tsx`: troca `TopBarSearch` por `BuscaGeral` e apaga `SEARCH_PLACEHOLDER`, `DEFAULT_SEARCH_PLACEHOLDER` e a dica "chega junto com essa área".
- `TopBarSearchContext.tsx`: inclui `placeholder` na config e nas dependências do efeito de `useRegisterTopBarSearch`.
- `ListaClientes.tsx`: passa `placeholder: `Filtrar ${cli.p} por nome ou telefone...``.

O texto padrão usa o vocabulário: `Buscar ${cli.s}, agendamento ou tela...`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/components/shell src/components/clientes`
Expected: `tsc` sem erro e todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(busca): barra e lista de resultados no computador"
```

---

### Task 4: Busca no celular

**Files:**
- Create: `frontend/src/components/shell/BuscaCelular.tsx`
- Modify: `frontend/src/components/shell/TopBar.tsx:152` (cabeçalho do celular, antes do sino)
- Test: `frontend/src/components/shell/__tests__/BuscaCelular.test.tsx`

**Interfaces:**
- Consumes: `useBuscaGeral` (Task 2) e `BuscaResultados` (Task 3).
- Produces: `BuscaCelular()`, sem props.

- [ ] **Step 1: Escrever os testes**

```ts
it('a lupa tem o nome acessível "Buscar" e abre a busca em tela cheia')
it('o campo recebe o foco ao abrir')
it('mostra os mesmos grupos de resultados')
it('escolher um resultado navega e fecha a busca')
it('o botão Fechar fecha e limpa o termo')
it('em Clientes, com busca registrada, a lupa abre a busca geral')
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/components/shell/__tests__/BuscaCelular.test.tsx`
Expected: FAIL, o componente ainda não existe.

- [ ] **Step 3: Implementar**

`BuscaCelular`: botão de 44 px com o ícone `search`, igual ao do sino, e `@radix-ui/react-dialog` com `Dialog.Title` em `sr-only`, conteúdo `fixed inset-0 z-50 bg-bg`, campo no topo com botão Fechar e `BuscaResultados` com rolagem. Ignora a busca registrada pela tela. Fecha o diálogo por `useBuscaGeral({ aoEscolher })`; o botão Fechar chama `setTermo('')` e fecha.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/components/shell`
Expected: `tsc` sem erro e todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(busca): busca em tela cheia no celular"
```

---

### Task 5: Abrir o agendamento na agenda

**Files:**
- Create: `frontend/src/lib/agendaDestino.ts`
- Modify: `frontend/src/components/AppointmentModule.tsx:281-283`
- Test: `frontend/src/lib/__tests__/agendaDestino.test.ts`, `frontend/src/components/__tests__/AppointmentModule.test.tsx`

**Interfaces:**
- Consumes: o link `/agendamentos?data=<AAAA-MM-DD>&agendamento=<id>` montado por `montarItens` (Task 2).
- Produces: `lerDestinoAgenda(data: string | null, agendamento: string | null): { data: string; agendamentoId: string } | null`

- [ ] **Step 1: Escrever os testes**

```ts
// agendaDestino.test.ts
const ID = '11111111-1111-4111-8111-111111111111';
lerDestinoAgenda('2026-11-06', ID)  // => { data: '2026-11-06', agendamentoId: ID }
lerDestinoAgenda('2026-13-40', ID)  // => null
lerDestinoAgenda('lixo', ID)        // => null
lerDestinoAgenda('2026-11-06', 'x') // => null
lerDestinoAgenda(null, null)        // => null

// AppointmentModule.test.tsx, com os mocks que o arquivo já usa
it('?data e ?agendamento abrem o dia e o painel do horário e limpam a URL')
it('já na agenda em outro dia, um novo destino troca o dia sem remontar')  // Review Focus 4
it('destino inválido abre o dia de hoje, sem painel, e limpa a URL')       // Review Focus 5
it('destino volta para a aba agenda e a visão de dia')
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/lib/__tests__/agendaDestino src/components/__tests__/AppointmentModule`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar**

- `lerDestinoAgenda`: a data precisa bater com `^\d{4}-\d{2}-\d{2}$` e existir no calendário; o id precisa ser um UUID.
- `AppointmentModule.tsx`: o efeito de `setSelectedDate(getToday())` passa a usar `setSelectedDate((atual) => atual || getToday())`. Logo depois dele, um efeito que depende de `searchParams.get('data')` e `searchParams.get('agendamento')`, porque a tela não remonta ao navegar para si mesma. Se algum dos dois existir: com destino válido, chama `setActiveTab('agenda')`, `setViewMode('day')`, `setSelectedDate(data)` e `setDetalhesId(agendamentoId)`; em qualquer caso, `router.replace('/agendamentos', { scroll: false })`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/lib/__tests__/agendaDestino src/components/__tests__/AppointmentModule`
Expected: `tsc` sem erro e todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(busca): link que abre o agendamento na agenda"
```

---

### Task 6: Conferência final e documentação

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/FUNCIONALIDADES.md`, `docs/design/SEGUIMENTO.md`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 5.

- [ ] **Step 1: Rodar tudo**

Run: `cd backend && npx tsc --noEmit && npx vitest run` e `cd frontend && npx tsc --noEmit && npx eslint src/components/shell src/hooks src/lib && npx vitest run`
Expected: sem erro de tipos e todos os testes passando.

- [ ] **Step 2: Conferir no navegador**

Use um backend mock na porta 5000 e `next dev` em outra porta, com os cookies `access_token` e `refresh_token` em `conferencia-local`, conforme a memória do projeto. O mock responde `POST /api/v1/busca` e `/auth/me`. Em 1280 px e 390 px, nos temas claro e escuro, confira:

- a busca passa pelo proxy com o corpo intacto;
- a lista cabe na tela e não cria rolagem horizontal;
- teclado, clique e `Ctrl K`;
- abrir uma cliente, um agendamento e uma tela;
- a barra em Clientes continua filtrando.

Expected: tudo funcionando, com capturas guardadas para o PR.

- [ ] **Step 3: Atualizar a documentação**

`FUNCIONALIDADES.md` ganha a busca geral. `ROADMAP.md` registra a entrega. `SEGUIMENTO.md` ganha uma seção "Busca geral, pendências conhecidas" com o que ficou de fora: WhatsApp, comandas, caixa, buscas recentes e a troca para `unaccent` e `pg_trgm` se algum negócio passar de cerca de 20 mil clientes.

- [ ] **Step 4: Commit e PR**

```bash
git add docs
git commit -m "docs: busca geral no roadmap e no seguimento"
git push -u origin feat/busca-geral
gh pr create --base main --title "feat: busca geral do painel"
```

O PR informa que não há migração.
