# Hora de voltar e fila de envio cadenciada (2C-2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba "Hora de voltar" do WhatsApp fiel ao Stitch (ab3e69): lista de clientes com retorno vencido, com encaixes sugeridos e prévia do convite, e envio individual ou em lote por uma fila cadenciada gravada no banco (reaproveitada depois pelas Campanhas).

**Architecture:** Backend ganha uma fila durável (`whatsapp_envios`, módulo `modules/whatsappFila/`) processada por uma rotina de 1 minuto com regras puras de cadência, e um módulo `modules/whatsappRetorno/` que monta as oportunidades a partir do CRM do 2B (`resumirCliente`) e das vagas (`proximasVagas`), e a mensagem do convite. Todo envio passa por `sendWhatsAppMessage` (2C-1), então entra no histórico, na central e respeita o SAIR. O frontend acrescenta a primeira aba do módulo WhatsApp.

**Tech Stack:** Node/Express, Prisma 5 (PostgreSQL/Supabase), Zod, node-cron, Vitest; Next.js 15, React, Tailwind (tokens), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-hora-de-voltar-design.md`

## Global Constraints

- Idioma pt-BR em tela, erros e commits; botões em frase normal.
- Cores só por token (`bg-surface-m3-low` para o tom quente do Stitch, `bg-surface-2`, `text-brand-text`, `bg-whatsapp`, `text-success-text`, `text-danger`…); `frontend/src/__tests__/themeCompliance.test.ts` reprova cor fixa. Ícones Material via `<Icon name=…/>`; nada de `lucide-react` em arquivo novo.
- Referência visual: `docs/design/stitch/projeto/studio-aurora-whatsapp-hora-de-voltar-ajustada--ab3e69.html`. Nenhum dado de exemplo na tela.
- Quem aparece: cliente ativa, última visita ≤ **120 dias**, `retornoPrevisto.venceuHa > 0`, sem agendamento futuro que ocupe a agenda. Ordem: maior atraso, depois nome.
- Quem pode receber: todas exceto consentimento **revogado** ou opt-out (SAIR). Convite da Hora de voltar há menos de **7 dias** → fora de "Selecionar todas" e "Enviar" pede confirmação.
- Encaixes: até **2** vagas nos próximos **7 dias**, com a profissional da última visita (se inativa, qualquer), duração ≥ duração do último serviço.
- Fila: 1 envio por vez por negócio; intervalo aleatório **45 a 90 s** desde o último envio da fila; no máximo **25 por hora**; só **08:00–20:00** no fuso do negócio; reconfere opt-out/revogado/conexão na hora; desconectado = espera.
- Origem nova `retorno`: bloqueada por opt-out (como as automáticas), grupo "automaticas" na Conexão, rótulo "Convite Hora de voltar".
- Link de auto-agendamento: `{FRONTEND_URL}/agendar/{slug}` (só com página pública).
- Datas no fuso do negócio (`getBusinessScheduleSettings(businessId).timezone`, `todayInTimezone`, `zonedToUtc`).
- Nunca rodar `prisma migrate dev/deploy`/`db push` nem subir servidor (o `.env` aponta para produção). Comandos: `cd backend && npx vitest run <arq>` / `npx tsc --noEmit`; `cd frontend && npx vitest run <arq> --testTimeout=30000` / `npx tsc --noEmit`.
- Se `prisma migrate diff` propuser `DROP INDEX "tags_business_id_lower_name_key"` ou `DROP INDEX "whatsapp_messages_business_provider_key"`, remova essas linhas (índices fora do schema, ver `docs/design/SEGUIMENTO.md`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rotina da fila rodando duas vezes ao mesmo tempo (dois servidores ou tick atrasado)** — a mesma mensagem não pode sair duas vezes: o envio "reserva" a linha (`na_fila` → `enviando` com update condicional) antes de enviar (teste na Task 2).
2. **Lote enfileirado às 19:58** — o que não couber até 20:00 espera o dia seguinte às 08:00 no fuso do negócio, sem sair às 20:01 nem de madrugada (teste na Task 2).
3. **Cliente com nome de uma palavra só, com acento ou em caixa alta ("ANA", "Júlia")** — primeiro nome no convite sai com a grafia cadastrada e sem quebrar (teste na Task 3).
4. **Cliente que respondeu SAIR depois de entrar na fila** — na hora do envio vira `pulado` com motivo "Pediu para não receber mensagens" e nada sai (teste na Task 2).
5. **Clicar "Enviar convites" duas vezes seguidas** — a mesma cliente não entra duas vezes na fila (teste na Task 4).

---

## File Structure

**Backend — novos**
- `backend/prisma/migrations/20261020120000_whatsapp_envios/migration.sql`
- `backend/src/modules/whatsappFila/fila.rules.ts` — cadência pura.
- `backend/src/modules/whatsappFila/fila.repository.ts`, `fila.service.ts` — enfileirar e processar.
- `backend/src/modules/whatsappRetorno/retorno.rules.ts` — formatação de encaixe e montagem da mensagem.
- `backend/src/modules/whatsappRetorno/retorno.repository.ts`, `retorno.service.ts`, `retorno.types.ts`, `retorno.controller.ts`, `retorno.routes.ts`.
- Testes: `backend/src/__tests__/filaRules.test.ts`, `filaService.test.ts`, `retornoRules.test.ts`, `retornoService.test.ts`.

**Backend — alterados**
- `backend/prisma/schema.prisma`; `backend/src/modules/whatsappInbox/inbox.types.ts` e `inbox.rules.ts` (origem `retorno`); `backend/src/modules/dashboard/today.service.ts` (`proximasVagas` com opções); `backend/src/modules/crm/crm.repository.ts` + `crmMetrics.ts` (`Visita.duracao?`); `backend/src/services/cronService.ts` (rotina da fila); `backend/src/server.ts` (rota).

**Frontend — novos**
- `frontend/src/lib/whatsappRetorno.ts`; proxies `frontend/src/app/api/whatsapp/retorno/route.ts`, `.../retorno/enviar/route.ts`, `.../retorno/testar/route.ts`.
- `frontend/src/components/whatsapp/retorno/HoraDeVoltar.tsx`, `CartaoOportunidade.tsx`, `PreviaConvite.tsx`, `TextoConviteModal.tsx`.
- Testes em `frontend/src/components/whatsapp/__tests__/HoraDeVoltar.test.tsx`.

**Frontend — alterados**
- `frontend/src/components/WhatsAppModule.tsx` (aba nova, primeira); `frontend/src/lib/whatsappInbox.ts` (tipo `Origem` com `retorno`); `docs/design/SEGUIMENTO.md`.

---

### Task 1: Migração da fila de envio

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261020120000_whatsapp_envios/migration.sql`

