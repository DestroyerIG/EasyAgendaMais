# Campanhas do WhatsApp (2C-2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Campanhas no WhatsApp: lista das campanhas do negócio e "Nova campanha" em 3 passos fiel ao Stitch (público, mensagem com variáveis e prévia real, programação com cadência), com envio pela fila `whatsapp_envios` em prioridade 9, respeitando SAIR e consentimento.

**Architecture:**
- Módulo novo `backend/src/modules/whatsappCampanhas/` com a tabela `whatsapp_campanhas`, as funções puras (segmentos, nome, status, previsão), o cálculo do público a partir do CRM e as ações rascunho / agendar / cancelar / detalhes.
- Agendar monta uma mensagem por cliente e enfileira tudo com `lote_id` = id da campanha, `origin: 'campanha'` e `PRIORIDADE_CAMPANHA`.
- A fila (`whatsappFila`) passa a respeitar a cadência de cada campanha em envio: no máximo `cadencia` itens do lote por hora, intervalo médio de `3600 / cadencia` segundos depois de cada item da campanha, e o limite geral do negócio vira `max(25, cadências em envio)`.
- O status "Enviando" e "Concluída" é derivado na leitura (status gravado `agendada` + itens restantes do lote); só `rascunho`, `agendada` e `cancelada` são gravados.
- Frontend: `components/whatsapp/campanhas/` com a lista, a criação em 3 passos e o modal de detalhes; aba nova entre Automações e Conversas.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest; Next.js 15, React, Tailwind com tokens, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-automacoes-campanhas-design.md` (seções "Intenção", "Anti-objetivos", "Bloqueio por SAIR e consentimento", "Prioridade na fila", "Campanhas", "Dados — 2C-2c" e "Restrições"). As Automações (2C-2b) já estão na `main`.

## Global Constraints
- Textos de interface em português do Brasil.
- Branch `feat/campanhas` saindo da `main`; PR para a `main`, que o dono junta. Nunca push na `main`.
- `backend/.env` aponta para **produção**:
  - nunca rodar `prisma migrate dev/deploy/db push/reset`;
  - só `npx prisma validate`, `npx prisma migrate diff ... --script` (para conferir) e `npx prisma generate`;
  - SQL escrito à mão em `backend/prisma/migrations/20261023120000_whatsapp_campanhas/migration.sql`;
  - aplicar em produção só com autorização explícita do dono, pelo pooler de sessão (`DIRECT_URL` = `DATABASE_URL` com `:6543` → `:5432` e sem query string), com `migrate status` antes e depois.
- Testes nunca tocam o banco: repositórios, `avatares` e `config/prisma` mockados com `vi.mock`, como em `backend/src/__tests__/retornoService.test.ts`.
- Horários no fuso do negócio: `getBusinessScheduleSettings(businessId).timezone`, `todayInTimezone`, `zonedToUtc` (`backend/src/utils/businessDate.ts`).
- Origem `campanha` (já existe em `Origem`) é bloqueada por SAIR (`inboxRecorder`) e por consentimento revogado (`filaRepository.consentimentoRevogado`), na montagem e de novo na hora do envio (a fila já faz a segunda checagem).
- Prioridade: `PRIORIDADE_CAMPANHA = 9` de `backend/src/modules/whatsappFila/fila.rules.ts`.
- Janela de envio 08:00–20:00 (`JANELA_INICIO`/`JANELA_FIM`), intervalo mínimo `INTERVALO_MIN_S = 45`, limite padrão `LIMITE_POR_HORA = 25`.
- Cadências aceitas: `10 | 25 | 60`, padrão `25`.
- Rodapé fixo, não editável, acrescentado depois de uma linha em branco: `Responda SAIR para não receber novidades.`
- Texto da campanha: 1 a 1000 caracteres (`LIMITE_TEXTO_CAMPANHA = 1000`), sem contar o rodapé.
- Rotas sob `authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')`, montadas em `${API_V1}/whatsapp/campanhas` no `server.ts` **antes** do `app.use(`${API_V1}/whatsapp`, ...)`.
- Frontend: cores só por token (`frontend/src/__tests__/themeCompliance.test.ts`); proxies Next em `frontend/src/app/api/whatsapp/campanhas/...` com `proxyRequest`, como `frontend/src/app/api/whatsapp/retorno/route.ts`.
- Visual fiel a `docs/design/stitch/projeto/studio-aurora-whatsapp-nova-campanha-ajustada--6aa34e.html`: abrir o HTML e copiar estrutura, espaçamentos e textos fixos. Os números do Stitch ("42 selecionadas", "36", "Previsão: 1h 26min", "45 a 90 segundos") viram dados reais.
- Fora de escopo: imagem anexada e testes A/B.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisões deste plano (do Claude)
- **Variáveis:** `{primeiro_nome}`, `{profissional}` (primeiro nome da profissional de preferência), `{servico}` (último serviço), `{horarios_livres}` (até 2 encaixes, `curto` de `formatarEncaixe` juntos com " ou ", da semana que começa no **início da campanha**, com a profissional de preferência se ativa e a duração do último serviço) e `{link}` (`${FRONTEND_URL}/agendar/${slug}`; sem `FRONTEND_URL` ou slug fica vazio). Render com `renderizarTexto` das automações, que já remove a linha que sobrou vazia.
- **Intervalo da campanha:** depois de um item de campanha, `intervalAfterS = intervaloCampanha(cadencia)` = `round(3600 / cadencia × (0.75 + 0.5 × rand))`, nunca abaixo de 45 s (10/h → 270–450 s; 25/h → 108–180 s; 60/h → 45–75 s). O texto "Intervalo Dinâmico" do Stitch mostra a faixa real da cadência escolhida.
- **Mesma cliente em duas campanhas ativas:** o índice único da fila (`business_id, client_id, origin` ativo) impede o segundo item. Ela fica fora da nova campanha e o agendamento devolve `jaNaFila: N`. Para isso o `EnvioDto` ganha `loteId`.
- **Data de início:** de hoje até hoje + 30 dias; horário em passos de 30 min de 08:00 a 19:30; precisa estar no futuro. Padrão: amanhã às 10:00 ("10:00 (Janela de pico)").
- **Previsão de duração (front):** `ceil(total / cadencia × 60)` minutos, rotulada "Previsão"; se o fim passar das 20:00, acrescenta "continua no dia seguinte às 08:00".

