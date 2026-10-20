# WhatsApp: Conversas e base de envio (sub-projeto 2C-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda mensagem de WhatsApp que entra ou sai do negócio fica guardada; a dona atende as clientes pela aba Conversas (assumir, devolver ao robô, respostas rápidas, contexto da cliente), vê saúde e histórico reais na aba Conexão, e quem responde SAIR para de receber mensagens automáticas — fiel às telas "Ajustada" do Stitch.

**Architecture:** Novo módulo backend `modules/whatsappInbox/` com regras puras (`inbox.rules.ts`), repositório Prisma, um "gravador" (`inbox.recorder.ts`) chamado pelo ponto único de saída (`sendWhatsAppMessage`) e pelo webhook (`messagesUpsertHandler`, `MESSAGES_UPDATE`), uma API REST de conversas e um resumo de conexão. Gravar nunca derruba envio. O frontend reorganiza o módulo WhatsApp em três abas do Stitch (Automações · Conversas · Conexão) e cria a central em três colunas.

**Tech Stack:** Node/Express, Prisma 5 (PostgreSQL/Supabase), Zod, Vitest; Evolution API v2 (webhook por evento); Next.js 15 App Router, React, Tailwind (tokens), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-whatsapp-conversas-design.md`

## Global Constraints

- Idioma: português do Brasil em tela, erros e commits. Botões em frase normal (maiúscula só na primeira palavra).
- Planos visíveis: Solo / Equipe / Salão. Nunca "Pro".
- Cores só por token (`bg-brand`, `text-ink`, `text-muted`, `bg-surface`, `bg-surface-2`, `border-line`, `text-success-text`, `text-warning-text`, `text-danger`, `text-whatsapp`, `bg-whatsapp`…). `frontend/src/__tests__/themeCompliance.test.ts` reprova cor fixa e pasta/arquivo novo não registrado em `frontend/src/lib/themedPaths.ts`.
- Ícones: Material Symbols via `<Icon name="..."/>` de `@/components/ui`. Nenhum `lucide-react` em arquivo novo.
- Referência visual (versão nova) em `docs/design/stitch/projeto/`: Conexão `studio-aurora-whatsapp-conexao-e-limites-ajustada--ff12c8.html`; Conversas `studio-aurora-whatsapp-central-de-conversas-ajustada--4ea360.html`. Tradução de classes Stitch → tokens: ver `frontend/src/components/comanda/ComandaModal.tsx` (mapeado no 2A).
- Nenhum dado de exemplo: bloco sem dado mostra estado vazio ou some. Nada de `conteudoDemo` nas telas do WhatsApp ao fim.
- Palavra de opt-out: **SAIR** (aceitos também PARAR, CANCELAR, STOP, DESCADASTRAR); reativação: **VOLTAR**. Texto inteiro da mensagem, ignorando maiúsculas, acentos, espaços e pontuação nas pontas.
- Quem entra na central (regra B): cliente cadastrada do negócio, ou número com conversa já existente, ou número com sessão do robô ativa (já respondeu/recebeu o menu). Outros números: mensagem não é gravada com texto.
- Volta automática ao robô: **12 h** sem mensagem numa conversa `humano`. Finalizar conversa do robô: **24 h** sem mensagem. Retenção de mensagens: **180 dias**. Limite recomendado: **250 envios/dia**.
- Gravar mensagem nunca bloqueia nem derruba envio/robô: erro de gravação vira `logger.warn`.
- Datas no fuso do negócio (`getBusinessScheduleSettings(businessId).timezone`, `todayInTimezone` de `backend/src/utils/businessDate.ts`).
- Chave de telefone: `canonicalizePhone` de `backend/src/services/whatsapp/utils/phoneUtils.ts` (DDD + 8 dígitos, tira 55 e o 9 extra). Coluna `phone` guarda os dígitos como recebidos (para exibir e enviar); `phone_key` guarda a forma canônica (para comparar).
- Comandos: backend `cd backend && npx vitest run <arquivo>` / `npx tsc --noEmit`; frontend `cd frontend && npx vitest run <arquivo>` / `npx tsc --noEmit`. A máquina é lenta: teste que estoura 5 s na suíte inteira deve ser reexecutado sozinho (ou com `--testTimeout=30000`) antes de ser tratado como falha.
- Nunca rodar `prisma migrate deploy`/`migrate dev`/`db push` nem subir servidores: o `.env` aponta para produção; aplicar migração é com o controller, com o dono.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Mesma mensagem chegando duas vezes (Evolution reentrega) e eco `fromMe` da mensagem que o próprio sistema enviou** — nenhuma linha duplicada; o eco só atualiza a existente (testes nas Tasks 2 e 4).
2. **SAIR com variações ("Sair", " sair! ", "SAÍR", "parar") e texto que só contém a palavra no meio ("não quero sair hoje")** — só o texto inteiro conta; o robô não responde depois do SAIR (testes nas Tasks 2 e 4).
3. **Conversa com uma pessoa atendendo e a cliente manda mensagem** — o robô fica calado; após 12 h sem mensagem volta ao robô (testes nas Tasks 4 e 5).
4. **Funcionária tentando responder/assumir conversa de outra pessoa ou id que não é UUID** — 403 "Esta conversa está com outra pessoa" / 404 "Conversa não encontrada", nunca 500 (testes na Task 6).
5. **"Envios de hoje" perto da meia-noite em fuso diferente de UTC** — conta pelo dia do negócio, não pelo dia UTC (teste na Task 7).

## Rulings já tomadas no plano (ver ledger)

- `politica_message` fica em `whatsapp_bot_config` (e não em `business_settings` como diz a spec): é onde o painel Mensagens já salva os textos do robô, mesmo endpoint `PUT /whatsapp/config`. Custo se errado: mover uma coluna.
- `whatsapp_messages.conversation_id` é **nulo** para envios a números fora da regra B (ex.: teste de envio para o próprio número): a linha existe só para contagem/histórico, com `body` vazio. Custo: nenhum dado pessoal guardado desses números.
- Conversa de número sem cadastro começa na **primeira resposta do robô** (é quando a sessão do robô passa a existir); a primeira mensagem dessa pessoa não é gravada. Custo: a dona não vê o "oi" inicial de um número novo.
- O envio pelo painel responde `{ enviado: true }` e o frontend recarrega as mensagens (o id da mensagem só existe depois do envio).

---

## File Structure

**Backend — novos**
- `backend/prisma/migrations/20261016120000_whatsapp_conversas/migration.sql`
- `backend/src/modules/whatsappInbox/inbox.types.ts` — tipos, constantes e schemas Zod.
- `backend/src/modules/whatsappInbox/inbox.rules.ts` — funções puras (palavra-chave, mídia, prévia, grupos, saúde, máscara, status de entrega).
- `backend/src/modules/whatsappInbox/inbox.repository.ts` — acesso Prisma.
- `backend/src/modules/whatsappInbox/inbox.recorder.ts` — gravação de entrada/saída/eco/entrega, opt-out, atendimento humano.
- `backend/src/modules/whatsappInbox/inbox.cron.ts` — volta ao robô, finalização e limpeza.
- `backend/src/modules/whatsappInbox/inbox.service.ts` — API de conversas.
- `backend/src/modules/whatsappInbox/quickReplies.ts` — respostas rápidas.
- `backend/src/modules/whatsappInbox/connectionSummary.ts` — resumo da aba Conexão.
- `backend/src/modules/whatsappInbox/inbox.controller.ts`, `inbox.routes.ts`.
- Testes: `backend/src/__tests__/inboxRules.test.ts`, `inboxRecorder.test.ts`, `inboxOutbound.test.ts`, `inboxInbound.test.ts`, `inboxCron.test.ts`, `inboxService.test.ts`, `inboxQuickReplies.test.ts`, `inboxConnectionSummary.test.ts`.

**Backend — alterados**
- `backend/prisma/schema.prisma`; `backend/src/server.ts` (rota, cron, `syncAllWebhooks` na subida); `backend/src/services/whatsapp/whatsappMessageService.ts` (contexto `origin`/`sentByUserId`, gravação, opt-out); `backend/src/services/whatsappClient.ts` (repassa o id da Evolution); `backend/src/services/whatsapp/whatsappFlowService.ts` (`businessId`/`origin` no contexto, "Falar com um humano"); `backend/src/services/whatsapp/handlers/messagesUpsertHandler.ts`; `backend/src/services/whatsapp/handlers/connectionUpdateHandler.ts`; `backend/src/modules/whatsapp/webhook.handler.ts`; `backend/src/modules/whatsapp/evolution-api.service.ts` (`WEBHOOK_EVENTS`); `backend/src/services/cronService.ts`, `backend/src/modules/appointments/appointments.service.ts`, `backend/src/modules/comandas/receipt.ts`, `backend/src/routes/whatsapp.ts` (`origin` nos envios; `politica_message` no GET/PUT `/config`); `backend/src/modules/dashboard/today.service.ts` (exporta `proximasVagas`); `backend/src/utils/errors.ts` ("Conversa" feminina).

**Frontend — novos**
- `frontend/src/lib/whatsappInbox.ts` — tipos + API.
- `frontend/src/components/whatsapp/conversas/` — `CentralConversas.tsx`, `FilaConversas.tsx`, `ConversaAberta.tsx`, `ContextoCliente.tsx`, `RespostasRapidas.tsx`.
- `frontend/src/components/whatsapp/AutomacoesProvisorio.tsx` — hospeda Menu/Mensagens/Simulador até o 2C-2.
- Proxies Next em `frontend/src/app/api/whatsapp/conversations/...` e `frontend/src/app/api/whatsapp/connection/summary/route.ts`.
- Testes em `frontend/src/components/whatsapp/__tests__/`.

**Frontend — alterados**
- `frontend/src/components/WhatsAppModule.tsx` (abas do Stitch, `?aba=`, sem barra lateral), `frontend/src/components/whatsapp/ConnectionPanel.tsx` (reescrito na versão ff12c8), `frontend/src/components/whatsapp/MessageConfigPanel.tsx` (campo Política), `frontend/src/components/clients/ClientFormModal.tsx` (`initialPhone`), `frontend/src/lib/conteudoDemo.ts` (sai `whatsapp`), `frontend/src/lib/themedPaths.ts`, `docs/design/SEGUIMENTO.md`.

---
### Task 1: Migração e schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261016120000_whatsapp_conversas/migration.sql`

**Interfaces:**
- Produces: modelos Prisma `WhatsappConversation` (`prisma.whatsappConversation`), `WhatsappMessage` (`prisma.whatsappMessage`), `WhatsappOptOut` (`prisma.whatsappOptOut`); campos `Business.whatsappConnectedAt: Date | null`, `WhatsappBotConfig.politicaMessage: string | null`.

- [ ] **Step 1: Guardar o schema atual** (para gerar o SQL sem banco):
```bash
cd backend
TMP=$(mktemp -d) && cp prisma/schema.prisma "$TMP/schema.before.prisma" && echo $TMP
```

- [ ] **Step 2: Editar `schema.prisma`.**

Em `model Business`, perto de `whatsappInstanceName`:
```prisma
  whatsappConnectedAt          DateTime? @map("whatsapp_connected_at") @db.Timestamptz(6)
```
Nas relações de `Business`:
```prisma
  whatsappConversations WhatsappConversation[]
  whatsappMessages      WhatsappMessage[]
  whatsappOptOuts       WhatsappOptOut[]
```
Em `model WhatsappBotConfig`, depois de `instagramMessage`:
```prisma
  politicaMessage                  String?  @map("politica_message") @db.Text
```
Em `model Client`, nas relações: `whatsappConversations WhatsappConversation[]`.
Em `model User`, nas relações:
```prisma
  whatsappConversationsAssigned WhatsappConversation[] @relation("ConversationAssignee")
  whatsappMessagesSent          WhatsappMessage[]      @relation("MessageSender")
```
No fim do arquivo:
```prisma
// ─── WhatsApp: central de conversas (2C-1) ──────────────────────────────────

model WhatsappConversation {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId         String    @map("business_id") @db.Uuid
  phone              String    @db.VarChar(20)
  phoneKey           String    @map("phone_key") @db.VarChar(20)
  clientId           String?   @map("client_id") @db.Uuid
  handler            String    @default("bot") @db.VarChar(10)
  assignedUserId     String?   @map("assigned_user_id") @db.Uuid
  status             String    @default("aberta") @db.VarChar(12)
  lastMessageAt      DateTime  @default(now()) @map("last_message_at") @db.Timestamptz(6)
  lastMessagePreview String    @default("") @map("last_message_preview") @db.VarChar(160)
  lastInboundAt      DateTime? @map("last_inbound_at") @db.Timestamptz(6)
  unreadCount        Int       @default(0) @map("unread_count")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  business     Business          @relation(fields: [businessId], references: [id], onDelete: Cascade)
  client       Client?           @relation(fields: [clientId], references: [id], onDelete: SetNull)
  assignedUser User?             @relation("ConversationAssignee", fields: [assignedUserId], references: [id], onDelete: SetNull)
  messages     WhatsappMessage[]

  @@unique([businessId, phoneKey])
  @@index([businessId, status, lastMessageAt(sort: Desc)])
  @@map("whatsapp_conversations")
}

model WhatsappMessage {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId        String    @map("business_id") @db.Uuid
  conversationId    String?   @map("conversation_id") @db.Uuid
  phoneKey          String    @map("phone_key") @db.VarChar(20)
  direction         String    @db.VarChar(3)
  origin            String    @db.VarChar(20)
  body              String    @default("") @db.Text
  mediaType         String?   @map("media_type") @db.VarChar(12)
  providerMessageId String?   @map("provider_message_id") @db.VarChar(128)
  status            String    @db.VarChar(10)
  sentByUserId      String?   @map("sent_by_user_id") @db.Uuid
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  business     Business              @relation(fields: [businessId], references: [id], onDelete: Cascade)
  conversation WhatsappConversation? @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sentByUser   User?                 @relation("MessageSender", fields: [sentByUserId], references: [id], onDelete: SetNull)

  @@index([conversationId, createdAt])
  @@index([businessId, direction, createdAt])
  @@map("whatsapp_messages")
}

model WhatsappOptOut {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  businessId    String    @map("business_id") @db.Uuid
  phoneKey      String    @map("phone_key") @db.VarChar(20)
  clientId      String?   @map("client_id") @db.Uuid
  keyword       String    @db.VarChar(20)
  optedOutAt    DateTime  @default(now()) @map("opted_out_at") @db.Timestamptz(6)
  reactivatedAt DateTime? @map("reactivated_at") @db.Timestamptz(6)

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@unique([businessId, phoneKey])
  @@map("whatsapp_opt_outs")
}
```

- [ ] **Step 3: Validar e gerar o SQL sem banco**
```bash
cd backend
npx prisma validate
npx prisma migrate diff --from-schema-datamodel "$TMP/schema.before.prisma" --to-schema-datamodel prisma/schema.prisma --script > "$TMP/2c1.sql"
grep -n "DROP" "$TMP/2c1.sql"
```
Expected: schema válido. O SQL tem `CREATE TABLE` das três tabelas, `CREATE INDEX`, `ALTER TABLE "businesses" ADD COLUMN "whatsapp_connected_at"`, `ALTER TABLE "whatsapp_bot_config" ADD COLUMN "politica_message"` e `ADD CONSTRAINT ... FOREIGN KEY`. **Se aparecer `DROP INDEX "tags_business_id_lower_name_key"`, apague essa linha** (índice do 2B fora do schema, ver `docs/design/SEGUIMENTO.md`). Nenhum outro `DROP`.

- [ ] **Step 4: Montar `migrations/20261016120000_whatsapp_conversas/migration.sql`** = SQL gerado (sem o DROP acima) + no fim:
```sql
-- Mensagem da Evolution gravada uma vez só por negócio (reentrega do webhook e eco fromMe).
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_business_provider_key"
  ON "whatsapp_messages" ("business_id", "provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_opt_outs      ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5:** `cd backend && npx prisma generate && npx tsc --noEmit` → client gerado, tipos limpos.

- [ ] **Step 6: Commit**
```bash
git add backend/prisma
git commit -m "feat(db): conversas, mensagens e opt-out do WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras, repositório e gravador

**Files:**
- Create: `backend/src/modules/whatsappInbox/inbox.types.ts`, `inbox.rules.ts`, `inbox.repository.ts`, `inbox.recorder.ts`
- Modify: `backend/src/utils/errors.ts` (adicionar `'Conversa'` em `RECURSOS_FEMININOS`)
- Test: `backend/src/__tests__/inboxRules.test.ts`, `backend/src/__tests__/inboxRecorder.test.ts`