**Interfaces:**
- Produces: modelo `WhatsappEnvio` (`prisma.whatsappEnvio`), tabela `whatsapp_envios`:
  `id uuid`, `businessId` (`business_id`, FK cascade), `clientId?` (`client_id`, FK SetNull), `phone varchar(20)`, `phoneKey` (`phone_key` varchar(20)), `body text`, `origin varchar(20)`, `scheduledFor` (`agendado_para` timestamptz), `status varchar(12)` default `na_fila` (`na_fila|enviando|enviado|falhou|pulado|cancelado`), `reason?` (`motivo` varchar(160)), `sentAt?` (`enviado_em` timestamptz), `intervalAfterS?` (`intervalo_apos_s` int), `batchId?` (`lote_id` uuid), `createdAt` (`created_at` timestamptz default now). Índices: (`business_id`, `status`, `agendado_para`), (`business_id`, `client_id`, `created_at` desc), (`business_id`, `sent_at` desc). Relações em `Business` e `Client` (`whatsappEnvios WhatsappEnvio[]`).

- [ ] **Step 1:** guardar o schema atual em `$TMP/schema.before.prisma`, editar o schema, `npx prisma validate`, gerar o SQL com `npx prisma migrate diff --from-schema-datamodel "$TMP/schema.before.prisma" --to-schema-datamodel prisma/schema.prisma --script` (sem DROP além dos dois índices conhecidos, que saem do arquivo).
- [ ] **Step 2:** `migration.sql` = SQL gerado + `ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;`.
- [ ] **Step 3:** `npx prisma generate && npx tsc --noEmit` → limpo.
- [ ] **Step 4: Commit** — `feat(db): fila de envio do WhatsApp`.