## Review Focus
1. **Duplo clique em "Agendar disparo"** (ou duas abas): a campanha não pode enfileirar duas vezes. O agendamento de um rascunho troca `rascunho → agendada` com `updateMany` condicional antes de enfileirar; se a troca não pegar (count 0), 409 "Esta campanha já foi agendada". Teste na Task 5.
2. **Falha no meio do enfileiramento** (erro de banco na cliente 20 de 40): os itens já criados do lote são cancelados e a campanha volta a `rascunho`, para não ficar "Agendada" com metade do público. Teste na Task 5.
3. **Cliente que respondeu SAIR depois do agendamento e antes do envio**: o item é pulado com `MOTIVO_OPT_OUT` pela checagem que a fila já faz, e aparece em "Ver detalhes" como pulada com o motivo. Teste na Task 3 (fila com item `campanha`).
4. **Público vazio ou só com bloqueadas** (`receberao = 0`): o botão "Agendar disparo" fica desabilitado no front e o servidor recusa com 422 "Nenhuma cliente pode receber esta campanha", mantendo o rascunho. Testes nas Tasks 5 e 7.
5. **Cancelar enquanto um item está `enviando`**: só os `na_fila` viram `cancelado` (motivo "Campanha cancelada"); o que está saindo termina normalmente e conta como enviado. Teste na Task 5.

---

### Task 1: Migração, schema e ajustes de tipos

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261023120000_whatsapp_campanhas/migration.sql`
- Modify: `backend/src/modules/whatsappFila/fila.service.ts` (`EnvioDto.loteId`, `paraDto`)
- Modify: `frontend/src/lib/whatsappRetorno.ts` (`EnvioDto.loteId`)
- Modify: `backend/src/modules/crm/crm.repository.ts` e `backend/src/modules/crm/crmMetrics.ts` (`Visita.serviceId?: string`, `s.id AS service_id` na consulta de visitas)
- Test: testes existentes de fila, retorno e CRM

**Interfaces:**
- Produces (Prisma):
  ```prisma
  model WhatsappCampanha {
    id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    businessId     String   @map("business_id") @db.Uuid
    nome           String   @db.VarChar(80)
    segmento       String   @db.VarChar(20)
    professionalId String?  @map("professional_id") @db.Uuid
    serviceId      String?  @map("service_id") @db.Uuid
    texto          String   @db.Text
    inicioEm       DateTime @map("inicio_em") @db.Timestamptz(6)
    cadencia       Int      @default(25) @db.SmallInt
    status         String   @default("rascunho") @db.VarChar(12)
    total          Int      @default(0)
    createdBy      String?  @map("created_by") @db.Uuid
    createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
    updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
    business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
    @@index([businessId, createdAt(sort: Desc)])
    @@map("whatsapp_campanhas")
  }
  ```
  `professional_id`, `service_id` e `created_by` sem FK (filtro apagado só some do filtro). Relação inversa `Business.whatsappCampanhas`. Índice extra `whatsapp_envios(business_id, lote_id, status)` (`@@index([businessId, batchId, status])`).
- Produces (TS): `EnvioDto.loteId: string | null` nos dois lados; `Visita.serviceId?: string`.

- [ ] **Step 1:** Editar `schema.prisma` como acima.
- [ ] **Step 2:** Escrever o `migration.sql` à mão (`CREATE TABLE`, índices, FK para `businesses` com `ON DELETE CASCADE`, `ALTER TABLE public.whatsapp_campanhas ENABLE ROW LEVEL SECURITY;`), no estilo de `20261020120000_whatsapp_envios/migration.sql`. Conferir comparando com a saída de `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (não toca o banco) nos trechos da tabela e do índice novos.
- [ ] **Step 3:** Rodar `npx prisma validate` e `npx prisma generate` em `backend/`. Esperado: "The schema … is valid" e client gerado (EPERM: encerrar o node órfão que segura o `query_engine` e repetir).
- [ ] **Step 4:** Acrescentar `loteId` ao `EnvioDto` (`paraDto`: `loteId: r.batchId`) e `serviceId` às visitas. Ajustar os testes que comparam `EnvioDto` inteiro.
- [ ] **Step 5:** Rodar `npx tsc --noEmit` e `npm test` em `backend/` e `npx tsc --noEmit` em `frontend/`. Esperado: sem erros, tudo passa.
- [ ] **Step 6:** Commit `feat(whatsapp): tabela das campanhas e lote no envio`.