**Interfaces:**
- Produces (`inbox.types.ts`):
```ts
export type Direcao = 'in' | 'out';
export type Origem = 'cliente' | 'bot' | 'lembrete' | 'confirmacao' | 'pix_recibo' | 'lista_espera'
  | 'manual_painel' | 'manual_celular' | 'sistema' | 'painel_evento';
export type StatusMensagem = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou';
export type Atendimento = 'bot' | 'humano';
export type StatusConversa = 'aberta' | 'aguardando' | 'finalizada';
export const LIMITE_DIARIO = 250;
export const HORAS_VOLTA_ROBO = 12;
export const HORAS_FINALIZAR_ROBO = 24;
export const DIAS_RETENCAO = 180;
```
  `painel_evento` = linha central só do painel ("Carla assumiu o atendimento"); nunca é enviada e nunca conta como envio (`direction: 'out'`, `status: 'enviada'`, `providerMessageId: null`).
- Produces (`inbox.rules.ts`):
```ts
export function detectarPalavraChave(texto: string | null | undefined): 'sair' | 'voltar' | null;
export function marcadorMidia(messageType: string | null | undefined): { mediaType: string; marcador: string } | null;
export function previa(texto: string): string;                 // até 160 chars, uma linha
export function ehAutomatica(origem: Origem): boolean;         // bloqueada por opt-out
export function grupoEnvio(origem: Origem): 'automaticas' | 'pix' | 'manuais' | null;
export function saudeEnvios(envios: number, falhas: number): 'Excelente' | 'Boa' | 'Atenção';
export function mascararTelefone(digitos: string): string;     // "+55 83 99611-****"
export function statusDeEntrega(raw: unknown): 'entregue' | 'lida' | null;
export function avancaStatus(atual: StatusMensagem, novo: 'entregue' | 'lida'): boolean;
export function rotuloOrigem(origem: Origem): string;
```
- Produces (`inbox.recorder.ts`) — todas **nunca lançam** (capturam e fazem `logger.warn`):
```ts
export interface SaidaInput { businessId: string; phone: string; body: string; origem: Origem;
  providerMessageId: string | null; status: 'enviada' | 'falhou'; sentByUserId?: string | null; }
export interface EntradaInput { businessId: string; phone: string; texto: string | null; messageType: string | null;
  providerMessageId: string | null; sessaoRoboAtiva: boolean; }
export interface ConversaGravada { id: string; handler: Atendimento; status: StatusConversa; clientId: string | null }
export const inboxRecorder: {
  registrarSaida(i: SaidaInput): Promise<void>;
  registrarEntrada(i: EntradaInput): Promise<ConversaGravada | null>;   // null = fora da regra B ou sem conteúdo
  registrarEco(i: { businessId: string; phone: string; texto: string | null; messageType: string | null; providerMessageId: string | null }): Promise<void>;
  atualizarEntrega(i: { businessId: string; providerMessageId: string; status: 'entregue' | 'lida' }): Promise<void>;
  estaEmOptOut(businessId: string, phone: string): Promise<boolean>;
  registrarOptOut(i: { businessId: string; phone: string; keyword: string }): Promise<void>;   // + consentimento revogado se cliente
  registrarOptIn(i: { businessId: string; phone: string }): Promise<void>;                      // + consentimento concedido se cliente
  pedirAtendimentoHumano(businessId: string, phone: string): Promise<void>;
};
```
- Produces (`inbox.repository.ts`): `inboxRepository` com os métodos do Step 4 (as Tasks 5–7 acrescentam métodos novos ao mesmo objeto).

- [ ] **Step 1: Testes das regras** (`inboxRules.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { detectarPalavraChave, marcadorMidia, previa, ehAutomatica, grupoEnvio, saudeEnvios,
  mascararTelefone, statusDeEntrega, avancaStatus } from '../modules/whatsappInbox/inbox.rules.js';

describe('detectarPalavraChave', () => {
  it.each(['SAIR', 'sair', ' Sair! ', 'SAÍR', 'parar', 'Cancelar.', 'stop', 'descadastrar'])('"%s" é sair', (t) =>
    expect(detectarPalavraChave(t)).toBe('sair'));
  it.each(['voltar', 'VOLTAR!', ' Voltar '])('"%s" é voltar', (t) => expect(detectarPalavraChave(t)).toBe('voltar'));
  it.each(['não quero sair hoje', 'sair amanhã', 'oi', ''])('"%s" não é palavra-chave', (t) =>
    expect(detectarPalavraChave(t)).toBeNull());
  it('nulo e indefinido', () => {
    expect(detectarPalavraChave(null)).toBeNull();
    expect(detectarPalavraChave(undefined)).toBeNull();
  });
});

describe('marcadorMidia', () => {
  it('mapeia os tipos da Evolution', () => {
    expect(marcadorMidia('imageMessage')).toEqual({ mediaType: 'imagem', marcador: '[Foto]' });
    expect(marcadorMidia('audioMessage')).toEqual({ mediaType: 'audio', marcador: '[Áudio]' });
    expect(marcadorMidia('videoMessage')).toEqual({ mediaType: 'video', marcador: '[Vídeo]' });
    expect(marcadorMidia('documentMessage')).toEqual({ mediaType: 'documento', marcador: '[Documento]' });
    expect(marcadorMidia('documentWithCaptionMessage')).toEqual({ mediaType: 'documento', marcador: '[Documento]' });
    expect(marcadorMidia('stickerMessage')).toEqual({ mediaType: 'figurinha', marcador: '[Figurinha]' });
  });
  it('texto e desconhecido não têm marcador', () => {
    expect(marcadorMidia('conversation')).toBeNull();
    expect(marcadorMidia('extendedTextMessage')).toBeNull();
    expect(marcadorMidia(null)).toBeNull();
  });
});

it('previa junta linhas e corta em 160', () => {
  expect(previa('oi\n\ntudo bem?')).toBe('oi tudo bem?');
  expect(previa('a'.repeat(200))).toHaveLength(160);
});

it('automáticas e grupos', () => {
  expect(ehAutomatica('lembrete')).toBe(true);
  expect(ehAutomatica('confirmacao')).toBe(true);
  expect(ehAutomatica('lista_espera')).toBe(true);
  for (const o of ['bot', 'pix_recibo', 'manual_painel', 'manual_celular', 'sistema'] as const) expect(ehAutomatica(o)).toBe(false);
  expect(grupoEnvio('lembrete')).toBe('automaticas');
  expect(grupoEnvio('lista_espera')).toBe('automaticas');
  expect(grupoEnvio('pix_recibo')).toBe('pix');
  expect(grupoEnvio('bot')).toBe('manuais');
  expect(grupoEnvio('manual_celular')).toBe('manuais');
  expect(grupoEnvio('sistema')).toBeNull();
  expect(grupoEnvio('painel_evento')).toBeNull();
});

it('saúde pela taxa de falha', () => {
  expect(saudeEnvios(0, 0)).toBe('Excelente');
  expect(saudeEnvios(100, 1)).toBe('Excelente');
  expect(saudeEnvios(100, 2)).toBe('Boa');
  expect(saudeEnvios(100, 7)).toBe('Boa');
  expect(saudeEnvios(100, 8)).toBe('Atenção');
});

it('mascara telefone', () => {
  expect(mascararTelefone('5583996112233')).toBe('+55 83 99611-****');
  expect(mascararTelefone('8396112233')).toBe('+55 83 9611-****');
  expect(mascararTelefone('')).toBe('');
});

it('status de entrega da Evolution e sem regredir', () => {
  expect(statusDeEntrega('DELIVERY_ACK')).toBe('entregue');
  expect(statusDeEntrega('READ')).toBe('lida');
  expect(statusDeEntrega('PLAYED')).toBe('lida');
  expect(statusDeEntrega(3)).toBe('entregue');
  expect(statusDeEntrega(4)).toBe('lida');
  expect(statusDeEntrega('SERVER_ACK')).toBeNull();
  expect(avancaStatus('enviada', 'entregue')).toBe(true);
  expect(avancaStatus('entregue', 'lida')).toBe(true);
  expect(avancaStatus('lida', 'entregue')).toBe(false);
  expect(avancaStatus('falhou', 'lida')).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar:** `cd backend && npx vitest run src/__tests__/inboxRules.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `inbox.types.ts` (Interfaces acima) e `inbox.rules.ts`:**
```ts
import type { Origem, StatusMensagem } from './inbox.types.js';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const PALAVRAS_SAIR = new Set(['sair', 'parar', 'cancelar', 'stop', 'descadastrar']);

export function detectarPalavraChave(texto: string | null | undefined): 'sair' | 'voltar' | null {
  if (!texto) return null;
  const t = semAcento(texto).toLowerCase().trim().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (PALAVRAS_SAIR.has(t)) return 'sair';
  if (t === 'voltar') return 'voltar';
  return null;
}

const MIDIAS: Record<string, { mediaType: string; marcador: string }> = {
  imageMessage: { mediaType: 'imagem', marcador: '[Foto]' },
  audioMessage: { mediaType: 'audio', marcador: '[Áudio]' },
  pttMessage: { mediaType: 'audio', marcador: '[Áudio]' },
  videoMessage: { mediaType: 'video', marcador: '[Vídeo]' },
  documentMessage: { mediaType: 'documento', marcador: '[Documento]' },
  documentWithCaptionMessage: { mediaType: 'documento', marcador: '[Documento]' },
  stickerMessage: { mediaType: 'figurinha', marcador: '[Figurinha]' },
};
export const marcadorMidia = (t: string | null | undefined) => (t && MIDIAS[t]) || null;

export const previa = (texto: string) => texto.replace(/\s+/g, ' ').trim().slice(0, 160);

const AUTOMATICAS = new Set<Origem>(['lembrete', 'confirmacao', 'lista_espera']);
export const ehAutomatica = (o: Origem) => AUTOMATICAS.has(o);

export function grupoEnvio(o: Origem): 'automaticas' | 'pix' | 'manuais' | null {
  if (o === 'lembrete' || o === 'confirmacao' || o === 'lista_espera') return 'automaticas';
  if (o === 'pix_recibo') return 'pix';
  if (o === 'manual_painel' || o === 'manual_celular' || o === 'bot') return 'manuais';
  return null;
}

export function saudeEnvios(envios: number, falhas: number): 'Excelente' | 'Boa' | 'Atenção' {
  if (envios <= 0) return 'Excelente';
  const taxa = falhas / envios;
  if (taxa < 0.02) return 'Excelente';
  if (taxa < 0.08) return 'Boa';
  return 'Atenção';
}

export function mascararTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  if (!d) return '';
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);
  return `+55 ${ddd} ${numero.slice(0, numero.length - 4)}-****`;
}

export function statusDeEntrega(raw: unknown): 'entregue' | 'lida' | null {
  const v = typeof raw === 'number' ? raw : String(raw ?? '').toUpperCase();
  if (v === 'DELIVERY_ACK' || v === 3) return 'entregue';
  if (v === 'READ' || v === 'PLAYED' || v === 4 || v === 5) return 'lida';
  return null;
}

const ORDEM: Record<StatusMensagem, number> = { falhou: -1, recebida: 0, enviada: 1, entregue: 2, lida: 3 };
export const avancaStatus = (atual: StatusMensagem, novo: 'entregue' | 'lida') => ORDEM[atual] >= 1 && ORDEM[novo] > ORDEM[atual];

const ROTULOS: Record<Origem, string> = {
  cliente: 'Mensagem da cliente', bot: 'Resposta do robô', lembrete: 'Lembrete de agendamento',
  confirmacao: 'Confirmação de agendamento', pix_recibo: 'Sinal Pix e recibo', lista_espera: 'Oferta da lista de espera',
  manual_painel: 'Resposta manual via painel', manual_celular: 'Mensagem pelo celular', sistema: 'Teste de envio',
  painel_evento: 'Evento do painel',
};
export const rotuloOrigem = (o: Origem) => ROTULOS[o];
```
Rodar `npx vitest run src/__tests__/inboxRules.test.ts` → PASS.

- [ ] **Step 4: Repositório (`inbox.repository.ts`).** Tudo filtrando por `businessId`:
```ts
import { prisma } from '../../config/prisma.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';

export const inboxRepository = {
  /** Cliente do negócio com o mesmo telefone canônico (pré-filtro pelos 8 últimos dígitos, igualdade em JS). */
  async clientePorTelefone(businessId: string, phone: string): Promise<{ id: string; name: string } | null> {
    const chave = canonicalizePhone(phone);
    if (!chave) return null;
    const fim = chave.slice(-8);
    const candidatos = await prisma.$queryRaw<Array<{ id: string; name: string; phone: string }>>`
      SELECT id, name, phone FROM clients
       WHERE business_id = ${businessId}::uuid AND right(regexp_replace(phone, '\D', '', 'g'), 8) = ${fim}`;
    return candidatos.find((c) => canonicalizePhone(c.phone) === chave) ?? null;
  },
  conversaPorChave: (businessId: string, phoneKey: string) =>
    prisma.whatsappConversation.findUnique({ where: { businessId_phoneKey: { businessId, phoneKey } } }),
  criarConversa: (d: { businessId: string; phone: string; phoneKey: string; clientId: string | null }) =>
    prisma.whatsappConversation.upsert({
      where: { businessId_phoneKey: { businessId: d.businessId, phoneKey: d.phoneKey } },
      create: d, update: {},
    }),
  atualizarConversa: (id: string, data: Prisma.WhatsappConversationUncheckedUpdateInput) =>
    prisma.whatsappConversation.update({ where: { id }, data }),
  /** Insere ignorando duplicata de provider_message_id; devolve false se já existia. */
  async inserirMensagem(d: {
    businessId: string; conversationId: string | null; phoneKey: string; direction: 'in' | 'out'; origin: string;
    body: string; mediaType: string | null; providerMessageId: string | null; status: string; sentByUserId: string | null;
  }): Promise<boolean> {
    if (d.providerMessageId) {
      const existe = await prisma.whatsappMessage.findFirst({ where: { businessId: d.businessId, providerMessageId: d.providerMessageId }, select: { id: true } });
      if (existe) return false;
    }
    try { await prisma.whatsappMessage.create({ data: d }); return true; }
    catch (e) { if ((e as { code?: string }).code === 'P2002') return false; throw e; }
  },
  mensagemPorProvider: (businessId: string, providerMessageId: string) =>
    prisma.whatsappMessage.findFirst({ where: { businessId, providerMessageId }, select: { id: true, status: true } }),
  atualizarStatusMensagem: (id: string, status: string) => prisma.whatsappMessage.update({ where: { id }, data: { status } }),
  optOutAtivo: (businessId: string, phoneKey: string) =>
    prisma.whatsappOptOut.findFirst({ where: { businessId, phoneKey, reactivatedAt: null }, select: { id: true } }),
  gravarOptOut: (d: { businessId: string; phoneKey: string; clientId: string | null; keyword: string }) =>
    prisma.whatsappOptOut.upsert({
      where: { businessId_phoneKey: { businessId: d.businessId, phoneKey: d.phoneKey } },
      create: d, update: { keyword: d.keyword, clientId: d.clientId, optedOutAt: new Date(), reactivatedAt: null },
    }),
  reativarOptOut: (businessId: string, phoneKey: string) =>
    prisma.whatsappOptOut.updateMany({ where: { businessId, phoneKey, reactivatedAt: null }, data: { reactivatedAt: new Date() } }),
  registrarConsentimento: (d: { businessId: string; clientId: string; granted: boolean }) =>
    prisma.clientConsent.create({ data: { businessId: d.businessId, clientId: d.clientId, granted: d.granted, channel: 'whatsapp' } }),
};
```
(`Prisma` vem de `@prisma/client`; `prisma` de `../../config/prisma.js`, como em `connectionUpdateHandler.ts`. Confira o nome do campo composto `businessId_phoneKey` no client gerado. O `'\D'` dentro do template do `$queryRaw` precisa chegar ao Postgres como `\D`: confirme o escape conferindo o SQL no log de debug do Prisma ou num teste rápido de `canonicalizePhone` — se o TypeScript pedir, use `'\\D'`.)

- [ ] **Step 5: Testes do gravador** (`inboxRecorder.test.ts`, mockando o repositório como em `waitlist.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  clientePorTelefone: vi.fn(), conversaPorChave: vi.fn(), criarConversa: vi.fn(), atualizarConversa: vi.fn(),
  inserirMensagem: vi.fn(), mensagemPorProvider: vi.fn(), atualizarStatusMensagem: vi.fn(),
  optOutAtivo: vi.fn(), gravarOptOut: vi.fn(), reativarOptOut: vi.fn(), registrarConsentimento: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const { inboxRecorder } = await import('../modules/whatsappInbox/inbox.recorder.js');

const B = 'b1';
const TEL = '5583999990000';
const CONV = { id: 'cv1', handler: 'bot', status: 'aberta', clientId: null, unreadCount: 0 };
const entrada = (over: Record<string, unknown> = {}) => ({
  businessId: B, phone: TEL, texto: 'oi', messageType: 'conversation', providerMessageId: 'm1', sessaoRoboAtiva: false, ...over,
});
beforeEach(() => {
  vi.clearAllMocks();
  repo.clientePorTelefone.mockResolvedValue(null);
  repo.conversaPorChave.mockResolvedValue(null);
  repo.criarConversa.mockResolvedValue(CONV);
  repo.atualizarConversa.mockImplementation(async (_id: string, data: object) => ({ ...CONV, ...data }));
  repo.inserirMensagem.mockResolvedValue(true);
  repo.optOutAtivo.mockResolvedValue(null);
});

describe('registrarEntrada — regra B', () => {
  it('número desconhecido sem sessão do robô: não grava nada', async () => {
    expect(await inboxRecorder.registrarEntrada(entrada())).toBeNull();
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
    expect(repo.criarConversa).not.toHaveBeenCalled();
  });
  it('cliente cadastrada: cria conversa vinculada e grava', async () => {
    repo.clientePorTelefone.mockResolvedValue({ id: 'c1', name: 'Maria' });
    repo.criarConversa.mockResolvedValue({ ...CONV, clientId: 'c1' });
    const r = await inboxRecorder.registrarEntrada(entrada());
    expect(r?.clientId).toBe('c1');
    expect(repo.criarConversa).toHaveBeenCalledWith(expect.objectContaining({ businessId: B, phoneKey: '8399990000', clientId: 'c1' }));
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'in', origin: 'cliente', status: 'recebida', body: 'oi', providerMessageId: 'm1' }));
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ lastMessagePreview: 'oi', unreadCount: { increment: 1 } }));
  });
  it('sessão do robô ativa: grava mesmo sem cadastro', async () => {
    expect(await inboxRecorder.registrarEntrada(entrada({ texto: '1', sessaoRoboAtiva: true }))).not.toBeNull();
  });
  it('mídia sem legenda vira marcador; com legenda junta', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarEntrada(entrada({ texto: null, messageType: 'imageMessage' }));
    expect(repo.inserirMensagem).toHaveBeenLastCalledWith(expect.objectContaining({ body: '[Foto]', mediaType: 'imagem' }));
    await inboxRecorder.registrarEntrada(entrada({ texto: 'olha', messageType: 'imageMessage', providerMessageId: 'm2' }));
    expect(repo.inserirMensagem).toHaveBeenLastCalledWith(expect.objectContaining({ body: '[Foto] olha' }));
  });
  it('sem texto e sem mídia: não grava', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    expect(await inboxRecorder.registrarEntrada(entrada({ texto: null, messageType: 'reactionMessage' }))).toBeNull();
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
  it('duplicata (inserirMensagem=false) não mexe na conversa', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    repo.inserirMensagem.mockResolvedValue(false);
    await inboxRecorder.registrarEntrada(entrada());
    expect(repo.atualizarConversa).not.toHaveBeenCalled();
  });
  it('conversa humana vira "aguardando"; finalizada reabre', async () => {
    repo.conversaPorChave.mockResolvedValue({ ...CONV, handler: 'humano', status: 'aberta' });
    const r = await inboxRecorder.registrarEntrada(entrada());
    expect(r?.handler).toBe('humano');
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ status: 'aguardando' }));
    repo.conversaPorChave.mockResolvedValue({ ...CONV, status: 'finalizada' });
    await inboxRecorder.registrarEntrada(entrada({ providerMessageId: 'm2' }));
    expect(repo.atualizarConversa).toHaveBeenLastCalledWith('cv1', expect.objectContaining({ status: 'aberta' }));
  });
  it('erro do repositório não lança', async () => {
    repo.conversaPorChave.mockRejectedValue(new Error('db'));
    await expect(inboxRecorder.registrarEntrada(entrada())).resolves.toBeNull();
  });
});

describe('registrarSaida', () => {
  it('fora da regra B: grava só para contagem, sem conversa e sem texto', async () => {
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'teste', origem: 'sistema', providerMessageId: 'p1', status: 'enviada' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ conversationId: null, body: '', direction: 'out', origin: 'sistema' }));
    expect(repo.criarConversa).not.toHaveBeenCalled();
  });
  it('resposta do robô cria a conversa do número novo', async () => {
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'Menu', origem: 'bot', providerMessageId: 'p1', status: 'enviada' });
    expect(repo.criarConversa).toHaveBeenCalled();
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'cv1', body: 'Menu' }));
  });
  it('conversa existente: atualiza prévia sem somar não lida', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'Olá', origem: 'lembrete', providerMessageId: null, status: 'falhou' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou' }));
    const data = repo.atualizarConversa.mock.calls[0]![1];
    expect(data.lastMessagePreview).toBe('Olá');
    expect(data.unreadCount).toBeUndefined();
  });
  it('erro do repositório não lança', async () => {
    repo.conversaPorChave.mockRejectedValue(new Error('db'));
    await expect(inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'x', origem: 'bot', providerMessageId: null, status: 'enviada' })).resolves.toBeUndefined();
  });
});

describe('registrarEco (fromMe)', () => {
  it('eco do que o sistema enviou: não duplica', async () => {
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'enviada' });
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'Olá', messageType: 'conversation', providerMessageId: 'p1' });
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
  it('digitado no celular para conversa existente: grava manual_celular', async () => {
    repo.mensagemPorProvider.mockResolvedValue(null);
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'Já te respondo', messageType: 'conversation', providerMessageId: 'p9' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'out', origin: 'manual_celular', status: 'enviada' }));
  });
  it('digitado no celular para número fora da regra B: não grava', async () => {
    repo.mensagemPorProvider.mockResolvedValue(null);
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'oi mãe', messageType: 'conversation', providerMessageId: 'p9' });
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
});

describe('entrega, opt-out e humano', () => {
  it('atualizarEntrega não regride', async () => {
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'lida' });
    await inboxRecorder.atualizarEntrega({ businessId: B, providerMessageId: 'p1', status: 'entregue' });
    expect(repo.atualizarStatusMensagem).not.toHaveBeenCalled();
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'enviada' });
    await inboxRecorder.atualizarEntrega({ businessId: B, providerMessageId: 'p1', status: 'lida' });
    expect(repo.atualizarStatusMensagem).toHaveBeenCalledWith('x', 'lida');
  });
  it('opt-out de cliente revoga consentimento; opt-in concede', async () => {
    repo.clientePorTelefone.mockResolvedValue({ id: 'c1', name: 'Maria' });
    await inboxRecorder.registrarOptOut({ businessId: B, phone: TEL, keyword: 'sair' });
    expect(repo.gravarOptOut).toHaveBeenCalledWith({ businessId: B, phoneKey: '8399990000', clientId: 'c1', keyword: 'sair' });
    expect(repo.registrarConsentimento).toHaveBeenCalledWith({ businessId: B, clientId: 'c1', granted: false });
    await inboxRecorder.registrarOptIn({ businessId: B, phone: TEL });
    expect(repo.reativarOptOut).toHaveBeenCalledWith(B, '8399990000');
    expect(repo.registrarConsentimento).toHaveBeenLastCalledWith({ businessId: B, clientId: 'c1', granted: true });
  });
  it('opt-out de número sem cadastro grava sem consentimento', async () => {
    await inboxRecorder.registrarOptOut({ businessId: B, phone: TEL, keyword: 'parar' });
    expect(repo.gravarOptOut).toHaveBeenCalled();
    expect(repo.registrarConsentimento).not.toHaveBeenCalled();
  });
  it('estaEmOptOut pela chave canônica (com ou sem 9 e 55)', async () => {
    repo.optOutAtivo.mockResolvedValue({ id: 'o' });
    expect(await inboxRecorder.estaEmOptOut(B, '(83) 99999-0000')).toBe(true);
    expect(repo.optOutAtivo).toHaveBeenCalledWith(B, '8399990000');
    repo.optOutAtivo.mockRejectedValue(new Error('db'));
    expect(await inboxRecorder.estaEmOptOut(B, TEL)).toBe(false);
  });
  it('pedirAtendimentoHumano põe a conversa na fila "aguardando" sem responsável', async () => {
    await inboxRecorder.pedirAtendimentoHumano(B, TEL);
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'humano', status: 'aguardando', assignedUserId: null });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar.** `npx vitest run src/__tests__/inboxRecorder.test.ts` → FAIL.

- [ ] **Step 7: Implementar `inbox.recorder.ts`.** Regras:
  - `chave = canonicalizePhone(phone)`; `digitos = phone.replace(/\D/g, '')`. Chave vazia → retorna `null`/nada.
  - **corpo:** `midia = marcadorMidia(messageType)`; `body = midia ? [midia.marcador, texto?.trim()].filter(Boolean).join(' ') : (texto?.trim() ?? '')`.
  - **Entrada:** `body` vazio → `null`. Conversa = `conversaPorChave(businessId, chave)`; senão, `cliente = clientePorTelefone(...)`; se `cliente` ou `sessaoRoboAtiva` → `criarConversa({ businessId, phone: digitos, phoneKey: chave, clientId: cliente?.id ?? null })`; senão `null`. Conversa existente com `clientId` nulo → tenta `clientePorTelefone` e inclui `clientId` no update. `inserirMensagem({ businessId, conversationId, phoneKey: chave, direction:'in', origin:'cliente', body, mediaType: midia?.mediaType ?? null, providerMessageId, status:'recebida', sentByUserId:null })`; `false` → retorna `{ id, handler, status, clientId }` da conversa sem update. Update: `{ lastMessageAt: agora, lastInboundAt: agora, lastMessagePreview: previa(body), unreadCount: { increment: 1 }, status: handler === 'humano' ? 'aguardando' : 'aberta' }` (+`clientId` quando achado). Retorna a conversa com o status novo.
  - **Saída:** conversa = existente → senão cria se `clientePorTelefone` achou ou `origem === 'bot'` → senão nenhuma. Sem conversa: `inserirMensagem` com `conversationId: null, body: ''`. Com conversa: grava `body`, atualiza `{ lastMessageAt: agora, lastMessagePreview: previa(body) }` (sem `unreadCount`). `mediaType: null`, `sentByUserId: i.sentByUserId ?? null`.
  - **Eco:** `providerMessageId` e `mensagemPorProvider` acha → nada. Senão conversa existente, ou cria se cliente cadastrada; sem conversa → nada. Grava `out`/`manual_celular`/`enviada` com o mesmo cálculo de `body`; vazio → nada; atualiza prévia.
  - **Entrega:** `mensagemPorProvider` → se `avancaStatus(atual.status, novo)` → `atualizarStatusMensagem(id, novo)`.
  - **Opt-out/opt-in:** `cliente = clientePorTelefone`; `gravarOptOut({ businessId, phoneKey, clientId, keyword })` / `reativarOptOut(businessId, phoneKey)`; com cliente → `registrarConsentimento({ businessId, clientId, granted: false|true })`.
  - **Humano:** conversa existente ou `criarConversa` (com `clientePorTelefone`); `atualizarConversa(id, { handler: 'humano', status: 'aguardando', assignedUserId: null })`.
  - Cada função em `try/catch` → `logger.warn({ err, businessId }, 'inbox: <função> falhou')` (logger de `../../utils/logger.js`); `estaEmOptOut` devolve `false` no erro.
  Rodar os dois arquivos de teste → PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 8: Commit**
```bash
git add backend/src/modules/whatsappInbox backend/src/__tests__/inboxRules.test.ts backend/src/__tests__/inboxRecorder.test.ts backend/src/utils/errors.ts
git commit -m "feat(whatsapp): regras e gravador da central de conversas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Saída — todo envio é gravado e respeita o opt-out

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappMessageService.ts` (contexto + gravação + opt-out)
- Modify: `backend/src/services/whatsappClient.ts` (`sendWhatsAppText` repassa o id da Evolution)
- Modify (origem nos chamadores): `backend/src/services/whatsapp/whatsappFlowService.ts` (`sendContext`), `backend/src/services/cronService.ts`, `backend/src/modules/appointments/appointments.service.ts`, `backend/src/modules/comandas/receipt.ts`, `backend/src/routes/whatsapp.ts` (`/test-send`, `/debug-send`)
- Test: `backend/src/__tests__/inboxOutbound.test.ts`; ajustar asserts de `receipt.test.ts`, `reminderCron.test.ts` e outros que comparem o contexto de `sendWhatsAppMessage` por igualdade exata

**Interfaces:**
- Consumes: `inboxRecorder.registrarSaida`, `inboxRecorder.estaEmOptOut` (Task 2); `ehAutomatica` (Task 2).
- Produces: `SendWhatsAppMessageContext` ganha
```ts
  origin?: Origem;                 // de '../../modules/whatsappInbox/inbox.types.js'
  sentByUserId?: string | null;
  onProviderResult?: (r: { providerMessageId: string | null }) => void;   // usado por sendWhatsAppText
```
  Regra: grava quando `context.businessId` existe e `context.simulate !== true`; `origin` ausente grava como `'sistema'`.

- [ ] **Step 1: Teste** (`inboxOutbound.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const client = vi.hoisted(() => ({ sendWhatsAppText: vi.fn() }));
vi.mock('../services/whatsappClient.js', () => client);
const recorder = vi.hoisted(() => ({ registrarSaida: vi.fn(), estaEmOptOut: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));

const { sendWhatsAppMessage } = await import('../services/whatsapp/whatsappMessageService.js');

beforeEach(() => {
  vi.clearAllMocks();
  recorder.estaEmOptOut.mockResolvedValue(false);
  client.sendWhatsAppText.mockImplementation(async (_p: string, _m: string, ctx: { onProviderResult?: (r: { providerMessageId: string | null }) => void }) => {
    ctx.onProviderResult?.({ providerMessageId: 'EVO-1' });
    return true;
  });
});

it('grava o envio com origem, id da Evolution e autor', async () => {
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'manual_painel', sentByUserId: 'u1' })).toBe(true);
  expect(recorder.registrarSaida).toHaveBeenCalledWith({
    businessId: 'b1', phone: '5583999990000', body: 'Olá', origem: 'manual_painel',
    providerMessageId: 'EVO-1', status: 'enviada', sentByUserId: 'u1',
  });
});