---

### Task 2: Fila cadenciada (regras, serviço e rotina) e origem `retorno`

**Files:**
- Create: `backend/src/modules/whatsappFila/fila.rules.ts`, `fila.repository.ts`, `fila.service.ts`
- Modify: `backend/src/modules/whatsappInbox/inbox.types.ts` (`Origem` + `'retorno'`), `backend/src/modules/whatsappInbox/inbox.rules.ts` (`ehAutomatica('retorno') === true`, `grupoEnvio('retorno') === 'automaticas'`, `rotuloOrigem('retorno') === 'Convite Hora de voltar'`), `backend/src/services/cronService.ts` (agenda `* * * * *` → `filaEnvios.processar()` dentro do `startReminderCron`)
- Test: `backend/src/__tests__/filaRules.test.ts`, `backend/src/__tests__/filaService.test.ts`; acrescentar os 3 casos de `retorno` em `inboxRules.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage(phone, text, { businessId, origin })` (2C-1); `inboxRecorder.estaEmOptOut(businessId, phone)`; `whatsappService.getStatus(businessId)`; `getBusinessScheduleSettings`; `canonicalizePhone`.
- Produces:
```ts
// fila.rules.ts
export const INTERVALO_MIN_S = 45, INTERVALO_MAX_S = 90, LIMITE_POR_HORA = 25, JANELA_INICIO = '08:00', JANELA_FIM = '20:00';
export function sortearIntervalo(rand?: () => number): number;                    // inteiro em [45, 90]
export function dentroDaJanela(agora: Date, tz: string): boolean;                 // 08:00 <= hora local < 20:00
export function proximaAberturaDaJanela(agora: Date, tz: string): Date;           // agora se dentro; senão próximo 08:00 local
export function podeEnviarAgora(a: { agora: Date; tz: string; ultimo: { em: Date; intervaloS: number } | null; enviadosUltimaHora: number }): boolean;
export function previsaoDeEnvio(a: { agora: Date; tz: string; posicao: number; ultimo: { em: Date; intervaloS: number } | null }): Date; // posicao 0 = próxima; 75 s médios por posição; respeita janela
// fila.service.ts
export interface EnfileirarInput { businessId: string; clientId: string | null; phone: string; body: string; origin: Origem; agendadoPara?: Date; loteId?: string | null }
export interface EnvioDto { id: string; clientId: string | null; status: 'na_fila' | 'enviando' | 'enviado' | 'falhou' | 'pulado' | 'cancelado'; motivo: string | null; agendadoPara: string; enviadoEm: string | null }
export const filaEnvios: {
  enfileirar(itens: EnfileirarInput[]): Promise<EnvioDto[]>;   // não cria se o cliente já tem item 'na_fila' da mesma origem (devolve o existente)
  processar(agora?: Date): Promise<{ enviados: number; pulados: number; falhas: number }>;
  ultimosPorCliente(businessId: string, origin: Origem, clientIds: string[]): Promise<Map<string, EnvioDto>>;
};
```
- Motivos fixos de `pulado`: "Pediu para não receber mensagens" (opt-out), "Consentimento revogado", "Telefone inválido". Falha do provedor → `falhou` com "O WhatsApp não aceitou o envio". Desconectado → continua `na_fila` (sem motivo).