### Task 2: Regras puras da campanha

**Files:**
- Create: `backend/src/modules/whatsappCampanhas/campanhas.types.ts`
- Create: `backend/src/modules/whatsappCampanhas/campanhas.rules.ts`
- Test: `backend/src/__tests__/campanhasRules.test.ts`

**Interfaces:**
- Produces (`campanhas.types.ts`):
  ```ts
  export type Segmento = 'em_risco' | 'reativacao' | 'aniversariantes' | 'vips' | 'todas';
  export const SEGMENTOS: Segmento[]; // nesta ordem
  export type Cadencia = 10 | 25 | 60;
  export type StatusGravado = 'rascunho' | 'agendada' | 'cancelada';
  export type StatusCampanha = StatusGravado | 'enviando' | 'concluida';
  export const LIMITE_TEXTO_CAMPANHA = 1000;
  export const RODAPE_SAIR = 'Responda SAIR para não receber novidades.';
  export const VARIAVEIS_CAMPANHA = ['primeiro_nome', 'profissional', 'servico', 'horarios_livres', 'link'];
  // Zod:
  export const PublicoSchema = z.object({ segmento: z.enum(SEGMENTOS), professionalId: z.string().uuid().nullable().default(null), serviceId: z.string().uuid().nullable().default(null), texto: z.string().max(LIMITE_TEXTO_CAMPANHA).default('') });
  export const SalvarCampanhaSchema = PublicoSchema.extend({
    nome: z.string().trim().min(1).max(80),
    texto: z.string().trim().min(1).max(LIMITE_TEXTO_CAMPANHA),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hora: z.string().regex(/^([01]\d|2[0-3]):[03]0$/),
    cadencia: z.union([z.literal(10), z.literal(25), z.literal(60)]).default(25),
    acao: z.enum(['rascunho', 'agendar']),
  });
  export interface CampanhaDto { id: string; nome: string; segmento: Segmento; professionalId: string | null; serviceId: string | null; texto: string; data: string; hora: string; cadencia: Cadencia; status: StatusCampanha; total: number; enviadas: number; createdAt: string }
  export interface PublicoDto { selecionadas: number; receberao: number; resguardadas: number; amostra: { nome: string; telefone: string; texto: string } | null }
  export interface DetalhesCampanhaDto { campanha: CampanhaDto; contagem: { enviadas: number; naFila: number; puladas: number; falhas: number; canceladas: number }; itens: Array<{ id: string; nome: string; telefone: string; status: EnvioDto['status']; motivo: string | null; enviadoEm: string | null }> }
  ```
- Produces (`campanhas.rules.ts`):
  - `ROTULO_SEGMENTO: Record<Segmento, string>`: `em_risco` "Não vêm há mais de 30 dias (Em risco)", `reativacao` "Inativas há mais de 60 dias (Reativação)", `aniversariantes` "Aniversariantes do mês", `vips` "Top 10% mais frequentes (VIPs)", `todas` "Todas as clientes".
  - `NOME_CURTO_SEGMENTO: Record<Segmento, string>`: "Em risco", "Reativação", "Aniversariantes", "VIPs", "Todas".
  - `nomeAutomatico(segmento: Segmento, hojeYmd: string): string` → `"Reativação · 21/10"`.
  - `interface ClienteDoPublico { id: string; nome: string; telefone: string; birthDate: string | null; diasSemVir: number | null; visitas12m: number; profissionalPreferida: { id: string; nome: string } | null; ultimoServico: { id: string; nome: string; duracao: number } | null }`
  - `resumoParaPublico(visitas: Visita[], hojeYmd: string): Pick<ClienteDoPublico, 'diasSemVir' | 'visitas12m' | 'profissionalPreferida' | 'ultimoServico'>`: preferida = a profissional com mais visitas, empate → a da visita mais recente; `visitas12m` = visitas com data > hoje − 365 dias.
  - `filtrarPublico(clientes: ClienteDoPublico[], f: { segmento: Segmento; professionalId: string | null; serviceId: string | null }, hojeYmd: string): ClienteDoPublico[]`:
    - `em_risco`: `31 ≤ diasSemVir ≤ 60`; `reativacao`: `diasSemVir > 60`; `aniversariantes`: mês de `birthDate` = mês de hoje; `todas`: todas;
    - `vips`: entre as com `visitas12m ≥ 1`, ordenar por `visitas12m` desc e pegar `ceil(10% de n)`; empatadas com a última da lista também entram;
    - depois os filtros de profissional preferida e de último serviço (por id);
    - ordem final: nome (`localeCompare` pt-BR).
  - `statusCampanha(c: { status: StatusGravado; inicioEm: Date }, restantes: number, agora: Date): StatusCampanha`: `agendada` + início no futuro → `agendada`; `agendada` + `restantes > 0` → `enviando`; `agendada` + `restantes = 0` → `concluida`; os outros como gravados.
  - `validarInicio(data: string, hora: string, tz: string, agora: Date): Date` (lança `ValidationError`): hora entre 08:00 e 19:30, data até hoje + 30 dias, instante no futuro. Mensagens: "Escolha um horário entre 08:00 e 19:30", "Escolha uma data nos próximos 30 dias", "Escolha um horário no futuro".
  - `comRodape(texto: string): string` → `texto.trim() + '\n\n' + RODAPE_SAIR`.