it('falha do provedor grava "falhou"', async () => {
  client.sendWhatsAppText.mockResolvedValue(false);
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'lembrete' })).toBe(false);
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou', providerMessageId: null, origem: 'lembrete' }));
});

it('exceção do provedor também grava "falhou" e devolve false', async () => {
  client.sendWhatsAppText.mockRejectedValue(new Error('timeout'));
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'bot' })).toBe(false);
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou' }));
});

it('sem businessId ou em simulação não grava', async () => {
  await sendWhatsAppMessage('5583999990000', 'Olá', {});
  await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', simulate: true });
  expect(recorder.registrarSaida).not.toHaveBeenCalled();
});

it('origem ausente grava como sistema', async () => {
  await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1' });
  expect(recorder.registrarSaida).toHaveBeenCalledWith(expect.objectContaining({ origem: 'sistema' }));
});

it('automática para número em opt-out não é enviada nem gravada', async () => {
  recorder.estaEmOptOut.mockResolvedValue(true);
  expect(await sendWhatsAppMessage('5583999990000', 'Lembrete', { businessId: 'b1', origin: 'lembrete' })).toBe(false);
  expect(client.sendWhatsAppText).not.toHaveBeenCalled();
  expect(recorder.registrarSaida).not.toHaveBeenCalled();
});

it('manual, recibo e robô saem mesmo com opt-out', async () => {
  recorder.estaEmOptOut.mockResolvedValue(true);
  for (const origin of ['manual_painel', 'pix_recibo', 'bot'] as const) {
    expect(await sendWhatsAppMessage('5583999990000', 'x', { businessId: 'b1', origin })).toBe(true);
  }
  expect(recorder.estaEmOptOut).not.toHaveBeenCalled();
});