- [ ] **Step 1: Testes de regras** (`filaRules.test.ts`), fuso `America/Sao_Paulo`:
  - `sortearIntervalo(() => 0) === 45`, `sortearIntervalo(() => 0.9999) === 90`.
  - `dentroDaJanela(new Date('2026-10-20T10:59:00Z'))` (07:59 local) → false; `11:00Z` (08:00) → true; `22:59Z` (19:59) → true; `23:00Z` (20:00) → false.
  - `proximaAberturaDaJanela(new Date('2026-10-20T23:30:00Z'))` → `2026-10-21T11:00:00.000Z`; dentro da janela devolve o próprio `agora`.
  - `podeEnviarAgora`: sem último e 0 na hora → true; último há 44 s com intervalo 45 → false; há 46 s → true; `enviadosUltimaHora: 25` → false; fora da janela → false.
  - `previsaoDeEnvio` posição 0 dentro da janela e sem último → `agora`; posição 3 → `agora + 225 s`; lote às 19:58 posição 3 → próximo dia 08:00 + 75 s × (posições que sobrarem depois de 20:00).
- [ ] **Step 2: Testes do serviço** (`filaService.test.ts`, repositório/envio/opt-out/status/fuso mockados):
  - enfileirar duas vezes a mesma cliente com origem `retorno` → 1 item (o segundo devolve o existente).
  - processar: negócio com 2 itens vencidos → envia só 1 (o mais antigo `agendadoPara`) e grava `enviado`, `enviadoEm`, `intervaloAposS` ∈ [45, 90]; chama `sendWhatsAppMessage(phone, body, { businessId, origin: 'retorno' })`.
  - reserva: se o update condicional `na_fila → enviando` não pega a linha (outra rotina pegou), não envia.
  - opt-out na hora → `pulado` "Pediu para não receber mensagens", sem envio; consentimento revogado da cliente → `pulado` "Consentimento revogado".
  - desconectado → nada muda (continua `na_fila`); provedor devolve false → `falhou` "O WhatsApp não aceitou o envio".
  - fora da janela → nada sai; `enviadosUltimaHora = 25` → nada sai.
  - dois negócios com itens → cada um envia 1 no mesmo tick.
- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar** regras, repositório (consultas filtrando `businessId`; reserva via `updateMany({ where: { id, status: 'na_fila' }, data: { status: 'enviando' } })` e conferir `count === 1`) e serviço; a rotina por minuto em `startReminderCron` com `catch` → `logger.warn`. Consentimento revogado = último `client_consents` da cliente com `granted=false` (mesma consulta do lembrete do 2B em `cronService.ts`).
- [ ] **Step 5:** `npx vitest run src/__tests__/filaRules.test.ts src/__tests__/filaService.test.ts src/__tests__/inboxRules.test.ts src/__tests__/inboxConnectionSummary.test.ts` e `npx tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** — `feat(whatsapp): fila de envio cadenciada com janela, limite por hora e SAIR`.

---

### Task 3: Oportunidades e mensagem do convite (regras e serviço)

**Files:**
- Create: `backend/src/modules/whatsappRetorno/retorno.rules.ts`, `retorno.types.ts`, `retorno.repository.ts`, `retorno.service.ts`
- Modify: `backend/src/modules/dashboard/today.service.ts` (`proximasVagas` com opções), `backend/src/modules/crm/crm.repository.ts` + `crmMetrics.ts` (`Visita.duracao?: number` vindo de `s.duration_minutes`)
- Test: `backend/src/__tests__/retornoRules.test.ts`, `backend/src/__tests__/retornoService.test.ts`; caso novo em `dashboardToday.test.ts`

**Interfaces:**
- Consumes: `crmRepository.clientes`, `crmRepository.visitas`, `resumirCliente`, `todayRepository` (agendamentos futuros que ocupam), `filaEnvios.ultimosPorCliente`, `inboxRecorder.estaEmOptOut`.
- Produces:
```ts
// today.service.ts (assinatura estendida; chamadas antigas continuam valendo)
export async function proximasVagas(businessId: string, agora: Date, limite?: number,
  opcoes?: { professionalId?: string; duracaoMinima?: number }): Promise<Array<{ data: string; inicio: string; profissional: string; professionalId: string }>>;