- [ ] **Step 1: Testes falhando** em `campanhasRules.test.ts`:
  - `em_risco` com dias 30, 31, 60, 61 → só 31 e 60; `reativacao` → só 61; cliente sem visita só entra em `todas` e `aniversariantes`;
  - `aniversariantes` com hoje `2026-10-23`: nascida `1990-10-02` entra, `1990-11-23` não;
  - `vips` com 20 clientes de 1 a 20 visitas → a de 20 e a de 19; com empate na segunda (19, 19) → as três;
  - `vips` com uma cliente com 0 visitas em 12 meses → fora;
  - filtro de profissional usa a preferida, não a última; empate de contagem → a mais recente;
  - `nomeAutomatico('reativacao', '2026-10-21')` → `'Reativação · 21/10'`;
  - `statusCampanha`: as 5 saídas;
  - `validarInicio`: 07:30 e 20:00 recusadas; hoje + 31 dias recusada; 1 min no passado recusada; amanhã 10:00 → `zonedToUtc` correto em `America/Sao_Paulo`;
  - `comRodape('Oi\n')` → `'Oi\n\nResponda SAIR para não receber novidades.'`.
- [ ] **Step 2:** Rodar `npx vitest run src/__tests__/campanhasRules.test.ts` em `backend/`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar os dois arquivos.
- [ ] **Step 4:** Rodar de novo. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): regras de público, status e início das campanhas`.

### Task 3: Cadência da campanha na fila

**Files:**
- Modify: `backend/src/modules/whatsappFila/fila.rules.ts`
- Modify: `backend/src/modules/whatsappFila/fila.repository.ts`
- Modify: `backend/src/modules/whatsappFila/fila.service.ts`
- Test: `backend/src/__tests__/filaRules.test.ts`, `backend/src/__tests__/filaService.test.ts`

**Interfaces:**
- Produces (`fila.rules.ts`):
  - `intervaloCampanha(cadencia: number, rand: () => number = Math.random): number` (fórmula em "Decisões").
  - `limiteDoNegocio(cadenciasEmEnvio: number[]): number` → `Math.max(LIMITE_POR_HORA, ...cadenciasEmEnvio)`.
  - `podeEnviarAgora` ganha `limitePorHora?: number` (padrão `LIMITE_POR_HORA`).
- Produces (`fila.repository.ts`):
  - `cadenciasEmEnvio(businessId: string, agora: Date): Promise<Array<{ id: string; cadencia: number }>>`: `whatsappCampanha` com `status: 'agendada'` e `inicioEm <= agora`.
  - `contarEnviadosDoLoteDesde(businessId: string, loteIds: string[], desde: Date): Promise<Map<string, number>>` (`groupBy` por `batchId`, status `enviado`/`enviando`, `sentAt >= desde`).
  - `proximoVencido(businessId, agora, excluirLotes: string[] = [])`: acrescenta `OR: [{ batchId: null }, { batchId: { notIn: excluirLotes } }]` quando a lista não é vazia.
  - `cancelarDoLote(businessId: string, loteId: string, motivo: string): Promise<number>`: `na_fila` do lote → `cancelado` com o motivo.
  - `contagemDoLote(businessId: string, loteIds: string[]): Promise<Map<string, Record<EnvioDto['status'], number>>>`.
  - `itensDoLote(businessId: string, loteId: string): Promise<Array<EnvioRow & { client: { name: string } | null }>>` ordenados por `createdAt`.
- Comportamento em `processarNegocio`:
  - carregar `cadenciasEmEnvio` uma vez; `limitePorHora = limiteDoNegocio(cadências)`;
  - lotes cuja contagem da última hora ≥ cadência entram em `excluirLotes`;
  - depois de enviar um item com `origin === 'campanha'` e `batchId` em envio, `intervalAfterS = intervaloCampanha(cadencia)`; os outros seguem `sortearIntervalo()`.

- [ ] **Step 1: Testes falhando:**
  - `intervaloCampanha(25, () => 0)` → 108; `(25, () => 1)` → 180; `(60, () => 0)` → 45; `(10, () => 0.5)` → 360;
  - `limiteDoNegocio([])` → 25; `([10])` → 25; `([60, 10])` → 60;
  - `podeEnviarAgora` com 30 enviados na hora e `limitePorHora: 60` → true; sem o parâmetro → false;
  - `filaService`: lote com cadência 10 e 10 enviados na última hora → `proximoVencido` chamado com `excluirLotes: [id]` e o item `retorno` vencido sai;
  - item `campanha` enviado → `atualizar` com `intervalAfterS` entre 108 e 180 para cadência 25;
  - item `campanha` de telefone em opt-out → pulado com `MOTIVO_OPT_OUT` (Review Focus 3).
- [ ] **Step 2:** Rodar `npx vitest run src/__tests__/filaRules.test.ts src/__tests__/filaService.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npm test` em `backend/`. Esperado: tudo passa.
- [ ] **Step 5:** Commit `feat(whatsapp): fila respeita a cadência de cada campanha`.

### Task 4: Público e prévia da campanha

**Files:**
- Create: `backend/src/modules/whatsappCampanhas/campanhas.repository.ts`
- Create: `backend/src/modules/whatsappCampanhas/publico.service.ts`
- Modify: `backend/src/modules/whatsappInbox/inbox.repository.ts` e `inbox.recorder.ts` (`telefonesEmOptOut`)
- Test: `backend/src/__tests__/campanhasPublico.test.ts`

**Interfaces:**
- Produces:
  - `inboxRecorder.telefonesEmOptOut(businessId: string): Promise<Set<string>>` (phone keys com `reactivatedAt: null`; em erro, loga e lança, para não mandar para quem saiu).
  - `campanhasRepository.opcoes(businessId): Promise<{ profissionais: Array<{ id: string; nome: string }>; servicos: Array<{ id: string; nome: string }> }>` (ativos, por nome).
  - `publicoService.montar(businessId: string, f: { segmento; professionalId; serviceId }, inicio: Date, agora?: Date): Promise<{ elegiveis: Array<ClienteDoPublico & { vars: Record<string, string> }>; selecionadas: number; resguardadas: number }>`:
    - clientes ativas de `crmRepository.clientes`, visitas de `crmRepository.visitas`, `resumoParaPublico`, `filtrarPublico`;
    - resguardada = `consentimento === 'revogado'`, telefone em `telefonesEmOptOut` ou `canonicalizePhone` vazio;
    - `vars` só para as elegíveis; `{horarios_livres}` com `carregarAgendaSemana(businessId, inicio)` carregada uma vez e `vagasDaSemana(semana, 2, { professionalId (se ativa), duracaoMinima })`.
  - `publicoService.previa(businessId, input: z.infer<typeof PublicoSchema>, agora?): Promise<PublicoDto>`: usa amanhã 10:00 como início para os encaixes; `amostra` = primeira elegível com `comRodape(renderizarTexto(texto, vars))` (texto vazio → só o rodapé).

- [ ] **Step 1: Testes falhando** (mocks de `crmRepository`, `inboxRecorder`, `carregarAgendaSemana`/`vagasDaSemana`, `retornoRepository.negocio`, `getBusinessScheduleSettings`):
  - 5 clientes em risco, 1 revogada e 1 em opt-out → `selecionadas 5`, `receberao 3`, `resguardadas 2`;
  - cliente inativa (`active: false`) não conta em nada;
  - amostra com `{primeiro_nome}` e `{profissional}` trocados pela primeira elegível em ordem de nome e o rodapé no fim;
  - sem `FRONTEND_URL`: a linha `Agende: {link}` some da amostra;
  - `telefonesEmOptOut` lança → `previa` rejeita (não mostra contagem errada).
- [ ] **Step 2:** Rodar `npx vitest run src/__tests__/campanhasPublico.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar de novo. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): público e prévia das campanhas`.

### Task 5: Salvar, agendar, cancelar, listar e detalhar; rotas

**Files:**
- Create: `backend/src/modules/whatsappCampanhas/campanhas.service.ts`
- Create: `backend/src/modules/whatsappCampanhas/campanhas.controller.ts`
- Create: `backend/src/modules/whatsappCampanhas/campanhas.routes.ts`
- Modify: `backend/src/modules/whatsappCampanhas/campanhas.repository.ts`
- Modify: `backend/src/server.ts`
- Create: `frontend/src/app/api/whatsapp/campanhas/route.ts` (GET, POST), `.../campanhas/opcoes/route.ts` (GET), `.../campanhas/publico/route.ts` (POST), `.../campanhas/[id]/route.ts` (GET, PUT), `.../campanhas/[id]/cancelar/route.ts` (POST)
- Test: `backend/src/__tests__/campanhasService.test.ts`, `backend/src/__tests__/campanhasRoutes.test.ts`

**Interfaces:**
- Produces (rotas, todas com o guard):
  - `GET /api/v1/whatsapp/campanhas` → `CampanhaDto[]` (mais novas primeiro, até 50);
  - `GET /opcoes` → `{ profissionais, servicos }`;
  - `POST /publico` (body `PublicoSchema`) → `PublicoDto`;
  - `POST /` (body `SalvarCampanhaSchema`) → `{ campanha: CampanhaDto; jaNaFila: number }` (201);
  - `PUT /:id` (body `SalvarCampanhaSchema`) → idem; só `rascunho` (409 "Só rascunhos podem ser editados");
  - `GET /:id` → `DetalhesCampanhaDto`;
  - `POST /:id/cancelar` → `CampanhaDto`; só `agendada` (409 "Esta campanha não está agendada").
  - `/opcoes` e `/publico` registrados antes de `/:id`.
- Produces (`campanhasService`):
  - `listar(businessId, agora?)`, `detalhes(businessId, id, agora?)` (404 "Campanha não encontrada"), `salvar(businessId, userId, input, id?: string, agora?)`, `cancelar(businessId, id)`.
  - `salvar` com `acao: 'rascunho'`: valida só o texto e grava (`inicioEm` = `zonedToUtc(data, hora, tz)` sem `validarInicio`).
  - `salvar` com `acao: 'agendar'`:
    1. `validarInicio`; WhatsApp desconectado **não** impede (a fila espera a conexão);
    2. grava/atualiza como `rascunho` e troca para `agendada` com `repo.marcarAgendada(businessId, id)` (`updateMany where status 'rascunho'`); count 0 → 409 "Esta campanha já foi agendada";
    3. `publicoService.montar(..., inicio)`; nenhuma elegível → volta a `rascunho` e 422 "Nenhuma cliente pode receber esta campanha";
    4. `filaEnvios.enfileirar` com `{ businessId, clientId, phone, body: comRodape(renderizarTexto(texto, vars)), origin: 'campanha', agendadoPara: inicio, loteId: id, prioridade: PRIORIDADE_CAMPANHA }`;
    5. erro no passo 4 → `filaRepository.cancelarDoLote(businessId, id, 'Campanha cancelada')`, volta a `rascunho`, relança;
    6. `total` = envios com `loteId === id`; `jaNaFila` = o resto; grava `total`.
  - `cancelar`: `status = 'cancelada'` e `cancelarDoLote(..., 'Campanha cancelada')`.
  - DTO: `enviadas` e `restantes` de `contagemDoLote`; `status` por `statusCampanha`; `data`/`hora` de `inicioEm` no fuso do negócio.

- [ ] **Step 1: Testes falhando** em `campanhasService.test.ts`:
  - agendar com 3 elegíveis → `enfileirar` com 3 itens `origin 'campanha'`, prioridade 9, `loteId` = id, `agendadoPara` = início, texto com rodapé; `total 3`;
  - uma das 3 já na fila de outra campanha (`loteId` diferente no retorno) → `total 2`, `jaNaFila 1`;
  - `marcarAgendada` devolve 0 → 409 e `enfileirar` não é chamado (Review Focus 1);
  - `enfileirar` lança → `cancelarDoLote` chamado e campanha volta a `rascunho` (Review Focus 2);
  - público sem elegíveis → 422 e campanha em `rascunho` (Review Focus 4);
  - `cancelar` chama `cancelarDoLote` (só `na_fila`; Review Focus 5) e devolve `cancelada`; cancelar `rascunho` → 409;
  - `PUT` de campanha `agendada` → 409;
  - `listar`: agendada com início passado e 2 restantes → `enviando`; 0 restantes → `concluida`.
- [ ] **Step 2:** `campanhasRoutes.test.ts` com supertest (como `whatsappSimulatorRoute.test.ts`): `POST /publico` sem `segmento` → 400; `POST /` com `hora: '10:15'` → 400; rota `/opcoes` não cai em `/:id`.
- [ ] **Step 3:** Rodar os dois testes. Esperado: FAIL.
- [ ] **Step 4:** Implementar service, controller, rotas, montagem no `server.ts` e os proxies Next.
- [ ] **Step 5:** Rodar `npx tsc --noEmit` e `npm test` em `backend/`. Esperado: tudo passa.
- [ ] **Step 6:** Commit `feat(whatsapp): agendar, cancelar e acompanhar campanhas`.

### Task 6: Aba Campanhas e lista

**Files:**
- Create: `frontend/src/lib/whatsappCampanhas.ts`
- Create: `frontend/src/components/whatsapp/campanhas/Campanhas.tsx`
- Create: `frontend/src/components/whatsapp/campanhas/CartaoCampanha.tsx`
- Create: `frontend/src/components/whatsapp/campanhas/DetalhesCampanhaModal.tsx`
- Modify: `frontend/src/components/WhatsAppModule.tsx` (`Aba` + `ABAS`)
- Test: `frontend/src/components/whatsapp/__tests__/Campanhas.test.tsx`, `frontend/src/components/whatsapp/__tests__/WhatsAppModule.test.tsx`

**Interfaces:**
- Produces (`lib/whatsappCampanhas.ts`): os tipos `Segmento`, `Cadencia`, `StatusCampanha`, `CampanhaDto`, `PublicoDto`, `DetalhesCampanhaDto`, `SalvarCampanha` espelhando a Task 2; `ROTULO_SEGMENTO`, `ROTULO_STATUS` (`Rascunho`, `Agendada`, `Enviando`, `Concluída`, `Cancelada`), `RODAPE_SAIR`, `LIMITE_TEXTO_CAMPANHA`, `VARIAVEIS_CAMPANHA`; chamadas `listarCampanhas()`, `opcoesCampanha()`, `previaPublico(f)`, `criarCampanha(body)`, `salvarCampanha(id, body)`, `detalhesCampanha(id)`, `cancelarCampanha(id)` via `api` em `/whatsapp/campanhas...`; `previsaoDuracao(total: number, cadencia: Cadencia, hora: string): string` (Decisões).
- Produces (componentes): `<Campanhas conectado: boolean; nomeNegocio: string />`. Internamente alterna entre a lista e `<NovaCampanha>` (Task 7) com `campanha?: CampanhaDto` (rascunho em edição) e `onFechar(recarregar: boolean)`.
- Abas: `Hora de voltar · Automações · Campanhas · Conversas · Conexão`, id `campanhas`, `?aba=campanhas`.
- Lista:
  - cabeçalho "Campanhas" com botão "Nova campanha";
  - cartão: nome, `ROTULO_SEGMENTO`, `StatusChip` por status, barra/progresso "enviadas/total" (não em rascunho), data e hora de início;
  - ações: "Continuar editando" (rascunho), "Cancelar envio" (agendada e enviando; pede confirmação no próprio cartão, sem `window.confirm`), "Ver detalhes" (todas menos rascunho);
  - vazio: `EmptyState` "Nenhuma campanha ainda" com "Criar primeira campanha";
  - `DetalhesCampanhaModal`: as 5 contagens e a lista de itens com status e motivo.
  - Celular: cartões em coluna; modal em tela cheia.

- [ ] **Step 1: Testes falhando:**
  - lista vazia mostra o convite; clicar abre a criação;
  - campanha `enviando` 12/40 mostra "Enviando", "12/40" e "Cancelar envio"; confirmar chama `cancelarCampanha`;
  - rascunho mostra "Continuar editando" e não mostra progresso;
  - "Ver detalhes" abre o modal com "Pediu para não receber mensagens" de um item pulado;
  - `WhatsAppModule`: as 5 abas na ordem do Stitch.
- [ ] **Step 2:** Rodar `npx vitest run src/components/whatsapp/__tests__/Campanhas.test.tsx src/components/whatsapp/__tests__/WhatsAppModule.test.tsx` em `frontend/`. Esperado: FAIL.
- [ ] **Step 3:** Implementar (até a Task 7, `NovaCampanha` pode ser um placeholder que só chama `onFechar`).
- [ ] **Step 4:** Rodar de novo, mais `src/__tests__/themeCompliance.test.ts`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): aba Campanhas com lista, cancelamento e detalhes`.