it('erro ao gravar não muda o resultado do envio', async () => {
  recorder.registrarSaida.mockRejectedValue(new Error('db'));
  expect(await sendWhatsAppMessage('5583999990000', 'Olá', { businessId: 'b1', origin: 'bot' })).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar:** `cd backend && npx vitest run src/__tests__/inboxOutbound.test.ts` → FAIL.

- [ ] **Step 3: Implementar em `whatsappMessageService.ts`:**
```ts
import { inboxRecorder } from '../../modules/whatsappInbox/inbox.recorder.js';
import { ehAutomatica } from '../../modules/whatsappInbox/inbox.rules.js';
import type { Origem } from '../../modules/whatsappInbox/inbox.types.js';
// SendWhatsAppMessageContext: + origin?, sentByUserId?, onProviderResult? (ver Interfaces)

const gravarSaida = async (phone: string, body: string, context: SendWhatsAppMessageContext, enviado: boolean, providerMessageId: string | null) => {
  if (!context.businessId || context.simulate === true) return;
  try {
    await inboxRecorder.registrarSaida({
      businessId: context.businessId, phone, body, origem: (context.origin ?? 'sistema') as Origem,
      providerMessageId, status: enviado ? 'enviada' : 'falhou', sentByUserId: context.sentByUserId ?? null,
    });
  } catch (err) {
    logger.warn({ err }, 'inbox: gravar saída falhou');
  }
};
```
Dentro de `sendWhatsAppMessage`, depois das validações de telefone/texto e **antes** do `simulate`:
```ts
    const origem = (context.origin ?? 'sistema') as Origem;
    if (context.businessId && ehAutomatica(origem) && await inboxRecorder.estaEmOptOut(context.businessId, normalizedPhone)) {
      logger.info(logContext, 'Mensagem automática não enviada: número em opt-out (SAIR)');
      return false;
    }
```
Troque a chamada ao provedor por:
```ts
    let providerMessageId: string | null = null;
    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage, {
      ...context,
      onProviderResult: (r) => { providerMessageId = r.providerMessageId; context.onProviderResult?.(r); },
    });
    await gravarSaida(normalizedPhone, normalizedMessage, context, Boolean(sent), providerMessageId);
```
e no `catch` geral: `await gravarSaida(normalizedPhone, normalizedMessage, context, false, null);` antes do `return false`.

- [ ] **Step 4: `whatsappClient.ts` — id da Evolution.** Em `sendWhatsAppText`, logo depois de `const sendResultData = sendResult as Record<string, unknown> | null;`:
```ts
    const payload = sendResultData?.payload as { key?: { id?: unknown } } | null | undefined;
    const providerMessageId = typeof payload?.key?.id === 'string' ? payload.key.id : null;
    (context as { onProviderResult?: (r: { providerMessageId: string | null }) => void }).onProviderResult?.({ providerMessageId });
```
(Adicione `onProviderResult?: (r: { providerMessageId: string | null }) => void` ao tipo `SendWhatsAppTextContext` em vez do cast, se o tipo for local do arquivo.) A Evolution v2 responde ao `sendText` com `{ key: { id, remoteJid, fromMe }, ... }`.

- [ ] **Step 5: Origem nos chamadores:**
  - `whatsappFlowService.ts` (`sendContext`, ~linha 1817): incluir `...(businessId ? { businessId } : {}), origin: 'bot',` usando o `businessId` que a função já resolve (procure a variável `businessId` disponível no escopo de `handleIncomingMessage`; se o nome for outro, use-o).
  - `cronService.ts` (lembrete): `{ businessId: appointment.businessId, origin: 'lembrete' }`.
  - `appointments.service.ts:123`: `{ businessId, origin: 'confirmacao' }`.
  - `comandas/receipt.ts:35`: `{ businessId, origin: 'pix_recibo' }`.
  - `routes/whatsapp.ts` `/test-send` e `/debug-send` (envio para o próprio número): `origin: 'sistema'` junto do `businessId` já passado (se não passam `businessId`, passe `req.user.businessId`).
  - Procure outros chamadores com `grep -rn "sendWhatsAppMessage(" backend/src --include=*.ts | grep -v __tests__` e dê a origem que corresponde (Pix/sinal → `pix_recibo`; aviso de agendamento → `confirmacao`).

- [ ] **Step 6: Rodar:** `npx vitest run src/__tests__/inboxOutbound.test.ts src/__tests__/whatsappMessageServiceSimulator.test.ts src/__tests__/receipt.test.ts src/__tests__/reminderCron.test.ts src/__tests__/whatsappFlowService.test.ts src/__tests__/whatsappClientSendDestination.test.ts` → PASS (ajuste só os asserts que comparam o objeto de contexto por igualdade exata para incluir `origin`; não mude comportamento). Depois `npx vitest run` inteiro e `npx tsc --noEmit`.

- [ ] **Step 7: Commit**
```bash
git add backend/src
git commit -m "feat(whatsapp): todo envio é gravado com origem e respeita o SAIR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Entrada — gravar, SAIR/VOLTAR, eco do celular e robô calado no atendimento humano

**Files:**
- Modify: `backend/src/services/whatsapp/handlers/messagesUpsertHandler.ts`
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts` (caso `'attendant'`)
- Test: `backend/src/__tests__/inboxInbound.test.ts`; acrescentar mocks em `backend/src/__tests__/messagesUpsertHandler.test.ts` (ver Step 5)

**Interfaces:**
- Consumes: `inboxRecorder.registrarEntrada | registrarEco | registrarOptOut | registrarOptIn | pedirAtendimentoHumano` (Task 2); `detectarPalavraChave` (Task 2); `getSession`, `isSessionExpired` de `backend/src/services/whatsapp/whatsappSessionService.ts`; `sendWhatsAppMessage` com `origin` (Task 3); `extractPhoneFromJid` de `../utils/phoneUtils.js`.
- Produces: `MessagesUpsertResult.reason` ganha `'opt_out' | 'opt_in' | 'human_handler'`. Textos fixos:
```ts
export const TEXTO_OPT_OUT = (negocio: string) =>
  `Pronto, você não vai mais receber mensagens automáticas do ${negocio}. Para voltar a receber, responda VOLTAR.`;
export const TEXTO_OPT_IN = (negocio: string) =>
  `Tudo certo! Você voltou a receber os lembretes e avisos do ${negocio}.`;
```
  (exportados de `messagesUpsertHandler.ts`).

- [ ] **Step 1: Teste** (`inboxInbound.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const tenant = vi.hoisted(() => ({ resolveTenant: vi.fn() }));
vi.mock('../services/whatsapp/tenant/tenantResolver.js', () => tenant);
const bot = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('../bot/botOrchestrator.js', () => bot);
const sessions = vi.hoisted(() => ({ getSession: vi.fn(), isSessionExpired: vi.fn() }));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => sessions);
const msg = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => msg);
const recorder = vi.hoisted(() => ({
  registrarEntrada: vi.fn(), registrarEco: vi.fn(), registrarOptOut: vi.fn(), registrarOptIn: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));

const { handleMessagesUpsert, TEXTO_OPT_OUT } = await import('../services/whatsapp/handlers/messagesUpsertHandler.js');

let seq = 0;
const payload = (over: { text?: string | null; fromMe?: boolean; type?: string; jid?: string } = {}) => ({
  event: 'messages.upsert',
  instance: 'loja_1',
  sender: '5583988887777@s.whatsapp.net',
  data: {
    key: { id: `MSG-${++seq}`, remoteJid: over.jid ?? '5583999990000@s.whatsapp.net', fromMe: over.fromMe ?? false },
    pushName: 'Maria',
    messageType: over.type ?? 'conversation',
    message: over.text === null ? { imageMessage: {} } : { conversation: over.text ?? 'oi' },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  tenant.resolveTenant.mockResolvedValue({ business: { id: 'b1', name: 'Studio Aurora', instanceName: 'loja_1' }, connectedNumber: '5583988887777', subscriptionStatus: 'active' });
  sessions.getSession.mockResolvedValue(null);
  sessions.isSessionExpired.mockReturnValue(false);
  recorder.registrarEntrada.mockResolvedValue({ id: 'cv1', handler: 'bot', status: 'aberta', clientId: 'c1' });
  bot.process.mockResolvedValue({ ok: true, responseSent: true });
  msg.sendWhatsAppMessage.mockResolvedValue(true);
});

it('grava a entrada e segue para o robô', async () => {
  const r = await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(r.ok).toBe(true);
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', texto: 'oi', messageType: 'conversation', sessaoRoboAtiva: false }));
  expect(bot.process).toHaveBeenCalled();
});

it('sessão do robô ativa é repassada ao gravador', async () => {
  sessions.getSession.mockResolvedValue({ id: 's', step: 'menu' });
  await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ sessaoRoboAtiva: true }));
});

it('SAIR: registra opt-out, responde e o robô não processa', async () => {
  const r = await handleMessagesUpsert(payload({ text: ' Sair! ' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('opt_out');
  expect(recorder.registrarOptOut).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', keyword: 'sair' }));
  expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith(expect.any(String), TEXTO_OPT_OUT('Studio Aurora'), expect.objectContaining({ businessId: 'b1', origin: 'sistema' }));
  expect(bot.process).not.toHaveBeenCalled();
});

it('VOLTAR: registra opt-in e o robô não processa', async () => {
  const r = await handleMessagesUpsert(payload({ text: 'voltar' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('opt_in');
  expect(recorder.registrarOptIn).toHaveBeenCalled();
  expect(bot.process).not.toHaveBeenCalled();
});

it('"não quero sair hoje" segue para o robô', async () => {
  await handleMessagesUpsert(payload({ text: 'não quero sair hoje' }), { instanceName: 'loja_1' });
  expect(recorder.registrarOptOut).not.toHaveBeenCalled();
  expect(bot.process).toHaveBeenCalled();
});

it('conversa em atendimento humano: robô calado', async () => {
  recorder.registrarEntrada.mockResolvedValue({ id: 'cv1', handler: 'humano', status: 'aguardando', clientId: 'c1' });
  const r = await handleMessagesUpsert(payload({ text: 'oi?' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('human_handler');
  expect(bot.process).not.toHaveBeenCalled();
});

it('mídia sem legenda é gravada mas o robô não roda (sem texto)', async () => {
  const r = await handleMessagesUpsert(payload({ text: null, type: 'imageMessage' }), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).toHaveBeenCalledWith(expect.objectContaining({ messageType: 'imageMessage' }));
  expect(r.reason).toBe('no_text');
  expect(bot.process).not.toHaveBeenCalled();
});

it('fromMe: grava como eco com o telefone do destinatário e não roda o robô', async () => {
  const r = await handleMessagesUpsert(payload({ fromMe: true, text: 'Já te respondo' }), { instanceName: 'loja_1' });
  expect(r.reason).toBe('from_me');
  expect(recorder.registrarEco).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', phone: '5583999990000', texto: 'Já te respondo' }));
  expect(recorder.registrarEntrada).not.toHaveBeenCalled();
  expect(bot.process).not.toHaveBeenCalled();
});

it('grupo não é gravado', async () => {
  await handleMessagesUpsert(payload({ jid: '120363000000@g.us' }), { instanceName: 'loja_1' });
  expect(recorder.registrarEntrada).not.toHaveBeenCalled();
});

it('falha do gravador não impede o robô', async () => {
  recorder.registrarEntrada.mockResolvedValue(null);
  await handleMessagesUpsert(payload(), { instanceName: 'loja_1' });
  expect(bot.process).toHaveBeenCalled();
});
```
(Se `parseEvolutionWebhook`/`resolveAuthorPhone` exigirem outro formato de payload, copie o formato usado em `messagesUpsertHandler.test.ts` e mantenha os mesmos casos.)

- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/__tests__/inboxInbound.test.ts` → FAIL.

- [ ] **Step 3: Implementar em `messagesUpsertHandler.ts`.**
  1. **Passo 2 (fromMe):** antes do `return { ok: false, reason: 'from_me' }`, gravar o eco sem alterar o retorno:
```ts
    const destino = parsed.remoteJid && !parsed.remoteJid.endsWith('@g.us') ? extractPhoneFromJid(parsed.remoteJid) : null;
    const tenantEco = destino ? await resolveTenant(instanceName ?? parsed.instanceName) : null;
    if (tenantEco && destino) {
      await inboxRecorder.registrarEco({ businessId: tenantEco.business.id, phone: destino, texto: parsed.text, messageType: parsed.messageType, providerMessageId: parsed.messageId });
    }
```
  2. **Depois do Passo 7 (deduplicação) e antes do Passo 8 (texto):** ignorar grupos (`parsed.remoteJid?.endsWith('@g.us')` → segue o fluxo atual sem gravar) e
```ts
    const phone = resolved.phone as string;
    const businessId = tenant.business.id;
    const sessao = await getSession(phone, businessId).catch(() => null);
    const conversa = await inboxRecorder.registrarEntrada({
      businessId, phone, texto: parsed.text, messageType: parsed.messageType, providerMessageId: parsed.messageId,
      sessaoRoboAtiva: Boolean(sessao && !isSessionExpired(sessao)),
    });

    const palavra = detectarPalavraChave(parsed.text);
    if (palavra) {
      const resposta = palavra === 'sair' ? TEXTO_OPT_OUT(tenant.business.name) : TEXTO_OPT_IN(tenant.business.name);
      if (palavra === 'sair') await inboxRecorder.registrarOptOut({ businessId, phone, keyword: 'sair' });
      else await inboxRecorder.registrarOptIn({ businessId, phone });
      await sendWhatsAppMessage(phone, resposta, { businessId, instanceName: effectiveInstance, origin: 'sistema' });
      return { ok: true, reason: palavra === 'sair' ? 'opt_out' : 'opt_in', authorPhone: phone, businessId };
    }

    if (conversa?.handler === 'humano') {
      logger.info({ instanceName: effectiveInstance, businessId }, 'msg_handler: human_handler');
      return { ok: true, reason: 'human_handler', authorPhone: phone, businessId };
    }
```
  (Grave `keyword` com a palavra efetivamente enviada normalizada é opcional; `'sair'` basta.)
  3. Passos 8–10 seguem iguais.

- [ ] **Step 4: "Falar com um humano"** em `whatsappFlowService.ts`, `case 'attendant':` — depois de enviar `config.attendant_message` e antes do `deleteSession`:
```ts
      await inboxRecorder.pedirAtendimentoHumano(businessId, phone);
```
(import de `../../modules/whatsappInbox/inbox.recorder.js`; o recorder nunca lança.) Em `whatsappFlowService.test.ts`, adicionar `vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: { pedirAtendimentoHumano: vi.fn() } }))` e um caso: opção "Falar com um humano" chama `pedirAtendimentoHumano` com o negócio e o telefone.

- [ ] **Step 5: Manter `messagesUpsertHandler.test.ts` passando:** acrescente nele os mesmos `vi.mock` de `whatsappSessionService.js`, `whatsappMessageService.js` e `inbox.recorder.js` do Step 1 (com `registrarEntrada` resolvendo `null`), sem mudar os asserts existentes.

- [ ] **Step 6: Rodar:** `npx vitest run src/__tests__/inboxInbound.test.ts src/__tests__/messagesUpsertHandler.test.ts src/__tests__/whatsappFlowService.test.ts src/__tests__/whatsappWebhookRoute.test.ts src/__tests__/whatsappAntiSelf.test.ts` → PASS; `npx tsc --noEmit`.

- [ ] **Step 7: Commit**
```bash
git add backend/src
git commit -m "feat(whatsapp): mensagens recebidas gravadas, SAIR/VOLTAR e robô calado no atendimento humano

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Entrega, conexão e rotinas (volta ao robô, finalização, limpeza)

**Files:**
- Create: `backend/src/services/whatsapp/handlers/messagesUpdateHandler.ts`, `backend/src/modules/whatsappInbox/inbox.cron.ts`
- Modify: `backend/src/modules/whatsapp/webhook.handler.ts` (caso `'messages-update'`), `backend/src/modules/whatsapp/evolution-api.service.ts` (`WEBHOOK_EVENTS`), `backend/src/services/whatsapp/handlers/connectionUpdateHandler.ts` (`whatsapp_connected_at`), `backend/src/services/cronService.ts` (agendamentos), `backend/src/server.ts` (`syncAllWebhooks` na subida), `backend/src/modules/whatsappInbox/inbox.repository.ts` (métodos novos)
- Test: `backend/src/__tests__/inboxCron.test.ts` (inclui o handler de entrega); ajustar `evolutionApiServiceWebhookConfig.test.ts` se ele fixa a lista de eventos

**Interfaces:**
- Consumes: `inboxRecorder.atualizarEntrega`, `statusDeEntrega` (Task 2); `resolveTenant`.
- Produces:
```ts
// messagesUpdateHandler.ts
export const handleMessagesUpdate: (raw: unknown, ctx: { instanceName?: string | null }) => Promise<{ atualizadas: number }>;
// inbox.cron.ts
export const inboxCron: {
  voltarAoRoboPorInatividade(agora?: Date): Promise<number>;   // humano sem msg há 12 h → bot + finalizada + evento
  finalizarConversasDoRobo(agora?: Date): Promise<number>;      // bot aberta sem msg há 24 h → finalizada
  limparAntigas(agora?: Date): Promise<{ mensagens: number; conversas: number }>;
};
// inbox.repository.ts (novos)
conversasHumanasParadas(antesDe: Date): Promise<Array<{ id: string; businessId: string; phoneKey: string }>>;
finalizarConversasDoRobo(antesDe: Date): Promise<number>;                 // updateMany handler=bot, status != finalizada, lastMessageAt < antesDe
apagarMensagensAntigas(antesDe: Date): Promise<number>;                   // deleteMany createdAt < antesDe
apagarConversasVazias(antesDe: Date): Promise<number>;                    // sem mensagens e lastMessageAt < antesDe
```