// retorno.rules.ts
export interface Encaixe { inicio: string; curto: string; longo: string }          // inicio ISO; "Qua 14:30"; "Quarta-feira (22/out) às 14:30"
export function formatarEncaixe(data: string, hhmm: string, tz: string): Encaixe;
export function primeiroNome(nome: string): string;
export function montarMensagemRetorno(d: { nome: string; negocio: string; servico: string; profissional: string; dias: number; encaixes: Encaixe[]; link: string | null }): string;
// retorno.types.ts
export interface OportunidadeDto {
  cliente: { id: string; nome: string; telefone: string };
  atrasoDias: number; servico: string; profissional: string; professionalId: string;
  ultimaVisitaHaDias: number; cicloDias: number; valorUltimaVisita: number; encaixes: Encaixe[];
  podeReceber: boolean; motivoBloqueio: string | null; ultimoConviteEm: string | null; envio: EnvioDto | null; texto: string;
}
export interface RetornoDto { resumo: { recuperacaoEstimada: number; oportunidades: number }; linkAgendamento: string | null; numeroNegocio: string | null; itens: OportunidadeDto[] }
export const FiltrosRetorno = z.object({ professionalId: z.string().uuid().optional(), somenteComEncaixe: z.coerce.boolean().optional() });
// retorno.service.ts
export const retornoService: {
  listar(businessId: string, filtros: { professionalId?: string; somenteComEncaixe?: boolean }, agora?: Date, incluirLink?: boolean): Promise<RetornoDto>;
};
```
- `texto` = `montarMensagemRetorno` já preenchido (com link quando `incluirLink` e há página). `cicloDias` = dias entre a última visita e `retornoPrevisto.data`. Motivos de bloqueio: "Consentimento revogado", "Pediu para não receber mensagens".

- [ ] **Step 1: Testes de regras** (`retornoRules.test.ts`):
  - `formatarEncaixe('2026-10-21', '14:30', 'America/Sao_Paulo')` → `{ curto: 'Qua 14:30', longo: 'Quarta-feira (21/out) às 14:30', inicio: '2026-10-21T17:30:00.000Z' }`.
  - `primeiroNome('ANA')` → `'ANA'`; `primeiroNome('  Júlia  Mendes ')` → `'Júlia'`.
  - `montarMensagemRetorno` com 2 encaixes e link → texto exato do spec (linhas "Oi, Beatriz! 💕 Aqui é da equipe do Studio Aurora.", "…seu Manutenção Fibra de Vidro com Camila já completou 39 dias…", "Temos 2 opções para você nesta semana:", "1️⃣ …", "2️⃣ …", "Posso garantir…", "Se preferir, agende sozinha por aqui: https://x/agendar/aurora").
  - 1 encaixe → "Temos uma opção para você nesta semana:" e só "1️⃣"; 0 encaixes → "Me conta o melhor dia para você que eu encontro um horário!" e nenhuma linha 1️⃣; link nulo → sem a última linha.
- [ ] **Step 2: Testes do serviço** (`retornoService.test.ts`, repositórios mockados, `agora = 2026-10-20T13:00:00Z`):
  - entra: ativa, última visita há 39 dias, ciclo 21 → `atrasoDias: 18`; não entra: inativa; última visita há 121 dias; retorno não vencido; com agendamento futuro.
  - ordem por atraso desc, empate por nome.
  - revogado → `podeReceber: false`, "Consentimento revogado"; opt-out → "Pediu para não receber mensagens".
  - `ultimoConviteEm` vem do último envio `retorno` `enviado`; `envio` = último envio da fila (qualquer status).
  - encaixes pedem `proximasVagas(b, agora, 2, { professionalId: <da última visita>, duracaoMinima: <duração do último serviço> })`; profissional inativa → chamada sem `professionalId`.
  - filtros: `professionalId` filtra pela profissional da última visita; `somenteComEncaixe` remove quem não tem encaixe.
  - `recuperacaoEstimada` = soma de `valorUltimaVisita` dos itens filtrados; `oportunidades` = quantidade.
  - `linkAgendamento` = `${FRONTEND_URL}/agendar/${slug}` ou `null` sem slug.
  - `dashboardToday.test.ts`: `proximasVagas` com `professionalId` só devolve vagas dela e com `duracaoMinima: 60` ignora janelas de 30 min.
- [ ] **Step 3: Rodar e ver falhar.** · **Step 4: Implementar.** · **Step 5:** os 3 arquivos + `crmMetrics.test.ts` + `tsc` → PASS.
- [ ] **Step 6: Commit** — `feat(whatsapp): oportunidades da Hora de voltar e mensagem do convite`.

---

### Task 4: API da Hora de voltar

**Files:**
- Create: `backend/src/modules/whatsappRetorno/retorno.controller.ts`, `retorno.routes.ts`
- Modify: `retorno.service.ts` (enviar, testar), `retorno.types.ts` (schemas), `backend/src/server.ts` (montar `app.use(\`${API_V1}/whatsapp/retorno\`, retornoRoutes)` antes de `whatsappRoutes`)
- Test: `backend/src/__tests__/retornoService.test.ts` (casos novos)