### Task 7: Nova campanha em 3 passos

**Files:**
- Create: `frontend/src/components/whatsapp/campanhas/NovaCampanha.tsx`
- Create: `frontend/src/components/whatsapp/campanhas/PassoPublico.tsx`, `PassoMensagem.tsx`, `PassoProgramacao.tsx`, `PreviaCampanha.tsx`
- Test: `frontend/src/components/whatsapp/__tests__/NovaCampanha.test.tsx`

**Interfaces:**
- Consumes: `lib/whatsappCampanhas.ts` (Task 6); `TextoWhatsApp` de `components/whatsapp/retorno/PreviaConvite`; a lógica de inserir chip no cursor de `ConfigurarRegraModal.tsx` (extrair para `frontend/src/lib/inserirVariavel.ts` com `inserirVariavel(texto, inicio, fim, nome, limite): { texto: string; cursor: number } | null` e usar nos dois).
- Produces: `<NovaCampanha campanha?: CampanhaDto; nomeNegocio: string; onFechar(recarregar: boolean): void />`.
- Layout do Stitch (copiar do HTML): breadcrumb "WhatsApp › Campanhas › Nova Campanha", título "Nova Campanha de WhatsApp" com o nome editável ao lado (padrão `nomeAutomatico`, gerado no front com a mesma regra), selo "Limite recomendado: 25 mensagens por hora", indicador dos 3 passos, coluna esquerda (`lg:col-span-7`) com as 3 seções e coluna direita (`lg:col-span-5`) com a prévia em celular e "Simulação de Entrega".
  - Passo 1: select do segmento (`ROTULO_SEGMENTO`), "Profissional de preferência" (com "Qualquer profissional"), "Último serviço realizado" (com "Todos os serviços"), "Clientes qualificadas no filtro: N selecionadas" e "✓ M clientes com consentimento ativo receberão este disparo (K contatos foram resguardados por restrição de opt-out)."
  - Passo 2: chips das 5 variáveis inseridos no cursor, textarea, "N caracteres" (de `LIMITE_TEXTO_CAMPANHA`), nota "Variáveis renderizadas conforme a ficha individual de cada cliente." e o rodapé fixo mostrado abaixo da caixa, fora dela.
  - Passo 3: data (hoje a hoje + 30), horário (08:00–19:30 de 30 em 30), cadência com "10 msgs/h (Ultra Seguro)", "25 msgs/h (Recomendado)", "60 msgs/h (Agressivo)", "Intervalo Dinâmico" com a faixa real (`intervaloCampanha` com rand 0 e 1, espelhado no front), "Opt-out Transparente" com o texto do rodapé, botões "Salvar como Rascunho" e "Agendar Disparo para M Clientes".
  - Prévia: "Amostra: Nome · telefone", balão com `amostra.texto`; sem amostra: "Nenhuma cliente neste público". "Simulação de Entrega": "Previsão: …" de `previsaoDuracao` e "M envios espaçados preventivamente. Sem risco de bloqueio da linha cadastrada."