- [ ] **Step 1: Teste** (`inboxCron.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  conversasHumanasParadas: vi.fn(), atualizarConversa: vi.fn(), inserirMensagem: vi.fn(),
  finalizarConversasDoRobo: vi.fn(), apagarMensagensAntigas: vi.fn(), apagarConversasVazias: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const recorder = vi.hoisted(() => ({ atualizarEntrega: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: recorder }));
const tenant = vi.hoisted(() => ({ resolveTenant: vi.fn() }));
vi.mock('../services/whatsapp/tenant/tenantResolver.js', () => tenant);
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { inboxCron } = await import('../modules/whatsappInbox/inbox.cron.js');
const { handleMessagesUpdate } = await import('../services/whatsapp/handlers/messagesUpdateHandler.js');

const AGORA = new Date('2026-10-16T15:00:00.000Z');
beforeEach(() => { vi.clearAllMocks(); repo.inserirMensagem.mockResolvedValue(true); });

it('volta ao robô após 12 h sem mensagem e registra o evento', async () => {
  repo.conversasHumanasParadas.mockResolvedValue([{ id: 'cv1', businessId: 'b1', phoneKey: '8399990000' }]);
  expect(await inboxCron.voltarAoRoboPorInatividade(AGORA)).toBe(1);
  expect(repo.conversasHumanasParadas).toHaveBeenCalledWith(new Date('2026-10-16T03:00:00.000Z'));
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'bot', status: 'finalizada', assignedUserId: null });
  expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({
    conversationId: 'cv1', origin: 'painel_evento', body: 'Voltou ao robô por inatividade', direction: 'out', providerMessageId: null,
  }));
});

it('finaliza conversas do robô paradas há 24 h', async () => {
  repo.finalizarConversasDoRobo.mockResolvedValue(3);
  expect(await inboxCron.finalizarConversasDoRobo(AGORA)).toBe(3);
  expect(repo.finalizarConversasDoRobo).toHaveBeenCalledWith(new Date('2026-10-15T15:00:00.000Z'));
});

it('limpa mensagens com mais de 180 dias e conversas vazias', async () => {
  repo.apagarMensagensAntigas.mockResolvedValue(10);
  repo.apagarConversasVazias.mockResolvedValue(2);
  expect(await inboxCron.limparAntigas(AGORA)).toEqual({ mensagens: 10, conversas: 2 });
  expect(repo.apagarMensagensAntigas).toHaveBeenCalledWith(new Date('2026-04-19T15:00:00.000Z'));
});

describe('MESSAGES_UPDATE', () => {
  beforeEach(() => tenant.resolveTenant.mockResolvedValue({ business: { id: 'b1', name: 'X', instanceName: 'loja_1' } }));
  it('objeto único com keyId', async () => {
    expect(await handleMessagesUpdate({ instance: 'loja_1', data: { keyId: 'EVO-1', status: 'READ' } }, { instanceName: 'loja_1' })).toEqual({ atualizadas: 1 });
    expect(recorder.atualizarEntrega).toHaveBeenCalledWith({ businessId: 'b1', providerMessageId: 'EVO-1', status: 'lida' });
  });
  it('lista com key.id e status ignorável', async () => {
    await handleMessagesUpdate({ data: [{ key: { id: 'A' }, status: 'DELIVERY_ACK' }, { key: { id: 'B' }, status: 'SERVER_ACK' }] }, { instanceName: 'loja_1' });
    expect(recorder.atualizarEntrega).toHaveBeenCalledTimes(1);
    expect(recorder.atualizarEntrega).toHaveBeenCalledWith({ businessId: 'b1', providerMessageId: 'A', status: 'entregue' });
  });
  it('instância desconhecida não faz nada', async () => {
    tenant.resolveTenant.mockResolvedValue(null);
    expect(await handleMessagesUpdate({ data: { keyId: 'A', status: 'READ' } }, { instanceName: 'x' })).toEqual({ atualizadas: 0 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**
  - `inbox.cron.ts`: `HORA = 3_600_000`; `voltarAoRoboPorInatividade` usa `conversasHumanasParadas(new Date(agora - HORAS_VOLTA_ROBO*HORA))`, para cada uma `atualizarConversa(id, { handler:'bot', status:'finalizada', assignedUserId:null })` e `inserirMensagem({ businessId, conversationId:id, phoneKey, direction:'out', origin:'painel_evento', body:'Voltou ao robô por inatividade', mediaType:null, providerMessageId:null, status:'enviada', sentByUserId:null })`; devolve a quantidade. `finalizarConversasDoRobo` com `HORAS_FINALIZAR_ROBO`. `limparAntigas` com `DIAS_RETENCAO * 24 * HORA`. Erros → `logger.warn` e retorno 0.
  - Repositório (novos métodos):
```ts
  conversasHumanasParadas: (antesDe: Date) => prisma.whatsappConversation.findMany({
    where: { handler: 'humano', lastMessageAt: { lt: antesDe } }, select: { id: true, businessId: true, phoneKey: true }, take: 500 }),
  finalizarConversasDoRobo: async (antesDe: Date) => (await prisma.whatsappConversation.updateMany({
    where: { handler: 'bot', status: { not: 'finalizada' }, lastMessageAt: { lt: antesDe } }, data: { status: 'finalizada' } })).count,
  apagarMensagensAntigas: async (antesDe: Date) => (await prisma.whatsappMessage.deleteMany({ where: { createdAt: { lt: antesDe } } })).count,
  apagarConversasVazias: async (antesDe: Date) => (await prisma.whatsappConversation.deleteMany({
    where: { lastMessageAt: { lt: antesDe }, messages: { none: {} } } })).count,
```
  - `messagesUpdateHandler.ts`: `itens = Array.isArray(data) ? data : [data]`; para cada item `id = item.keyId ?? item.key?.id ?? item.messageId`, `novo = statusDeEntrega(item.status ?? item.update?.status)`; com `id` string e `novo` → `atualizarEntrega`. Tenant via `resolveTenant(ctx.instanceName ?? body.instance)`. Sem log por item (só `logger.debug`).
  - `webhook.handler.ts`: `case 'messages-update': await handleMessagesUpdate(body, { instanceName }); break;`
  - `evolution-api.service.ts`: `WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']` e atualizar o comentário (o handler é mínimo; entrega/leitura).
  - `connectionUpdateHandler.ts`: em `state === 'open'`:
```ts
      await prisma.$executeRaw(Prisma.sql`
        UPDATE businesses SET whatsapp_connected_at = now()
         WHERE lower(btrim(whatsapp_instance_name)) = ${instanceName.trim().toLowerCase()}
           AND whatsapp_connected_at IS NULL`).catch((err) => logger.warn({ err, instanceName }, 'connectionUpdateHandler: connected_at falhou'));
```
    e em `close`/`logout` o mesmo `UPDATE ... SET whatsapp_connected_at = NULL` (sem a condição `IS NULL`).
  - `cronService.ts` (`startReminderCron`): `cron.schedule('*/15 * * * *', ...)` chamando `inboxCron.voltarAoRoboPorInatividade()` e `inboxCron.finalizarConversasDoRobo()`; `cron.schedule('30 3 * * *', ...)` chamando `inboxCron.limparAntigas()` (fuso do servidor, como o `0 3 * * *` existente).
  - `server.ts`: dentro do `else` do `DISABLE_CRON`, depois de `startReminderCron()`:
```ts
      void whatsappService.syncAllWebhooks()
        .then((r) => logger.info({ fixed: r.fixed, failed: r.failed }, 'Webhooks do WhatsApp conferidos na subida'))
        .catch((err) => logger.warn({ err }, 'Falha ao conferir webhooks do WhatsApp na subida'));
```
    (import de `./modules/whatsapp/whatsapp.service.js`).

- [ ] **Step 4: Rodar:** `npx vitest run src/__tests__/inboxCron.test.ts src/__tests__/evolutionApiServiceWebhookConfig.test.ts src/__tests__/whatsappWebhookPerInstance.test.ts src/__tests__/reminderCron.test.ts` → PASS; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add backend/src
git commit -m "feat(whatsapp): situação de entrega, hora da conexão e rotinas da central

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API de conversas (fila, mensagens, envio, assumir, devolver, lidas)

**Files:**
- Create: `backend/src/modules/whatsappInbox/inbox.service.ts`, `inbox.controller.ts`, `inbox.routes.ts`
- Modify: `backend/src/modules/whatsappInbox/inbox.types.ts` (DTOs + Zod), `inbox.repository.ts` (consultas da API), `backend/src/server.ts` (montar a rota **antes** de `whatsappRoutes`)
- Test: `backend/src/__tests__/inboxService.test.ts`

**Interfaces:**
- Consumes: `inboxRepository` (Tasks 2 e 5), `sendWhatsAppMessage` (Task 3), `whatsappService.getStatus(businessId)` de `backend/src/modules/whatsapp/whatsapp.service.ts` (`status === 'connected'`), `crmRepository.visitasDoCliente` + `resumirCliente` (`backend/src/modules/crm/crmMetrics.ts`), `getBusinessScheduleSettings` + `todayInTimezone`.
- Produces (`inbox.types.ts`, espelhados no frontend na Task 8):
```ts
export type FiltroConversa = 'todas' | 'aguardando' | 'bot' | 'finalizadas';
export interface ConversaResumoDto {
  id: string; telefone: string; nome: string | null; clientId: string | null;
  atendimento: Atendimento; status: StatusConversa; responsavel: { id: string; nome: string } | null;
  ultimaMensagemEm: string; previa: string; naoLidas: number; sinalPendente: boolean;
}
export interface ListaConversasDto {
  itens: ConversaResumoDto[];
  contadores: Record<FiltroConversa, number>;
  proximoCursor: string | null;          // ISO de lastMessageAt do último item, se houver mais
}
export interface MensagemDto {
  id: string; direcao: Direcao; origem: Origem; texto: string; tipoMidia: string | null;
  status: StatusMensagem; autor: string | null; criadaEm: string;
}
export interface ListaMensagensDto { itens: MensagemDto[]; temMais: boolean }   // itens do mais antigo para o mais novo
export interface AgendamentoRelacionadoDto {
  id: string; data: string; hora: string; status: string; servico: string; valor: number;
  profissional: string; sinal: number | null; expiraEm: string | null;
}
export interface ContextoClienteDto {
  cliente: { id: string; nome: string; telefone: string; desde: string };
  fase: string; ltv: number; cicloMedio: number | null;
  agendamento: AgendamentoRelacionadoDto | null;
  ultimasVisitas: Array<{ data: string; servico: string; valor: number }>;   // 2 mais recentes
}
export interface ConversaDetalheDto { conversa: ConversaResumoDto; contexto: ContextoClienteDto | null }
export const ListaConversasQuery = z.object({
  filtro: z.enum(['todas', 'aguardando', 'bot', 'finalizadas']).default('todas'),
  cursor: z.string().datetime().optional(),
});
export const MensagensQuery = z.object({ antes: z.string().datetime().optional() });
export const EnviarSchema = z.object({ texto: z.string().trim().min(1, 'Escreva a mensagem').max(4096, 'Mensagem muito longa') });
export const LidasSchema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });
```
- Produces (`inbox.service.ts`):
```ts
type Ator = { userId: string; role: 'tenant_admin' | 'employee' };
export const inboxService: {
  listar(businessId: string, q: { filtro: FiltroConversa; cursor?: string }): Promise<ListaConversasDto>;
  detalhe(businessId: string, id: string): Promise<ConversaDetalheDto>;
  mensagens(businessId: string, id: string, antes?: string): Promise<ListaMensagensDto>;
  enviar(businessId: string, ator: Ator, id: string, texto: string): Promise<{ enviado: true }>;
  assumir(businessId: string, ator: Ator, id: string): Promise<ConversaResumoDto>;
  devolver(businessId: string, ator: Ator, id: string): Promise<ConversaResumoDto>;
  marcarLidas(businessId: string, ids?: string[]): Promise<{ atualizadas: number }>;
};
```
- Rotas (`inbox.routes.ts`, guard `[authMiddleware, requireTenantRoles, requireFeature('whatsapp_automation')]`), montadas em `server.ts` como `app.use(\`${API_V1}/whatsapp\`, inboxRoutes)` **antes** de `app.use(\`${API_V1}/whatsapp\`, whatsappRoutes)`:
```
GET  /conversations               → listar   (query ListaConversasQuery)
POST /conversations/lidas         → marcarLidas (body LidasSchema)   ← declarar ANTES de /conversations/:id
GET  /conversations/:id           → detalhe
GET  /conversations/:id/messages  → mensagens (query MensagensQuery)
POST /conversations/:id/messages  → enviar (body EnviarSchema)
POST /conversations/:id/assumir   → assumir
POST /conversations/:id/devolver  → devolver
```
  `:id` não-UUID → `NotFoundError('Conversa')` no controller (helper `uuid()` igual ao de `backend/src/modules/tags/tags.controller.ts`). Ator = `{ userId: req.user.userId, role: req.user.role }`.

**Regras do serviço:**
- **Filtros/contadores:** `todas` = status ≠ `finalizada`; `aguardando` = status `aguardando`; `bot` = atendimento `bot` e status ≠ `finalizada`; `finalizadas` = status `finalizada`. Página de 30 por `lastMessageAt desc`; `cursor` = `lastMessageAt < cursor`.
- **`sinalPendente`:** a cliente da conversa tem agendamento `aguardando_pagamento` com `expiresAt > agora`.
- **Vinculação tardia:** no `detalhe`, conversa sem `clientId` → `inboxRepository.clientePorTelefone(businessId, conversa.phone)`; achou → `atualizarConversa(id, { clientId })` e segue com essa cliente (cobre a cliente cadastrada pelo botão "Cadastrar cliente").
- **Contexto:** só com `clientId`. `resumirCliente(visitas, hoje, birthDate)` dá `fase`, `ltv`, `cicloMedio`; `ultimasVisitas` = 2 visitas mais recentes (`date`, `servico`, `receita`). `agendamento` = próximo com data ≥ hoje (fuso do negócio) e status em `aguardando_pagamento | confirmado | em_atendimento`, ordenado por data e hora; `aguardando_pagamento` com `expiresAt` vencido não conta.
- **Mensagens:** 50 por página, `createdAt < antes`, devolvidas em ordem crescente; `autor` = nome do `sentByUser` (saída manual pelo painel), `null` nos demais (o frontend rotula robô/automático pela origem).
- **Permissões (`employee`):**
  - enviar/assumir: permitido se `assignedUserId === ator.userId`, ou (`assignedUserId === null` e (`status === 'aguardando'` ou atendimento `bot`)); senão `ForbiddenError('Esta conversa está com outra pessoa')`.
  - devolver: só se `assignedUserId` é nulo ou o próprio; senão o mesmo 403.
  - `tenant_admin` pode tudo.
- **Enviar:** conversa do negócio (404 senão) → permissão → `whatsappService.getStatus(businessId)`; `status !== 'connected'` → `ConflictError('WhatsApp desconectado. Reconecte na aba Conexão.')`. Se atendimento `bot` (ou humano de outra pessoa, para a dona), assumir antes (mesma lógica do `assumir`, com evento). `sendWhatsAppMessage(conversa.phone, texto, { businessId, origin: 'manual_painel', sentByUserId: ator.userId })`; `false` → `AppError('Não foi possível enviar a mensagem. Tente de novo.', 502, 'WHATSAPP_SEND_FAILED')`. Zera `unreadCount`. Retorna `{ enviado: true }`.
- **Assumir:** `atualizarConversa(id, { handler: 'humano', assignedUserId: ator.userId, status: 'aberta' })` e evento `painel_evento` "{nome do usuário} assumiu o atendimento" (nome via `prisma.user.findUnique({ select: { name: true } })` no repositório). Se já é do próprio ator, não grava evento de novo.
- **Devolver:** `{ handler: 'bot', assignedUserId: null, status: 'aberta' }`, evento "Conversa devolvida ao robô" e `deleteSession(conversa.phone, businessId)` de `whatsappSessionService` (sessão presa do robô).
- **Lidas:** `updateMany` `unreadCount: 0` das `ids` do negócio; sem `ids`, todas do negócio com `unreadCount > 0`.

- [ ] **Step 1: Testes** (`inboxService.test.ts`, mockando repositório, `sendWhatsAppMessage`, `whatsappService`, `crmRepository`, `getBusinessScheduleSettings` e `whatsappSessionService`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  listarConversas: vi.fn(), contarConversas: vi.fn(), conversaDoNegocio: vi.fn(), atualizarConversa: vi.fn(),
  inserirMensagem: vi.fn(), listarMensagens: vi.fn(), nomeUsuario: vi.fn(), zerarNaoLidas: vi.fn(),
  proximoAgendamento: vi.fn(), clientesComSinalPendente: vi.fn(), clienteBasico: vi.fn(), clientePorTelefone: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const msg = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => msg);
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);
const crm = vi.hoisted(() => ({ crmRepository: { visitasDoCliente: vi.fn() } }));
vi.mock('../modules/crm/crm.repository.js', () => crm);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const sess = vi.hoisted(() => ({ deleteSession: vi.fn() }));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => sess);

const { inboxService } = await import('../modules/whatsappInbox/inbox.service.js');