**Interfaces:**
- Consumes: Tasks 2–3; `sendWhatsAppMessage`; `whatsappService.getStatus`.
- Produces:
```ts
export const EnviarRetornoSchema = z.object({
  itens: z.array(z.object({ clientId: z.string().uuid(), texto: z.string().trim().min(1).max(4096).optional() })).min(1).max(200),
  incluirLink: z.boolean().default(true),
});
export const TestarRetornoSchema = z.object({ clientId: z.string().uuid(), incluirLink: z.boolean().default(true) });
// retornoService
enviar(businessId: string, input: z.infer<typeof EnviarRetornoSchema>, agora?: Date): Promise<{ envios: EnvioDto[]; recusados: Array<{ clientId: string; motivo: string }> }>;
testar(businessId: string, input: z.infer<typeof TestarRetornoSchema>): Promise<{ enviado: true; para: string }>;
```
- Rotas (guard `[authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')]`): `GET /` (query `FiltrosRetorno` + `incluirLink`), `POST /enviar`, `POST /testar`.
- Regras: `enviar` só aceita clientes que estão na lista atual de oportunidades do negócio (senão `recusados` "Cliente fora da lista"); bloqueadas vão para `recusados` com o motivo; o texto usado é o enviado ou o montado; enfileira com `origin: 'retorno'`, um `loteId` comum quando há mais de 1 item, `agendadoPara = agora` para envio de 1 item. Clicar de novo não duplica (fila devolve o existente). `testar`: desconectado → `ConflictError('WhatsApp desconectado. Reconecte na aba Conexão.')`; sem `Business.whatsapp` → `ValidationError('Cadastre o número do negócio')`; envia o texto da cliente para o número do negócio com `origin: 'sistema'`; falha → `AppError('Não foi possível enviar o teste. Tente de novo.', 502)`.