- Comportamento:
  - `previaPublico` é chamada ao mudar segmento/filtros e, com 400 ms de espera, ao editar o texto; a resposta antiga não sobrescreve a nova (contador de requisição);
  - "Agendar" desabilitado com `receberao = 0`, texto vazio ou acima do limite, ou enquanto salva (ref contra duplo clique);
  - sucesso: toast "Campanha agendada para M clientes." (com `jaNaFila > 0`: "… N já estavam em outra campanha na fila.") e `onFechar(true)`; rascunho: toast "Rascunho salvo." e `onFechar(true)`;
  - erro: toast com `getApiErrorMessage`;
  - celular: colunas empilhadas, prévia depois do passo 3.

- [ ] **Step 1: Testes falhando:**
  - abre com `em_risco`, cadência 25, amanhã 10:00 e nome "Em risco · DD/MM";
  - trocar o segmento chama `previaPublico` com o novo segmento e mostra "42 selecionadas" e "36 clientes" da resposta mockada;
  - clicar no chip `{primeiro_nome}` insere no cursor;
  - `receberao: 0` → botão "Agendar Disparo para 0 Clientes" desabilitado (Review Focus 4);
  - agendar envia `acao: 'agendar'` com data, hora e cadência escolhidas; dois cliques rápidos → uma chamada;
  - "Salvar como Rascunho" com `campanha` existente chama `salvarCampanha(id, …)`;
  - escolher 60/h mostra "45 a 75 segundos";
  - `previsaoDuracao(36, 25, '10:00')` → `'1h 27min'`; `(300, 10, '10:00')` termina com "continua no dia seguinte às 08:00".