const DONA = { userId: 'u-dona', role: 'tenant_admin' as const };
const FUNC = { userId: 'u-func', role: 'employee' as const };
const conv = (over: Record<string, unknown> = {}) => ({
  id: 'cv1', businessId: 'b1', phone: '5583999990000', phoneKey: '8399990000', clientId: 'c1', handler: 'bot', status: 'aberta',
  assignedUserId: null, assignedUser: null, client: { id: 'c1', name: 'Maria' }, lastMessageAt: new Date('2026-10-16T13:00:00Z'),
  lastMessagePreview: 'oi', unreadCount: 2, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.conversaDoNegocio.mockResolvedValue(conv());
  repo.atualizarConversa.mockImplementation(async (_id: string, d: object) => conv(d));
  repo.nomeUsuario.mockResolvedValue('Carla');
  repo.inserirMensagem.mockResolvedValue(true);
  repo.clientesComSinalPendente.mockResolvedValue(new Set<string>());
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected' });
  msg.sendWhatsAppMessage.mockResolvedValue(true);
});

describe('listar', () => {
  it('devolve itens, contadores e cursor; marca sinal pendente', async () => {
    repo.listarConversas.mockResolvedValue(Array.from({ length: 31 }, (_, i) => conv({ id: `cv${i}` })));
    repo.contarConversas.mockResolvedValue({ todas: 40, aguardando: 3, bot: 30, finalizadas: 5 });
    repo.clientesComSinalPendente.mockResolvedValue(new Set(['c1']));
    const r = await inboxService.listar('b1', { filtro: 'todas' });
    expect(r.itens).toHaveLength(30);
    expect(r.proximoCursor).toBe('2026-10-16T13:00:00.000Z');
    expect(r.contadores).toEqual({ todas: 40, aguardando: 3, bot: 30, finalizadas: 5 });
    expect(r.itens[0]).toMatchObject({ nome: 'Maria', atendimento: 'bot', naoLidas: 2, sinalPendente: true, telefone: '5583999990000' });
    expect(repo.listarConversas).toHaveBeenCalledWith('b1', 'todas', undefined, 31);
  });
});

describe('enviar', () => {
  it('dona envia numa conversa do robô: assume, envia como manual_painel e zera não lidas', async () => {
    expect(await inboxService.enviar('b1', DONA, 'cv1', 'Oi Maria')).toEqual({ enviado: true });
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ handler: 'humano', assignedUserId: 'u-dona' }));
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ origin: 'painel_evento', body: 'Carla assumiu o atendimento' }));
    expect(msg.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi Maria', { businessId: 'b1', origin: 'manual_painel', sentByUserId: 'u-dona' });
    expect(repo.zerarNaoLidas).toHaveBeenCalledWith('b1', ['cv1']);
  });
  it('desconectado: 409 e nada é enviado', async () => {
    wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected' });
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 409, message: 'WhatsApp desconectado. Reconecte na aba Conexão.' });
    expect(msg.sendWhatsAppMessage).not.toHaveBeenCalled();
  });
  it('falha do provedor: 502 em pt-BR', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
    msg.sendWhatsAppMessage.mockResolvedValue(false);
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 502, message: 'Não foi possível enviar a mensagem. Tente de novo.' });
  });
  it('conversa de outro negócio: 404', async () => {
    repo.conversaDoNegocio.mockResolvedValue(null);
    await expect(inboxService.enviar('b1', DONA, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 404, message: 'Conversa não encontrada' });
  });
});

describe('permissões da funcionária', () => {
  it('não envia nem assume conversa de outra pessoa', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona', status: 'aberta' }));
    await expect(inboxService.enviar('b1', FUNC, 'cv1', 'x')).rejects.toMatchObject({ statusCode: 403, message: 'Esta conversa está com outra pessoa' });
    await expect(inboxService.assumir('b1', FUNC, 'cv1')).rejects.toMatchObject({ statusCode: 403 });
    await expect(inboxService.devolver('b1', FUNC, 'cv1')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('assume conversa aguardando sem responsável', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', status: 'aguardando' }));
    await inboxService.assumir('b1', FUNC, 'cv1');
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'humano', assignedUserId: 'u-func', status: 'aberta' });
  });
  it('dona pode tudo', async () => {
    repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-func' }));
    await expect(inboxService.devolver('b1', DONA, 'cv1')).resolves.toBeTruthy();
  });
});

it('devolver: volta ao robô, registra evento e encerra sessão presa', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
  const r = await inboxService.devolver('b1', DONA, 'cv1');
  expect(r.atendimento).toBe('bot');
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'bot', assignedUserId: null, status: 'aberta' });
  expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ origin: 'painel_evento', body: 'Conversa devolvida ao robô' }));
  expect(sess.deleteSession).toHaveBeenCalledWith('5583999990000', 'b1');
});

it('assumir de novo a própria conversa não repete o evento', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ handler: 'humano', assignedUserId: 'u-dona' }));
  await inboxService.assumir('b1', DONA, 'cv1');
  expect(repo.inserirMensagem).not.toHaveBeenCalled();
});

it('detalhe com contexto: fase, LTV, ciclo, últimas 2 visitas e agendamento', async () => {
  repo.clienteBasico.mockResolvedValue({ id: 'c1', name: 'Maria', phone: '(83) 99999-0000', createdAt: new Date('2026-02-01T12:00:00Z'), birthDate: null });
  crm.crmRepository.visitasDoCliente.mockResolvedValue([
    { date: '2026-08-06', receita: 65, servico: 'Spa dos pés', profissional: 'Camila' },
    { date: '2026-08-28', receita: 110, servico: 'Manutenção gel', profissional: 'Camila' },
    { date: '2026-09-18', receita: 130, servico: 'Alongamento', profissional: 'Camila' },
  ]);
  repo.proximoAgendamento.mockResolvedValue({ id: 'a1', data: '2026-10-17', hora: '14:00', status: 'aguardando_pagamento', servico: 'Alongamento em gel', valor: 130, profissional: 'Camila Rocha', sinal: 30, expiraEm: '2026-10-16T15:30:00.000Z' });
  const r = await inboxService.detalhe('b1', 'cv1');
  expect(r.contexto?.ltv).toBe(305);
  expect(r.contexto?.ultimasVisitas).toEqual([
    { data: '2026-09-18', servico: 'Alongamento', valor: 130 },
    { data: '2026-08-28', servico: 'Manutenção gel', valor: 110 },
  ]);
  expect(r.contexto?.agendamento?.status).toBe('aguardando_pagamento');
});

it('detalhe sem cliente: contexto nulo', async () => {
  repo.clientePorTelefone.mockResolvedValue(null);
  repo.conversaDoNegocio.mockResolvedValue(conv({ clientId: null, client: null }));
  expect((await inboxService.detalhe('b1', 'cv1')).contexto).toBeNull();
});

it('detalhe vincula cliente cadastrada depois pelo telefone', async () => {
  repo.conversaDoNegocio.mockResolvedValue(conv({ clientId: null, client: null }));
  repo.clientePorTelefone.mockResolvedValue({ id: 'c9', name: 'Bia' });
  repo.clienteBasico.mockResolvedValue({ id: 'c9', name: 'Bia', phone: '83999990000', createdAt: new Date('2026-10-16T12:00:00Z'), birthDate: null });
  crm.crmRepository.visitasDoCliente.mockResolvedValue([]);
  repo.proximoAgendamento.mockResolvedValue(null);
  const r = await inboxService.detalhe('b1', 'cv1');
  expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { clientId: 'c9' });
  expect(r.contexto?.cliente.nome).toBe('Bia');
});

it('mensagens em ordem crescente com temMais', async () => {
  repo.listarMensagens.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({
    id: `m${i}`, direction: 'in', origin: 'cliente', body: `t${i}`, mediaType: null, status: 'recebida',
    sentByUser: null, createdAt: new Date(Date.UTC(2026, 9, 16, 12, 0, 51 - i)),
  })));
  const r = await inboxService.mensagens('b1', 'cv1');
  expect(r.temMais).toBe(true);
  expect(r.itens).toHaveLength(50);
  expect(r.itens[0]!.criadaEm < r.itens[49]!.criadaEm).toBe(true);
});
```
(`repo.listarConversas(businessId, filtro, cursor?: Date, take)` ordena por `lastMessageAt desc`; `repo.listarMensagens(conversationId, antes?: Date, take = 51)` ordena por `createdAt desc` — o serviço inverte.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Repositório (métodos novos).**
```ts
  async listarConversas(businessId: string, filtro: FiltroConversa, cursor: Date | undefined, take: number) {
    return prisma.whatsappConversation.findMany({
      where: { businessId, ...ONDE[filtro], ...(cursor ? { lastMessageAt: { lt: cursor } } : {}) },
      orderBy: { lastMessageAt: 'desc' }, take,
      include: { client: { select: { id: true, name: true } }, assignedUser: { select: { id: true, name: true } } },
    });
  },
  async contarConversas(businessId: string): Promise<Record<FiltroConversa, number>> {
    const [todas, aguardando, bot, finalizadas] = await Promise.all(
      (['todas', 'aguardando', 'bot', 'finalizadas'] as const).map((f) => prisma.whatsappConversation.count({ where: { businessId, ...ONDE[f] } })));
    return { todas, aguardando, bot, finalizadas };
  },
  conversaDoNegocio: (businessId: string, id: string) => prisma.whatsappConversation.findFirst({
    where: { id, businessId },
    include: { client: { select: { id: true, name: true } }, assignedUser: { select: { id: true, name: true } } } }),
  listarMensagens: (conversationId: string, antes: Date | undefined, take = 51) => prisma.whatsappMessage.findMany({
    where: { conversationId, ...(antes ? { createdAt: { lt: antes } } : {}) }, orderBy: { createdAt: 'desc' }, take,
    include: { sentByUser: { select: { name: true } } } }),
  nomeUsuario: async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? 'Alguém',
  zerarNaoLidas: async (businessId: string, ids?: string[]) => (await prisma.whatsappConversation.updateMany({
    where: { businessId, unreadCount: { gt: 0 }, ...(ids ? { id: { in: ids } } : {}) }, data: { unreadCount: 0 } })).count,
  async clientesComSinalPendente(businessId: string, clientIds: string[]): Promise<Set<string>> {
    if (!clientIds.length) return new Set();
    const rows = await prisma.appointment.findMany({
      where: { businessId, clientId: { in: clientIds }, status: 'aguardando_pagamento', expiresAt: { gt: new Date() } },
      select: { clientId: true }, distinct: ['clientId'] });
    return new Set(rows.map((r) => r.clientId));
  },
  clienteBasico: (businessId: string, id: string) => prisma.client.findFirst({
    where: { id, businessId }, select: { id: true, name: true, phone: true, createdAt: true, birthDate: true } }),
  async proximoAgendamento(businessId: string, clientId: string, hoje: string): Promise<AgendamentoRelacionadoDto | null> {
    const agora = new Date();
    const rows = await prisma.appointment.findMany({
      where: { businessId, clientId, date: { gte: new Date(`${hoje}T00:00:00.000Z`) },
        status: { in: ['aguardando_pagamento', 'confirmado', 'em_atendimento'] } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }], take: 5,
      select: { id: true, date: true, time: true, status: true, depositAmount: true, expiresAt: true,
        service: { select: { name: true, price: true } }, professional: { select: { name: true } } } });
    const a = rows.find((r) => r.status !== 'aguardando_pagamento' || (r.expiresAt && r.expiresAt > agora));
    return a ? { id: a.id, data: a.date.toISOString().slice(0, 10), hora: a.time.toISOString().slice(11, 16), status: a.status,
      servico: a.service.name, valor: Number(a.service.price), profissional: a.professional.name,
      sinal: a.depositAmount === null ? null : Number(a.depositAmount), expiraEm: a.expiresAt?.toISOString() ?? null } : null;
  },
```
com
```ts
const ONDE: Record<FiltroConversa, Prisma.WhatsappConversationWhereInput> = {
  todas: { status: { not: 'finalizada' } },
  aguardando: { status: 'aguardando' },
  bot: { handler: 'bot', status: { not: 'finalizada' } },
  finalizadas: { status: 'finalizada' },
};
```
(`birthDate` no `select` de `clienteBasico` existe em `Client`? confira o schema; se o campo tiver outro nome, ajuste — `resumirCliente` aceita `null`.)

- [ ] **Step 4: Serviço, controller e rotas** conforme Interfaces/Regras. O `uuid()` do controller usa `z.string().uuid()` e `NotFoundError('Conversa')`. `listar` pede `take = 31` e corta em 30 para saber se há próxima página.

- [ ] **Step 5: Rodar:** `npx vitest run src/__tests__/inboxService.test.ts` → PASS; `npx tsc --noEmit`.

- [ ] **Step 6: Commit**
```bash
git add backend/src
git commit -m "feat(whatsapp): API da central de conversas com assumir, devolver e envio pelo painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Respostas rápidas, resumo da Conexão e campo Política

**Files:**
- Create: `backend/src/modules/whatsappInbox/quickReplies.ts`, `backend/src/modules/whatsappInbox/connectionSummary.ts`
- Modify: `backend/src/modules/dashboard/today.service.ts` (exporta `proximasVagas`), `backend/src/modules/whatsappInbox/inbox.repository.ts`, `inbox.routes.ts`, `inbox.controller.ts`, `inbox.types.ts`; `backend/src/services/whatsapp/whatsappConfigService.ts` e `backend/src/routes/whatsapp.ts` (`politica_message` no GET/PUT `/config`)
- Test: `backend/src/__tests__/inboxQuickReplies.test.ts`, `backend/src/__tests__/inboxConnectionSummary.test.ts`

**Interfaces:**
- Produces:
```ts
// today.service.ts
export async function proximasVagas(businessId: string, agora: Date, limite = 3):
  Promise<Array<{ data: string; inicio: string; profissional: string }>>;   // próximos 7 dias, a partir de agora
// inbox.types.ts
export interface RespostaRapidaDto { chave: 'pix' | 'como_chegar' | 'horarios' | 'politica'; rotulo: string;
  disponivel: boolean; texto: string | null; motivo: string | null }
export interface ResumoConexaoDto {
  conectado: boolean; numero: string | null; conectadoDesde: string | null; diasConectado: number | null; semInterrupcoes: boolean;
  enviosHoje: { total: number; falhas: number; limite: number; percentual: number; disponiveis: number;
    grupos: { automaticas: number; pix: number; manuais: number } };
  saude: 'Excelente' | 'Boa' | 'Atenção';
  historico: Array<{ id: string; criadaEm: string; cliente: string | null; telefone: string; tipo: string; status: StatusMensagem }>;
}
// quickReplies.ts / connectionSummary.ts
export const respostasRapidas: (businessId: string, agora?: Date) => Promise<RespostaRapidaDto[]>;
export const resumoConexao: (businessId: string, agora?: Date) => Promise<ResumoConexaoDto>;
```
- Rotas novas (mesmo guard da Task 6):
```
GET /conversations/:id/respostas-rapidas   → respostasRapidas(businessId) (a conversa precisa existir no negócio: 404 senão)
GET /connection/summary                    → resumoConexao(businessId)
```

**Textos das respostas rápidas** (ordem fixa: pix, como_chegar, horarios, politica; rótulos "Chave Pix", "Como chegar", "Horários livres", "Política"):
- `pix`: `Segue a chave Pix do ${negocio}:\nChave ${TIPO}: ${chave}` — `TIPO` legível de `pixKeyType` (`cpf`→"CPF", `cnpj`→"CNPJ", `email`→"E-mail", `phone`/`telefone`→"Telefone", `random`/`aleatoria`/`evp`→"Aleatória", outro/nulo→"Pix"). Indisponível sem `pixKey`: motivo "Cadastre a chave Pix em Ajustes".
- `como_chegar`: `${endereco}\nNo mapa: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` (endereço de `Business.address`). Indisponível sem endereço: "Cadastre o endereço em Ajustes".
- `horarios`: `Temos estes horários livres:\n${linhas}\nQual fica melhor para você?` com uma linha por vaga `• Qua 14:30 com Camila` (dia abreviado Dom/Seg/Ter/Qua/Qui/Sex/Sáb; "Hoje" quando é hoje). Indisponível sem vagas: "Sem horários livres nos próximos 7 dias".
- `politica`: `whatsapp_bot_config.politica_message`. Indisponível vazio: "Cadastre o texto em Automações › Mensagens".

**Regras do resumo** (spec "Regras de cálculo da Conexão"):
- `inicio` do dia = `zonedToUtc(todayInTimezone(tz, agora), '00:00', tz)` (`backend/src/utils/businessDate.ts`).
- Envios de hoje = mensagens `out` com `createdAt >= inicio` e `origin !== 'painel_evento'`; `falhas` = `status === 'falhou'`; grupos por `grupoEnvio(origin)`; `percentual = Math.round(total / LIMITE_DIARIO * 100)`; `disponiveis = max(0, LIMITE_DIARIO - total)`; `saude = saudeEnvios(total, falhas)`.
- `conectado` = `whatsappService.getStatus(businessId).status === 'connected'`; `numero` = `connectedNumber` do status ou `Business.whatsapp`; `conectadoDesde` = `Business.whatsappConnectedAt`; `diasConectado` = dias inteiros desde então (`null` se nulo); `semInterrupcoes` = conectado há ≥ 24 h.
- Histórico = 20 últimas `out` (sem `painel_evento`), mais nova primeiro; `cliente` = nome da cliente da conversa ou `null`; `telefone` = `mascararTelefone(conversa?.phone ?? phoneKey)`; `tipo` = `rotuloOrigem(origin)`.