- [ ] **Step 1: Testes:** lote de 3 (1 revogada) → 2 enfileirados com o mesmo `loteId` e 1 recusado com "Consentimento revogado"; cliente fora da lista → recusado; texto editado chega à fila; mesma cliente duas vezes → 1 envio; `testar` desconectado → 409 com a mensagem; `testar` ok envia para `Business.whatsapp` com o texto montado.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar** serviço, controller (helper `uuid` não é preciso; validação pelo `validate` do projeto) e rotas. · **Step 4:** testes + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): API da Hora de voltar com envio pela fila e teste no próprio número`.

---

### Task 5: Frontend — aba Hora de voltar (lista, filtros, seleção e prévia)

**Files:**
- Create: `frontend/src/lib/whatsappRetorno.ts`, proxies `frontend/src/app/api/whatsapp/retorno/route.ts`, `.../enviar/route.ts`, `.../testar/route.ts`, `frontend/src/components/whatsapp/retorno/HoraDeVoltar.tsx`, `CartaoOportunidade.tsx`, `PreviaConvite.tsx`
- Modify: `frontend/src/components/WhatsAppModule.tsx` (aba `hora-de-voltar`, rótulo "Hora de voltar", primeira; `?aba=hora-de-voltar`), `frontend/src/lib/whatsappInbox.ts` (`Origem` + `'retorno'`)
- Test: `frontend/src/components/whatsapp/__tests__/HoraDeVoltar.test.tsx`; ajustar `WhatsAppModule.test.tsx` (ordem das abas)

**Interfaces:**
- Consumes: rotas da Task 4; tipos espelhando `RetornoDto`, `OportunidadeDto`, `EnvioDto`, `Encaixe`.
- Produces (`whatsappRetorno.ts`): `buscarRetorno(f: { professionalId?: string; somenteComEncaixe?: boolean; incluirLink: boolean })`, `enviarConvites(itens: Array<{ clientId: string; texto?: string }>, incluirLink: boolean)`, `testarConvite(clientId: string, incluirLink: boolean)`; componente `HoraDeVoltar({ conectado })`.

**Tela (ab3e69), por blocos:** cabeçalho ("● RETENÇÃO ATIVA · Sugestões de vagas em aberto", título, descrição, cartões "Recuperação Estimada" com `formatCurrency` e dica no `title`, e "Oportunidades"); barra (filtro Profissional com as profissionais distintas da lista, filtro Atraso "Todos os níveis"/"Apenas com encaixe ideal", "N selecionadas", botão verde "Enviar convites no WhatsApp (N)", "Selecionar todas (N)" que ignora bloqueadas e convidadas há < 7 dias, "Ordenado por: Maior atraso"); cartões (`CartaoOportunidade`: caixa de seleção, iniciais, nome, selo "N dias atrasada", "Serviço · Profissional", "Última visita: há N dias • Ciclo recomendado: N dias", "Encaixes:" chips ou "Sem encaixe nesta semana", "Ver texto", "Enviar"; selos de estado: "Não recebe mensagens" + motivo, "Convite enviado há N dias", "Na fila (envio previsto ~HH:MM)", "Enviado", "Não enviado: motivo"); coluna direita (`PreviaConvite`: "Prévia do WhatsApp", "Tempo real", "Simulação para {nome} · Variáveis preenchidas automaticamente.", balão com nome do negócio e "HOJE" e o `texto` em linhas, chave "Link de auto-agendamento" que refaz a busca com `incluirLink`, desabilitada sem `linkAgendamento` com dica "Publique sua página em Minha página", "Testar envio no meu número" com "Envia exatamente a mensagem acima para {numeroNegocio formatado}", "Dica de conversão"). Clicar num cartão escolhe a cliente da prévia (a primeira por padrão). Vazio e desconectado conforme o spec.

- [ ] **Step 1: Testes** (mock de `@/lib/whatsappRetorno`): mostra cabeçalho, "R$ 1.180,00" e "9"; cartão com "18 dias atrasada", "Manutenção Fibra de Vidro · Camila Rocha", "Última visita: há 39 dias • Ciclo recomendado: 21 dias", chips "Qua 14:30" "Qui 10:00"; bloqueada sem caixa e com "Não recebe mensagens"; "Selecionar todas" não marca bloqueadas nem convidadas há 3 dias; botão mostra a contagem; filtro Profissional pede `buscarRetorno({ professionalId })`; filtro "Apenas com encaixe ideal" pede `somenteComEncaixe: true`; clicar no cartão troca "Simulação para …" e o texto da prévia; chave do link refaz a busca com `incluirLink: false`; vazio; desconectado (faixa e botões desabilitados); aba "Hora de voltar" é a primeira do módulo.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** · **Step 4:** `npx vitest run src/components/whatsapp src/__tests__/themeCompliance.test.ts --testTimeout=30000` + `tsc` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): aba Hora de voltar com oportunidades, filtros e prévia`.