- [ ] **Step 2:** Rodar `npx vitest run src/components/whatsapp/__tests__/NovaCampanha.test.tsx src/components/whatsapp/__tests__/ConfigurarRegraModal.test.tsx`. Esperado: FAIL só no novo.
- [ ] **Step 3:** Implementar, trocando o placeholder da Task 6.
- [ ] **Step 4:** Rodar `npm test` e `npx tsc --noEmit` em `frontend/`. Esperado: tudo passa.
- [ ] **Step 5:** Commit `feat(whatsapp): nova campanha em 3 passos com prévia real`.

### Task 8: Conferência visual e registro

**Files:**
- Modify: `docs/design/SEGUIMENTO.md` (o que ficou pronto e as pendências)

- [ ] **Step 1:** Rodar o projeto localmente com mock (como nas fases anteriores; ver `run-local-after-visual-work`) e conferir, no desktop e em 390 px de largura, claro e escuro: lista vazia, lista com as 5 situações, os 3 passos, prévia, detalhes. Comparar lado a lado com o HTML do Stitch.
- [ ] **Step 2:** Rodar `npm test` em `backend/` e `frontend/` e `npx tsc --noEmit` nos dois. Esperado: tudo passa.
- [ ] **Step 3:** Registrar no `SEGUIMENTO.md`: migração `20261023120000_whatsapp_campanhas` pendente de aplicação em produção (com autorização do dono) e as decisões deste plano.
- [ ] **Step 4:** Commit `docs(whatsapp): registra as campanhas no SEGUIMENTO`.