- [ ] **Step 1: Testes.** `inboxQuickReplies.test.ts` (mock do repositório com `dadosRespostas(businessId)` → `{ negocio, pixKey, pixKeyType, endereco, politica }` e de `proximasVagas`):
```ts
import { it, expect, vi, beforeEach } from 'vitest';
const repo = vi.hoisted(() => ({ dadosRespostas: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const today = vi.hoisted(() => ({ proximasVagas: vi.fn() }));
vi.mock('../modules/dashboard/today.service.js', () => today);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const { respostasRapidas } = await import('../modules/whatsappInbox/quickReplies.js');

const AGORA = new Date('2026-10-16T13:00:00.000Z'); // sexta 10:00 em São Paulo
beforeEach(() => {
  repo.dadosRespostas.mockResolvedValue({ negocio: 'Studio Aurora', pixKey: 'pix@aurora.com', pixKeyType: 'email', endereco: 'Rua das Flores, 142 - João Pessoa', politica: 'Cancelamentos até 24h antes.' });
  today.proximasVagas.mockResolvedValue([
    { data: '2026-10-16', inicio: '14:30', profissional: 'Camila' },
    { data: '2026-10-21', inicio: '10:00', profissional: 'Bruna' },
  ]);
});

it('monta as quatro respostas com dados do negócio', async () => {
  const r = await respostasRapidas('b1', AGORA);
  expect(r.map((x) => x.chave)).toEqual(['pix', 'como_chegar', 'horarios', 'politica']);
  expect(r[0]!.texto).toBe('Segue a chave Pix do Studio Aurora:\nChave E-mail: pix@aurora.com');
  expect(r[1]!.texto).toBe('Rua das Flores, 142 - João Pessoa\nNo mapa: https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20142%20-%20Jo%C3%A3o%20Pessoa');
  expect(r[2]!.texto).toBe('Temos estes horários livres:\n• Hoje 14:30 com Camila\n• Qua 10:00 com Bruna\nQual fica melhor para você?');
  expect(r[3]!.texto).toBe('Cancelamentos até 24h antes.');
  expect(r.every((x) => x.disponivel)).toBe(true);
});

it('sem dados: indisponíveis com motivo', async () => {
  repo.dadosRespostas.mockResolvedValue({ negocio: 'X', pixKey: null, pixKeyType: null, endereco: '  ', politica: null });
  today.proximasVagas.mockResolvedValue([]);
  const r = await respostasRapidas('b1', AGORA);
  expect(r.map((x) => [x.disponivel, x.motivo])).toEqual([
    [false, 'Cadastre a chave Pix em Ajustes'], [false, 'Cadastre o endereço em Ajustes'],
    [false, 'Sem horários livres nos próximos 7 dias'], [false, 'Cadastre o texto em Automações › Mensagens'],
  ]);
  expect(r.every((x) => x.texto === null)).toBe(true);
});
```
`inboxConnectionSummary.test.ts` (mock de `enviosDesde`, `historicoEnvios`, `dadosConexao` do repositório e de `whatsappService.getStatus`):
```ts
import { it, expect, vi, beforeEach } from 'vitest';
const repo = vi.hoisted(() => ({ enviosDesde: vi.fn(), historicoEnvios: vi.fn(), dadosConexao: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const { resumoConexao } = await import('../modules/whatsappInbox/connectionSummary.js');

beforeEach(() => {
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected', connectedNumber: '5583981204000' });
  repo.dadosConexao.mockResolvedValue({ whatsapp: '5583981204000', whatsappConnectedAt: new Date('2026-10-04T12:00:00.000Z') });
  repo.enviosDesde.mockResolvedValue([
    { origin: 'lembrete', status: 'entregue', n: 40 }, { origin: 'confirmacao', status: 'lida', n: 2 },
    { origin: 'pix_recibo', status: 'enviada', n: 16 }, { origin: 'manual_painel', status: 'falhou', n: 2 },
    { origin: 'bot', status: 'enviada', n: 8 },
  ]);
  repo.historicoEnvios.mockResolvedValue([
    { id: 'm1', createdAt: new Date('2026-10-16T14:42:08.000Z'), origin: 'lembrete', status: 'lida', phoneKey: '8396112233', conversation: { phone: '5583996112233', client: { name: 'Juliana Mendes' } } },
    { id: 'm2', createdAt: new Date('2026-10-16T14:00:00.000Z'), origin: 'sistema', status: 'enviada', phoneKey: '8381204000', conversation: null },
  ]);
});

it('conta envios do dia do negócio por grupo e calcula saúde', async () => {
  const r = await resumoConexao('b1', new Date('2026-10-17T02:30:00.000Z')); // 23:30 de 16/10 em São Paulo
  expect(repo.enviosDesde).toHaveBeenCalledWith('b1', new Date('2026-10-16T03:00:00.000Z'));
  expect(r.enviosHoje).toEqual({ total: 68, falhas: 2, limite: 250, percentual: 27, disponiveis: 182, grupos: { automaticas: 42, pix: 16, manuais: 10 } });
  expect(r.saude).toBe('Boa');
  expect(r.diasConectado).toBe(12);
  expect(r.semInterrupcoes).toBe(true);
  expect(r.historico[0]).toEqual({ id: 'm1', criadaEm: '2026-10-16T14:42:08.000Z', cliente: 'Juliana Mendes', telefone: '+55 83 99611-****', tipo: 'Lembrete de agendamento', status: 'lida' });
  expect(r.historico[1]!.cliente).toBeNull();
});

it('desconectado e sem data de conexão', async () => {
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected', connectedNumber: null });
  repo.dadosConexao.mockResolvedValue({ whatsapp: '5583981204000', whatsappConnectedAt: null });
  repo.enviosDesde.mockResolvedValue([]);
  const r = await resumoConexao('b1', new Date('2026-10-16T13:00:00.000Z'));
  expect(r).toMatchObject({ conectado: false, diasConectado: null, semInterrupcoes: false, saude: 'Excelente', numero: '5583981204000' });
  expect(r.enviosHoje.total).toBe(0);
});
```
E em `dashboardToday.test.ts` acrescentar um `describe('proximasVagas')` com os mesmos mocks de `todayRepository` e `getBusinessScheduleSettings` que o arquivo já usa: negócio aberto todos os dias das 09:00 às 18:00, uma profissional sem almoço com agendamento hoje 10:00 (serviço de 60 min), agora = 09:30 local → `proximasVagas(b, agora, 3)` devolve `[{ data: hoje, inicio: '09:30', ... }, { data: hoje, inicio: '11:00', ... }, { data: amanhã, inicio: '09:00', ... }]`; com hoje fechado (`diasAbertos` sem o dia) a primeira vaga é de amanhã às 09:00; `limite` 1 devolve só uma.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**
  - `today.service.ts`: `proximasVagas` reaproveitando `paraMinutos`, `vagasLivres`, `ocupa`, `ocupante`, `CHAVES_DIA`, `diaDaSemana`, `somarDias`, `minutosAgora`, `todayInTimezone`, `getBusinessScheduleSettings`, `todayRepository.profissionaisAtivas` e `todayRepository.agendamentosNasDatas(businessId, [hoje..hoje+6])`. Para cada dia aberto: `inicio = dia === hoje ? Math.max(abertura, minutosAgora(tz, agora)) : abertura`; vagas de cada profissional (`vagasLivres(inicio, fechamento, p.almoco, agendamentosDoDiaDela.map(ocupante))`); devolve `{ data, inicio: vaga.inicio, profissional: p.name }` ordenado por data e início, cortado em `limite`.
  - Repositório:
```ts
  dadosRespostas: async (businessId: string) => {
    const [b, cfg] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId }, select: { name: true, pixKey: true, pixKeyType: true, address: true } }),
      prisma.whatsappBotConfig.findUnique({ where: { businessId }, select: { politicaMessage: true } }),
    ]);
    return { negocio: b?.name ?? '', pixKey: b?.pixKey ?? null, pixKeyType: b?.pixKeyType ?? null, endereco: b?.address ?? null, politica: cfg?.politicaMessage ?? null };
  },
  enviosDesde: async (businessId: string, desde: Date) => (await prisma.whatsappMessage.groupBy({
    by: ['origin', 'status'], where: { businessId, direction: 'out', origin: { not: 'painel_evento' }, createdAt: { gte: desde } },
    _count: { _all: true } })).map((g) => ({ origin: g.origin, status: g.status, n: g._count._all })),
  historicoEnvios: (businessId: string, take = 20) => prisma.whatsappMessage.findMany({
    where: { businessId, direction: 'out', origin: { not: 'painel_evento' } }, orderBy: { createdAt: 'desc' }, take,
    select: { id: true, createdAt: true, origin: true, status: true, phoneKey: true,
      conversation: { select: { phone: true, client: { select: { name: true } } } } } }),
  dadosConexao: (businessId: string) => prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { whatsapp: true, whatsappConnectedAt: true } }),
```
  - `quickReplies.ts` e `connectionSummary.ts` conforme as regras; "Hoje" quando `data === todayInTimezone(tz, agora)`.
  - Política no `/config`: em `whatsappConfigService.ts` (`getBotConfig`), incluir `politica_message` no SELECT e no objeto devolvido (padrão `''`); em `routes/whatsapp.ts` `PUT /config`, aceitar `politica_message` (string até 1000 caracteres; maior → `ValidationError('A política pode ter até 1000 caracteres')`) e incluí-lo no INSERT/`ON CONFLICT DO UPDATE` com `COALESCE(EXCLUDED.politica_message, whatsapp_bot_config.politica_message)`, igual aos outros campos.

- [ ] **Step 4: Rodar:** `npx vitest run src/__tests__/inboxQuickReplies.test.ts src/__tests__/inboxConnectionSummary.test.ts src/__tests__/dashboardToday.test.ts` → PASS; depois a suíte inteira do backend e `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add backend/src
git commit -m "feat(whatsapp): respostas rápidas, resumo da conexão e texto de política

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — cliente de API, proxies e abas do módulo WhatsApp

**Files:**
- Create: `frontend/src/lib/whatsappInbox.ts`; proxies `frontend/src/app/api/whatsapp/conversations/route.ts`, `.../conversations/lidas/route.ts`, `.../conversations/[id]/route.ts`, `.../conversations/[id]/messages/route.ts`, `.../conversations/[id]/assumir/route.ts`, `.../conversations/[id]/devolver/route.ts`, `.../conversations/[id]/respostas-rapidas/route.ts`, `frontend/src/app/api/whatsapp/connection/summary/route.ts`; `frontend/src/components/whatsapp/AutomacoesProvisorio.tsx`
- Modify: `frontend/src/components/WhatsAppModule.tsx`, `frontend/src/components/whatsapp/MessageConfigPanel.tsx` (campo Política), `frontend/src/lib/themedPaths.ts` (registrar `src/components/whatsapp/conversas`)
- Test: `frontend/src/components/whatsapp/__tests__/WhatsAppModule.test.tsx`, `frontend/src/lib/__tests__/whatsappInbox.test.ts`

**Interfaces:**
- Consumes: rotas das Tasks 6–7.
- Produces (`whatsappInbox.ts`) — tipos espelhando os DTOs do backend (`ConversaResumoDto`, `ListaConversasDto`, `MensagemDto`, `ListaMensagensDto`, `ContextoClienteDto`, `ConversaDetalheDto`, `RespostaRapidaDto`, `ResumoConexaoDto`, `FiltroConversa`) e:
```ts
export const listarConversas = async (filtro: FiltroConversa, cursor?: string) =>
  (await api.get<ListaConversasDto>('/whatsapp/conversations', { params: { filtro, ...(cursor ? { cursor } : {}) } })).data;
export const buscarConversa = async (id: string) => (await api.get<ConversaDetalheDto>(`/whatsapp/conversations/${id}`)).data;
export const listarMensagens = async (id: string, antes?: string) =>
  (await api.get<ListaMensagensDto>(`/whatsapp/conversations/${id}/messages`, { params: antes ? { antes } : {} })).data;
export const enviarMensagem = async (id: string, texto: string) =>
  (await api.post<{ enviado: true }>(`/whatsapp/conversations/${id}/messages`, { texto })).data;