---

### Task 6: Frontend — envio, "Ver texto", teste e celular

**Files:**
- Create: `frontend/src/components/whatsapp/retorno/TextoConviteModal.tsx`
- Modify: `HoraDeVoltar.tsx`, `CartaoOportunidade.tsx`, `PreviaConvite.tsx`
- Test: `HoraDeVoltar.test.tsx` (casos novos)

**Interfaces:**
- Produces: `TextoConviteModal({ isOpen, nome, textoInicial, podeEnviar, onClose, onEnviar(texto) })`.

**Comportamento:** "Enviar" do cartão → `enviarConvites([{ clientId }], incluirLink)`; convidada há < 7 dias → confirmação "Ela já recebeu um convite há N dias. Enviar de novo?" antes. "Ver texto" abre o modal com o texto editável (até 4096) e "Enviar este texto" → `enviarConvites([{ clientId, texto }])`. Lote → `enviarConvites(selecionadas)`; depois do envio: toast "N convites na fila. Envio espaçado para proteger seu número." (+ "M não enviados" quando houver `recusados`), recarrega a lista (estados "Na fila…"), limpa a seleção. "Testar envio no meu número" → `testarConvite`; sucesso toast "Teste enviado para {número}"; erro → toast com `getApiErrorMessage`. Celular (< lg): coluna única; a prévia some (o "Ver texto" faz o papel dela); barra com "Enviar convites (N)" fixa no rodapé quando há seleção, acima da navegação inferior do app.

- [ ] **Step 1: Testes:** enviar individual chama a API com `incluirLink` atual e o cartão passa a "Na fila"; convidada recente pede confirmação (cancelar não envia); modal edita e envia o texto editado; lote com 1 recusado mostra "1 não enviado" no toast; testar envio sucesso/erro; celular sem a coluna de prévia e com a barra fixa.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** · **Step 4:** mesmos comandos da Task 5 → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): envio dos convites, texto editável e teste no próprio número`.

---

### Task 7: Documentação e verificação final

- [ ] **Step 1:** `docs/design/SEGUIMENTO.md`: registrar o 2C-2a (migração `20261020120000_whatsapp_envios`; fila cadenciada 45–90 s, 25/h, 08–20 h; origem `retorno`; quem aparece/pode receber; intervalo de 7 dias; decisões do Claude marcadas no spec) e que a fila será reaproveitada pelas Campanhas; acrescentar o índice parcial `whatsapp_messages_business_provider_key` à nota de índices fora do schema, se ainda não estiver.
- [ ] **Step 2:** verificação completa: backend `npx tsc --noEmit` + `npx vitest run`; frontend `npx tsc --noEmit` + `npx vitest run --testTimeout=30000` + `npx next build` (um build por vez, sem apagar `.next`).
- [ ] **Step 3: Commit** — `chore(2C-2a): seguimento e verificação final`.
- [ ] **Step 4 (controller):** pedir ao dono autorização para aplicar `20261020120000_whatsapp_envios` em produção; conferir a tela lado a lado com o ab3e69 (servidor de exemplo local) e no celular.