export const assumirConversa = async (id: string) => (await api.post<ConversaResumoDto>(`/whatsapp/conversations/${id}/assumir`)).data;
export const devolverConversa = async (id: string) => (await api.post<ConversaResumoDto>(`/whatsapp/conversations/${id}/devolver`)).data;
export const marcarLidas = async (ids?: string[]) => (await api.post<{ atualizadas: number }>('/whatsapp/conversations/lidas', ids ? { ids } : {})).data;
export const buscarRespostasRapidas = async (id: string) => (await api.get<RespostaRapidaDto[]>(`/whatsapp/conversations/${id}/respostas-rapidas`)).data;
export const buscarResumoConexao = async () => (await api.get<ResumoConexaoDto>('/whatsapp/connection/summary')).data;
/** "10:42" hoje, "Ontem", ou "14/10" (fuso America/Sao_Paulo, como o restante do painel). */
export function horaCurta(iso: string, agora?: Date): string;
/** "+55 (83) 99876-5432" a partir de dígitos (com ou sem 55). */
export function formatarTelefone(digitos: string): string;
```
  Proxies no padrão de `frontend/src/app/api/waitlist/...` (`proxyRequest(request, '/whatsapp/conversations/...', 'GET'|'POST')`; os dinâmicos com `{ params }: { params: Promise<{ id: string }> }`). Confirme que `proxyRequest` repassa a query string (veja `frontend/src/lib/server/proxy.ts`); se não repassar, inclua `new URL(request.url).search` no caminho, como outros proxies com query fazem.

**WhatsAppModule (reorganização):**
- Abas na ordem do Stitch: **Automações · Conversas · Conexão** (`id`: `automacoes`, `conversas`, `conexao`). Some a barra lateral ("Status da Conexão" e "Recursos Ativos") — o status passa a viver na aba Conexão (Task 9). Cabeçalho da página igual ao Stitch (título "WhatsApp", breadcrumb "WhatsApp / {Aba}").
- Aba inicial: `?aba=` da URL (`automacoes|conversas|conexao`); sem parâmetro → `conversas` se `waStatus.status === 'connected'`, senão `conexao`. Trocar de aba atualiza `?aba=` com `router.replace` (sem empilhar histórico), como a Agenda faz com `?aba=aguardando-pix`.
- `automacoes` renderiza `AutomacoesProvisorio` com os três painéis atuais (Menu, Mensagens, Simulador) em sub-abas internas simples, sem mudar o comportamento deles (as props e handlers que hoje estão no `WhatsAppModule` passam para lá ou continuam no módulo e descem como props — escolha o que mexer menos).
- `conversas` renderiza `<CentralConversas conectado={waStatus.status === 'connected'} />` (Task 10; até lá, um componente vazio exportado do mesmo arquivo para o build passar).
- `conexao` renderiza o `ConnectionPanel` (Task 9) com as mesmas props de hoje + `onDisconnect`, `onRefresh`, `onTestSend`.
- `MessageConfigPanel`: novo campo "Política de cancelamento e sinal" (textarea, até 1000 caracteres, contador) ligado a `politica_message` do `BotConfig`; ajuda: "Usado na resposta rápida \"Política\" da central de conversas."

- [ ] **Step 1: Testes.**
  - `whatsappInbox.test.ts`: `horaCurta` (hoje 10:42 → "10:42"; ontem → "Ontem"; 14/10 → "14/10"; com `agora` fixo e ISO em UTC convertendo para São Paulo), `formatarTelefone('5583998765432')` → "+55 (83) 99876-5432", `formatarTelefone('8398765432')` → "+55 (83) 9876-5432"; `listarConversas('aguardando')` chama `api.get('/whatsapp/conversations', { params: { filtro: 'aguardando' } })` (mock de `@/lib/api`).
  - `WhatsAppModule.test.tsx` (mock de `@/lib/api`, `next/navigation` e dos painéis filhos): mostra as três abas na ordem "Automações", "Conversas", "Conexão"; não mostra "Hora de voltar", "Campanhas", "Menu", "Simulador" como abas de topo; `?aba=conexao` abre Conexão; sem `?aba` e conectado abre Conversas; desconectado abre Conexão; clicar em "Automações" chama `router.replace` com `?aba=automacoes`; Automações mostra os painéis Menu, Mensagens e Simulador; campo "Política de cancelamento e sinal" envia `politica_message` no salvar (teste no `MessageConfigPanel`).
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.**
- [ ] **Step 4:** `cd frontend && npx vitest run src/components/whatsapp src/lib/__tests__/whatsappInbox.test.ts src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): abas do Stitch, cliente de API da central e campo de política`.

---

### Task 9: Aba Conexão (versão ff12c8) com dados reais

**Files:**
- Modify: `frontend/src/components/whatsapp/ConnectionPanel.tsx` (reescrito), `frontend/src/components/WhatsAppModule.tsx` (props), `frontend/src/lib/conteudoDemo.ts` (remover a chave `whatsapp` e seus tipos) e o teste de `conteudoDemo`
- Test: `frontend/src/components/whatsapp/__tests__/ConnectionPanel.test.tsx` (reescrever)

**Interfaces:**
- Consumes: `buscarResumoConexao`, `ResumoConexaoDto`, `formatarTelefone` (Task 8); status atual (`waStatus`) e handlers de conectar/desconectar/teste já existentes no `WhatsAppModule` (`/whatsapp/connect`, `/whatsapp/disconnect`, `/whatsapp/test-send`).
- Produces: `ConnectionPanel({ waStatus, statusLoading, actionLoading, lastSyncedAt, nomeNegocio, onConnect, onDisconnect, onRefresh, onTestSend })` — busca o resumo sozinho (`buscarResumoConexao` ao montar e a cada `onRefresh`).

**Referência:** `ff12c8`. Blocos na ordem do Stitch:
1. Cabeçalho: "Conexão do WhatsApp", "Acompanhe a conexão do WhatsApp do {negócio} e os limites de envio recomendados.", "Sincronizado há N min" (de `lastSyncedAt`; "agora" se < 1 min) e botão "Atualizar status".
2. Cartão de status: nome do negócio, chip "Conectado"/"Desconectado" (tons `success`/`danger`), linha "Conectado por QR code • {telefone} • conectado há N dias" (sem `diasConectado` → só "Conectado por QR code • {telefone}"), botões "Testar envio", "Reconectar (novo QR code)", "Desconectar". Desconectado: texto "Escaneie o QR code para conectar o WhatsApp do negócio." e botão principal "Conectar WhatsApp".
3. Quatro cartões: Número conectado ({telefone} / "Linha principal ativa"), Tipo de integração ("WhatsApp Web / QR Code" / "Sessão sincronizada"), Tempo conectado ("N dias corridos" / "Sem interrupções" se `semInterrupcoes`, senão "Reconectado há X h"; sem data → "Conectado" / "—"), Status da conexão ("Estável"/"Pronto para envios" quando conectado; "Desconectado"/"Envios pausados" quando não).
4. Saúde e limite: nota (`saude`), "Envios de hoje" `total` "de 250 recomendados", barra `percentual`% ("N% utilizado"), "N envios disponíveis hoje", detalhamento com os três grupos (Lembretes e confirmações automáticas / Notificações de sinal Pix e recibos / Mensagens manuais / Chat) e, no lugar do botão "Solicitar aumento de limite", a nota "O limite recomendado protege seu número contra bloqueio do WhatsApp."
5. Boas práticas: os 5 itens do Stitch, com o item 4 dizendo "responder SAIR" (não "PARAR") e o item 1 "Dispare apenas para clientes que já agendaram no {negócio} ou autorizaram avisos no link da bio."; variáveis do item 2 como `{nome}` e `{horarios}`.
6. Histórico recente (tabela; no celular vira lista de cartões): Horário ("Hoje, 11:42:08" / "Ontem, …" / "14/10, …"), Destinatário (inicial em círculo, nome ou "Sem cadastro", telefone mascarado), Tipo de disparo, Status ("Enviada", "Entregue", "Entregue e lida", "Falhou" com tons). Sem coluna Latência. Vazio: "Nenhum envio ainda hoje.".
7. Modal do QR code: visual do Stitch ("Conectar WhatsApp", "Escaneie o QR code no app do WhatsApp", instrução "Abra o WhatsApp > Aparelhos conectados > Conectar um aparelho e aponte para a tela.", botões "Fechar" e "Concluído"), reaproveitando o QR que o módulo já busca.
- Erro ao buscar o resumo: os blocos 3–6 mostram "Não foi possível carregar os dados de envio." com "Tentar de novo"; o cartão de status continua funcionando pelo `waStatus`.

- [ ] **Step 1: Testes** (mock de `@/lib/whatsappInbox`): conectado com resumo → mostra "Conectado", "68", "de 250 recomendados", "27% utilizado", "182 envios disponíveis hoje", os três grupos com 42/16/10, "Boa", "conectado há 12 dias", "Sem interrupções", linha do histórico "Juliana Mendes" com "+55 83 99611-****" e "Entregue e lida"; "Sem cadastro" quando cliente nulo; nenhuma ocorrência de "Latência", "PARAR", "Solicitar aumento"; desconectado → "Desconectado" e "Conectar WhatsApp"; histórico vazio → "Nenhum envio ainda hoje."; erro do resumo → "Tentar de novo" chama a API de novo; nenhum texto do `conteudoDemo` antigo (ex.: "Hoje, 11:42", "Nenhuma denúncia registrada").
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar** (remover `conteudoDemo.whatsapp` e ajustar `frontend/src/lib/__tests__/conteudoDemo.test.ts` para esperar só `plano`).
- [ ] **Step 4:** `npx vitest run src/components/whatsapp src/lib/__tests__ src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): aba Conexão com saúde, limite e histórico reais`.

---

### Task 10: Aba Conversas — fila e conversa aberta

**Files:**
- Create: `frontend/src/components/whatsapp/conversas/CentralConversas.tsx`, `FilaConversas.tsx`, `ConversaAberta.tsx`, `RespostasRapidas.tsx`
- Test: `frontend/src/components/whatsapp/__tests__/CentralConversas.test.tsx`

**Interfaces:**
- Consumes: funções e tipos da Task 8; `useAuth()` (`user.role`, `user.id`/`userId` — confira o nome no `AuthContext`) para permissões; `useToast`.
- Produces: `CentralConversas({ conectado })`; `FilaConversas({ filtro, onFiltro, dados, selecionadaId, onSelecionar, onMarcarLidas, onCarregarMais })`; `ConversaAberta({ conversa, contexto, conectado, podeResponder, motivoBloqueio, onAssumir, onDevolver, onEnviado })`; `RespostasRapidas({ conversaId, onInserir })`. A coluna 3 (`ContextoCliente`) vem na Task 11 — nesta task deixe o espaço com um componente vazio no mesmo arquivo `ContextoCliente.tsx` exportando `ContextoCliente({ contexto, conversa })` que retorna `null`.

**Referência:** `4ea360`.
- **Fila:** título "Conversas do WhatsApp", "N abertas" (`contadores.todas`), "Instância: {telefone}" quando conectado; chips Todas/Aguardando você/Pelo Bot/Finalizadas com contadores; "Marcar lidas" (chama `marcarLidas()` sem ids e recarrega). Item: avatar com iniciais (2 letras do nome; sem nome → ícone pessoa), nome ou telefone formatado, selo "Humano" (atendimento humano com responsável), "Aguardando" (status aguardando), "Bot" (atendimento bot), telefone formatado, `horaCurta`, bolinha com `naoLidas` (> 0), prévia (1 linha), "Atendente: {nome}" quando há responsável, selo "Sinal pendente" quando `sinalPendente`. "Carregar mais" quando `proximoCursor`.
- **Atualização:** `listarConversas(filtro)` ao montar, ao trocar filtro e a cada 15 s enquanto `document.visibilityState === 'visible'` (pausa em segundo plano; retoma no `visibilitychange`). A conversa aberta recarrega suas mensagens no mesmo ciclo quando o `ultimaMensagemEm` dela mudou.
- **Conversa aberta:** cabeçalho com nome/telefone, linha "Em atendimento humano ({responsável})" ou "Aguardando você" ou "Com o robô", botões "Assumir" (quando bot ou aguardando e pode), "Devolver ao Bot" (quando humano), "Ver ficha CRM" (link `/clientes/{clientId}`, só com cliente; sem cliente → botão "Cadastrar cliente", ligado na Task 11). Corpo: separadores de dia ("Hoje • 16 de outubro", "Ontem", "14 de outubro"), balões — `in` à esquerda; `out` à direita com rótulo ("Bot EasyAgenda+" para `bot`; "{autor} ({negócio})" para `manual_painel`; "Você pelo celular" para `manual_celular`; "Lembrete automático", "Confirmação automática", "Sinal Pix e recibo", "Lista de espera" para as automáticas) e "• Automático" após a hora nas origens automáticas e `bot`; `painel_evento` como linha central pequena; ícone de situação nos balões de saída (`done` enviada, `done_all` entregue, `done_all` em `text-whatsapp` lida, `error` em `text-danger` falhou com título "Não enviada"); mídia (`tipoMidia`) mostra o marcador + "Abra no celular para ver". "Carregar mensagens anteriores" no topo quando `temMais`. Rola para o fim ao abrir e ao enviar.
- **Rodapé:** `RespostasRapidas` (chips Chave Pix / Como chegar / Horários livres / Política; indisponível = desabilitado com `title` do motivo; clicar insere o texto no campo, sem enviar); textarea "Escreva uma mensagem…" (Enter envia, Shift+Enter quebra linha), botão enviar com ícone `send`. Enviar: `enviarMensagem`, limpa o campo, recarrega mensagens e fila; erro → toast com `getApiErrorMessage(e, 'Não foi possível enviar a mensagem.')` e o texto continua no campo.
- **Bloqueios:** desconectado → faixa "WhatsApp desconectado. Reconecte na aba Conexão." com link `?aba=conexao`, campo e botão desabilitados. Funcionária sem permissão (regra da Task 6 replicada no front para a UI; o backend é a fonte da verdade) → campo desabilitado com "Esta conversa está com outra pessoa".
- **Estados:** sem conversas → "Nenhuma conversa ainda. As mensagens das clientes aparecem aqui."; filtro vazio → "Nenhuma conversa neste filtro."; erro → "Não foi possível carregar as conversas." + "Tentar de novo"; nenhuma selecionada (desktop) → "Escolha uma conversa para ver as mensagens.".
- **Celular (< `lg`):** só a fila; tocar abre a conversa em tela cheia com botão voltar (ícone `arrow_back`, "Voltar para conversas"); a fila volta ao tocar voltar.

- [ ] **Step 1: Testes** (mock de `@/lib/whatsappInbox`, `@/contexts/AuthContext`, `next/navigation`; timers falsos para o polling):
```tsx
// 1. carrega a fila, mostra "14 abertas", chips com contadores e itens com selo/hora/não lidas/"Sinal pendente"
// 2. clicar em "Aguardando você" chama listarConversas('aguardando')
// 3. polling: avança 15 s → nova chamada; com document.visibilityState 'hidden' não chama
// 4. abrir conversa mostra separador "Hoje • 16 de outubro", balão da cliente, balão do bot com "• Automático",
//    linha central "Carla assumiu o atendimento" e ícone de lida
// 5. Enter envia e limpa; Shift+Enter não envia; erro mantém o texto e mostra toast
// 6. resposta rápida "Chave Pix" insere o texto no campo; "Política" indisponível fica desabilitada com o motivo
// 7. "Assumir" chama assumirConversa e mostra "Em atendimento humano (Carla)"; "Devolver ao Bot" chama devolverConversa
// 8. desconectado: faixa com link para ?aba=conexao e campo desabilitado
// 9. funcionária em conversa de outra pessoa: campo desabilitado com "Esta conversa está com outra pessoa"
// 10. estados vazio/erro com "Tentar de novo"
// 11. "Marcar lidas" chama marcarLidas() e recarrega
```
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.**
- [ ] **Step 4:** `npx vitest run src/components/whatsapp src/__tests__/themeCompliance.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): central de conversas com fila, conversa e respostas rápidas`.

---

### Task 11: Conversas — contexto da cliente, cadastro e celular

**Files:**
- Modify: `frontend/src/components/whatsapp/conversas/ContextoCliente.tsx` (implementar), `ConversaAberta.tsx` / `CentralConversas.tsx` (ligar "Cadastrar cliente" e o painel recolhível do celular), `frontend/src/components/clients/ClientFormModal.tsx` (prop `initialPhone?: string` usada quando `editingClient` é nulo)
- Test: `frontend/src/components/whatsapp/__tests__/ContextoCliente.test.tsx`

**Interfaces:**
- Consumes: `ContextoClienteDto` (Task 8); `api.put('/appointments/:id/status', { status: 'confirmado' })` (mesmo fluxo de `confirmarPagamento` em `AppointmentModule.tsx`); `api.post('/clients', payload)` como `ClientModule.tsx`; `ClientFormModal`.
- Produces: `ContextoCliente({ contexto, conversa, onAtualizar })`.

**Referência:** coluna "Contexto da Cliente" do `4ea360`.
- Com cliente: selo da fase (mesmo rótulo/cor usado na lista de Clientes do 2B — reaproveite o mapa de fases de `frontend/src/lib/crm.ts`/`ListaClientes.tsx`), nome, "Cadastrada há N meses" ("há N dias" com menos de 1 mês), "LTV acumulado" `R$ 1.820`, "Ciclo médio" `21 dias` (ou "—").
- "Agendamento relacionado" quando `agendamento`: selo do status ("Sinal pendente" para `aguardando_pagamento`, "Confirmado", "Em atendimento"), "Quinta, 19/09 • 14:00", serviço, valor, "Profissional: {nome}", "Sinal: R$ X" quando houver. Se `aguardando_pagamento`: texto "O bot aguarda a confirmação deste sinal Pix de R$ X para travar a vaga na agenda de {profissional}." e botão "Confirmar agendamento" → `PUT /appointments/{id}/status { status: 'confirmado' }`; sucesso → toast "Pagamento confirmado!" e `onAtualizar()`; erro → toast com a mensagem da API (a reserva expirada vem como erro do backend).
- "Histórico recente": as 2 visitas ("28/08 • Manutenção gel", "R$ 110 (Pago)"); sem visitas → "Nenhuma visita ainda.".
- Sem cliente: bloco "Contato sem cadastro" com o telefone e botão "Cadastrar cliente" → abre `ClientFormModal` com `initialPhone` = telefone formatado; salvar faz `POST /clients`, fecha, toast "Cliente cadastrada!" e `onAtualizar()` (o `GET` da conversa vincula a cliente nova pelo telefone — Task 6).
- Celular: o contexto vira um painel recolhível logo abaixo do cabeçalho da conversa ("Ver contexto da cliente" / "Ocultar contexto").

- [ ] **Step 1: Testes** (`ContextoCliente.test.tsx`):
```tsx
// 1. mostra fase, "Cadastrada há 8 meses", "R$ 1.820", "21 dias"
// 2. agendamento aguardando: texto do bot com "R$ 30,00" e "Camila Rocha"; "Confirmar agendamento" chama api.put e onAtualizar
// 3. erro ao confirmar mostra a mensagem da API
// 4. histórico com 2 visitas e "(Pago)"; vazio → "Nenhuma visita ainda."
// 5. sem cliente: "Contato sem cadastro" e "Cadastrar cliente" abre o modal com o telefone preenchido; salvar chama POST /clients
```
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.**
- [ ] **Step 4:** `cd frontend && npx vitest run src/components/whatsapp src/components/clients && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(whatsapp): contexto da cliente na conversa, cadastro rápido e confirmação do sinal`.

---

### Task 12: Limpeza, documentação e verificação final

**Files:**
- Modify: `docs/design/SEGUIMENTO.md`; qualquer resto de `conteudoDemo.whatsapp`
- Test: suítes completas

- [ ] **Step 1:** `grep -rn "conteudoDemo.whatsapp\|Recursos Ativos\|Latência" frontend/src` → nada (fora de testes que afirmam ausência).
- [ ] **Step 2: `SEGUIMENTO.md`:** registrar o 2C-1 em "O que a migração deixou pronto" (migração `20261016120000_whatsapp_conversas`: três tabelas, `whatsapp_connected_at`, `politica_message`); decisões: regra B (e que a conversa de número novo começa na primeira resposta do robô), SAIR/VOLTAR com sinônimos, 12 h/24 h/180 dias, abas provisórias (Automações hospeda Menu/Mensagens/Simulador até o 2C-2), desvios do Stitch (Latência removida, "Solicitar aumento" virou nota, saúde por taxa de falha, "PARAR" → "SAIR"); remover a pendência do "SAIR automático no 2C" (feito) e manter "Excluir cliente" como pendência.
- [ ] **Step 3: Verificação completa:** backend `npx tsc --noEmit` e `npx vitest run`; frontend `npx tsc --noEmit`, `npx vitest run --testTimeout=30000` e `npx next build` (um build por vez; não apagar `.next`). Tudo verde.
- [ ] **Step 4: Commit** — `chore(2C-1): limpeza, seguimento e verificação final`.
- [ ] **Step 5 (controller, não o implementador):** pedir ao dono autorização para aplicar `20261016120000_whatsapp_conversas` em produção; aplicar com o pooler de sessão (porta 5432) e conferir `migrate status`; conferir as telas no app local (`DISABLE_CRON=true`) lado a lado com `ff12c8` e `4ea360`.
