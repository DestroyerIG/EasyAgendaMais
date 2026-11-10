# Robô cobra o sinal do agendamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o proprietário ligar a opção, o robô do WhatsApp cria a reserva com sinal, envia o Pix/link na conversa e, pago o sinal, confirma o agendamento pelo WhatsApp.

**Architecture:** A criação da reserva com sinal (hoje dentro de `publicBooking.createPendingAppointment`) vira um serviço compartilhado usado pela página pública e pelo robô. O robô ganha um step `awaiting_deposit`. A confirmação e a expiração, que já existem (webhook, conferência a cada minuto, cron), passam a enviar a mensagem certa quando a reserva tem `source = 'whatsapp'`.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Vitest (backend e frontend), Next.js/React no frontend.

**Spec:** `docs/superpowers/specs/2026-11-10-bot-cobra-sinal-design.md`

## Global Constraints
- Branch `feat/bot-cobra-sinal`, worktree `../EasyBarber-bot-sinal`; nunca tocar a branch `feat/cobrar-pix-na-comanda`.
- Opção desligada por padrão; com ela desligada, o robô se comporta exatamente como hoje.
- Forma de pagamento do robô: `(await conexaoService.formas(businessId))[0] ?? 'pix'`.
- Prazo da reserva: `automacoesGatilhos.toleranciaSinal(businessId)` (15, 30 ou 60 min).
- Reserva do robô: `status 'aguardando_pagamento'`, `source 'whatsapp'`, `expiresAt` e `depositAmount` preenchidos.
- Textos do robô em português do Brasil, no tom dos existentes; novos textos em `textos_extras` (sem coluna própria).
- Comandos de teste: backend `cd backend && npx vitest run <arquivo>`; frontend `cd frontend && npx vitest run <arquivo>`; tipos `npm run typecheck` em `backend/`.
- Commits em PT-BR, um por tarefa, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
1. Serviço sem `depositPercentage` (nulo ou 0): o robô confirma direto, como hoje. Teste na Tarefa 4.
2. Cartão pedido pelo padrão do negócio e a cobrança falha: cai no Pix manual e a cliente recebe o copia e cola. Teste na Tarefa 2.
3. Cliente escreve "paguei" ou qualquer texto enquanto espera: recebe a mensagem de espera, sem reiniciar o fluxo nem criar outra reserva. Teste na Tarefa 4.
4. Pagamento chega depois de a reserva expirar ou de o horário ser tomado: vale o fluxo atual (alerta ao negócio, sem mensagem de agendamento confirmado). Teste na Tarefa 5.
5. Webhook repetido: a mensagem de confirmação sai uma vez só. Teste na Tarefa 5.
6. Opção ligada e chave Pix removida depois: o robô não cobra e agenda como antes, com aviso no log. Teste na Tarefa 4.

---

### Task 1: Opção do proprietário (`Business.botCobraSinal`) na API

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Business`, junto de `pixKey`, linha ~54)
- Create: `backend/prisma/migrations/20261110130000_bot_cobra_sinal/migration.sql`
- Modify: `backend/src/modules/businessPublicPage/businessPublicPage.types.ts` (schema de atualização e tipo `PublicPageSettings`)
- Modify: `backend/src/modules/businessPublicPage/businessPublicPage.repository.ts` (os dois `select` com `pixKey`, linhas ~9 e ~29, e o update)
- Modify: `backend/src/modules/businessPublicPage/businessPublicPage.service.ts` (regra de ligar)
- Test: `backend/src/__tests__/businessPublicPageBotSinal.test.ts`

**Interfaces:**
- Produces: campo `botCobraSinal: boolean` em `PublicPageSettings` (leitura) e `botCobraSinal?: boolean` no corpo de atualização. Coluna `bot_cobra_sinal BOOLEAN NOT NULL DEFAULT false`.

- [ ] **Step 1: Escrever os testes** em `businessPublicPageBotSinal.test.ts`, no estilo dos testes `businessPublicPage*` existentes (mesmos mocks do repositório). Casos: `lê botCobraSinal false por padrão`; `liga quando há chave Pix salva e devolve botCobraSinal true`; `recusa ligar sem chave Pix com ValidationError('Cadastre a chave Pix antes de ligar a cobrança do sinal pelo robô')`; `desligar sempre é permitido`.
- [ ] **Step 2: Rodar** `cd backend && npx vitest run src/__tests__/businessPublicPageBotSinal.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** a coluna no schema e a migration (`ALTER TABLE businesses ADD COLUMN bot_cobra_sinal BOOLEAN NOT NULL DEFAULT false;`, conferir o nome real da tabela em `@@map` de `Business`); incluir o campo nos dois `select`, no schema zod de atualização (`botCobraSinal: z.boolean().optional()`) e no update; no serviço, ao receber `botCobraSinal === true`, ler a chave atual (ou a que vem junto no mesmo corpo) e lançar o `ValidationError` acima se não houver.
- [ ] **Step 4: Gerar o client e rodar** `cd backend && npx prisma generate && npx vitest run src/__tests__/businessPublicPageBotSinal.test.ts` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(robo): opção do proprietário para cobrar sinal pelo robô`.

---

### Task 2: Serviço compartilhado de reserva com sinal

**Files:**
- Create: `backend/src/modules/recebimentos/reservaComSinal.rules.ts`
- Create: `backend/src/modules/recebimentos/reservaComSinal.service.ts`
- Modify: `backend/src/modules/publicBooking/publicBooking.repository.ts` (`createPendingAppointment` recebe `source`, padrão `'publico'`)
- Modify: `backend/src/modules/publicBooking/publicBooking.service.ts` (`createPendingAppointment` passa a chamar o serviço novo; `calcDeposit` e `pixManual` saem daqui)
- Test: `backend/src/__tests__/reservaComSinal.test.ts`; manter verdes `publicBooking*.test.ts`

**Interfaces:**
- Produces em `reservaComSinal.rules.ts`: `calcDeposit(price: number, depositPercentage: number): number` (mesma conta de hoje: `Math.round(price * (pct/100) * 100) / 100`) e `pixManual(business: { name: string; pixKey: string | null; pixKeyType: string | null }, valor: number, servico: string): string | null` (movido sem mudar o comportamento).
- Produces em `reservaComSinal.service.ts`:
  ```ts
  export interface EntradaReservaComSinal {
    business: { id: string; name: string; slug: string | null; pixKey: string; pixKeyType: string };
    clientId: string; professionalId: string; serviceId: string;
    serviceName: string; servicePrice: number; depositPercentage: number;
    date: string; time: string;                // 'YYYY-MM-DD', 'HH:mm'
    origem: 'publico' | 'whatsapp';
    formaPedida?: FormaSinal;                  // ausente = primeira forma liberada do negócio
  }
  export interface ReservaComSinal {
    appointment: Awaited<ReturnType<typeof publicBookingRepository.createPendingAppointment>>;
    depositAmount: number; pixPayload: string | null; checkoutUrl: string | null;
    forma: FormaSinal; automatica: boolean; cartaoIndisponivel: boolean;
    toleranciaMin: number; expiresAt: Date;
  }
  reservaComSinalService.criar(e: EntradaReservaComSinal): Promise<ReservaComSinal>
  ```
  Lança `ConflictError('Este horário acabou de ser reservado por outra pessoa')` quando há conflito dentro da trava.

- [ ] **Step 1: Escrever os testes** em `reservaComSinal.test.ts` (mocks de `publicBookingRepository`, `appointmentsPrismaRepository`, `conexaoService`, `cobrancasService`, `automacoesGatilhos.toleranciaSinal`). Casos: `usa a primeira forma liberada quando formaPedida não vem`; `cria a reserva aguardando_pagamento com source da origem, expiresAt na tolerância e depositAmount`; `sem gateway devolve o Pix manual`; `cartão pedido cuja cobrança falha cai no Pix manual com cartaoIndisponivel true`; `conflito dentro da trava lança ConflictError e não cria cobrança`.
- [ ] **Step 2: Rodar** `npx vitest run src/__tests__/reservaComSinal.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** movendo o miolo de `createPendingAppointment` (cálculo do sinal, Pix manual, `expiresAt`, `withProfessionalDayLock` + `hasConflict`, `cobrancasService.criar` e a lógica de `forma`/`cartaoIndisponivel`) para `reservaComSinalService.criar`. Dentro do serviço, as regras de forma (`cartaoForaDoAr`, `usaGateway`) ficam idênticas às atuais.
- [ ] **Step 4: Adaptar `publicBooking.service.ts`**: continua validando negócio, estado da conta, serviço, profissional, horário livre e cliente; depois chama `criar` com `origem: 'publico'` e mantém notificação, consentimento, Google Agenda e `aoCriarReservaComSinal` (que continuam na página pública). O retorno da API pública não muda.
- [ ] **Step 5: Rodar** `npx vitest run src/__tests__/reservaComSinal.test.ts src/__tests__/publicBooking*.test.ts src/__tests__/recebimentosSinalCartao.test.ts` e `npm run typecheck`. Esperado: PASS. Ajustar só os caminhos de mock dos testes antigos, nunca as asserções.
- [ ] **Step 6: Commit** `refactor(sinal): extrai a criação da reserva com sinal para um serviço compartilhado`.

---

### Task 3: Textos novos do robô

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappConstants.ts` (interface `BotConfig`, `DEFAULT_BOT_CONFIG`, novo `STEPS.AWAITING_DEPOSIT = 'awaiting_deposit'`)
- Modify: `backend/src/services/whatsapp/whatsappTextos.ts` (`CATALOGO_TEXTOS`, caminho `schedule`)
- Modify: `backend/src/services/whatsapp/whatsappMessageService.ts` (`FormatMessageData` e `formatMessage`: placeholders `{valor_sinal}`, `{prazo}`, `{link_pagamento}`)
- Test: `backend/src/__tests__/whatsappTextos.test.ts` (existente) e novo caso em `whatsappMessageService`'s test se houver

**Interfaces:**
- Produces: chaves de `BotConfig`: `deposit_request_message` (variáveis `nome_negocio, servico, valor_sinal, prazo, data, horario`), `deposit_checkout_message` (as mesmas mais `link_pagamento`), `deposit_waiting_message` (`prazo`), `deposit_expired_message` (`nome_negocio`), `deposit_cancelled_message` (sem variáveis). `FormatMessageData` ganha `depositAmount?: string; prazoMin?: string; paymentLink?: string`.
- Textos padrão (tom dos existentes): pedido do Pix "⏳ Sua vaga para {servico} está pré-reservada por {prazo} min! Para garantir, pague o sinal de R$ {valor_sinal} pelo Pix. O código vem na próxima mensagem 👇"; checkout "… pague o sinal de R$ {valor_sinal} neste link: {link_pagamento}"; espera "Ainda estamos aguardando o pagamento do sinal. Sua vaga fica reservada por até {prazo} min.\n\n0️⃣ Cancelar a pré-reserva"; expirada "⏰ O prazo para pagar o sinal acabou e o horário foi liberado. Quer agendar de novo? É só mandar um oi."; cancelada "Pré-reserva cancelada. Quando quiser, é só mandar um oi."

- [ ] **Step 1: Escrever os testes**: `o catálogo cobre toda chave nova de BotConfig` (o teste existente de cobertura deve falhar até as entradas existirem), `formatMessage troca {valor_sinal}, {prazo} e {link_pagamento}`.
- [ ] **Step 2: Rodar** `npx vitest run src/__tests__/whatsappTextos.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** as chaves, os padrões, o step e os placeholders.
- [ ] **Step 4: Rodar** os testes acima e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(robo): textos e step do sinal no robô`.

---

### Task 4: O robô cobra o sinal ao agendar

**Files:**
- Create: `backend/src/services/whatsapp/whatsappSinalService.ts`
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts` (criação do agendamento, linha ~1721; novo `case STEPS.AWAITING_DEPOSIT` no `switch` da linha ~2372; novo `handleAwaitingDepositStep`)
- Test: `backend/src/__tests__/whatsappSinal.test.ts`; manter verde `whatsappFlowService.test.ts`

**Interfaces:**
- Consumes: `reservaComSinalService.criar` (Tarefa 2); chaves e step da Tarefa 3; `appointmentService.updateStatus(id, businessId, 'cancelado')` (transição `aguardando_pagamento → cancelado` já permitida).
- Produces em `whatsappSinalService.ts`:
  ```ts
  export interface SinalDoRobo { reserva: ReservaComSinal; negocio: { name: string }; servico: { name: string } }
  export async function reservarComSinalSeAtivo(i: {
    businessId: string; clientId: string; professionalId: string; serviceId: string; date: string; time: string;
  }): Promise<SinalDoRobo | null>   // null = não se aplica: agendar como hoje
  export function deveCobrarNoRobo(i: { botCobraSinal: boolean; pixKey: string | null; pixKeyType: string | null; price: number; depositPercentage: number | null }): boolean
  ```
  Retorna `null` se `botCobraSinal` for falso, não houver chave Pix (log `warn`), o serviço não tiver `depositPercentage > 0` ou o sinal calculado for 0. `ConflictError` do serviço compartilhado sobe para o chamador.

- [ ] **Step 1: Escrever os testes** em `whatsappSinal.test.ts`. `deveCobrarNoRobo`: `falso com a opção desligada`, `falso sem depositPercentage (nulo e 0)`, `falso sem chave Pix`, `verdadeiro com tudo ligado`. Fluxo (mesmos mocks de `whatsappFlowService.test.ts`): `com a opção ligada cria a reserva com source whatsapp e manda a mensagem do sinal e o código Pix em mensagem separada`; `com cartão como padrão manda o link de pagamento, sem copia e cola`; `coloca a sessão em awaiting_deposit com appointmentId e expiresAt`; `serviço sem sinal confirma direto, como hoje`; `conflito oferece outros horários, como hoje`; `no simulador mostra a mensagem com código de teste e AVISO_TESTE e não grava`; `awaiting_deposit: texto livre responde deposit_waiting_message e mantém a sessão`; `awaiting_deposit: 0 cancela a reserva, responde deposit_cancelled_message e apaga a sessão`; `awaiting_deposit: reserva já expirada ou confirmada apaga a sessão e reabre o menu`.
- [ ] **Step 2: Rodar** `npx vitest run src/__tests__/whatsappSinal.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar `whatsappSinalService.ts`** (lê negócio e serviço com `prisma`, aplica `deveCobrarNoRobo`, chama `reservaComSinalService.criar` com `origem: 'whatsapp'` e sem `formaPedida`).
- [ ] **Step 4: Plugar no fluxo**: antes de `appointmentService.create` (fora do simulador e fora da remarcação), chamar `reservarComSinalSeAtivo`; se vier resultado, enviar `deposit_request_message` (ou `deposit_checkout_message`) e, em mensagem separada, o `pixPayload` puro; `updateSession(phone, businessId, STEPS.AWAITING_DEPOSIT, { appointmentId, expiresAt })`; retornar sem a `confirmation_message`. `ConflictError` segue o caminho `oferecerOutrosHorarios`. No simulador, só mostrar a mensagem com `pix_copia_e_cola` de teste. Se o envio da mensagem falhar, expirar a reserva na hora (`recebimentosRepository.expirarReserva` não serve antes do prazo: cancelar com `appointmentService.updateStatus(..., 'cancelado')`) para não segurar horário sem Pix entregue.
- [ ] **Step 5: Implementar `handleAwaitingDepositStep`** conforme os testes do Step 1.
- [ ] **Step 6: Rodar** `npx vitest run src/__tests__/whatsappSinal.test.ts src/__tests__/whatsappFlowService.test.ts` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 7: Commit** `feat(robo): cobra o sinal do agendamento pelo WhatsApp quando o proprietário ativa`.

---

### Task 5: Confirmação do agendamento depois do pagamento

**Files:**
- Create: `backend/src/services/whatsapp/whatsappConfirmacao.ts`
- Modify: `backend/src/modules/appointments/sinalConfirmado.ts` (`avisarSinalConfirmado`)
- Modify: `backend/src/modules/appointments/appointments.repository.ts` (`findById` e o retorno de `updateStatus` devem trazer `source`, `service.price` e `professional.name`; conferir e acrescentar só o que faltar)
- Test: `backend/src/__tests__/sinalConfirmado.test.ts` (existente, ampliar) e `backend/src/__tests__/recebimentosPagamentos.test.ts` (caso de webhook repetido)

**Interfaces:**
- Produces: `textoAgendamentoConfirmado(a: AppointmentWithRelations): Promise<string>` em `whatsappConfirmacao.ts`: carrega `getBotConfig(a.businessId)` e monta `config.confirmation_message` com `formatMessage` (serviço, profissional, data `dd/mm/aaaa`, horário, valor do serviço, nome da cliente, nome do negócio), igual ao que o fluxo envia hoje.
- Comportamento: em `avisarSinalConfirmado`, se `a.source === 'whatsapp'`, o texto enviado ao cliente é `textoAgendamentoConfirmado(a)` (no lugar da frase de sinal confirmado) e a sessão do bot do telefone é apagada com `deleteSession`; qualquer outra origem mantém o texto atual. Notificação, push e agenda externa não mudam. Os dois passos novos nunca lançam.

- [ ] **Step 1: Escrever os testes**: `reserva do robô recebe a confirmation_message com serviço, profissional, data, horário e valor`; `reserva do robô apaga a sessão do telefone`; `reserva da página pública continua com 'Seu sinal foi confirmado e seu horário está garantido'`; `falha ao montar o texto não impede notificação, push e agenda`; em `recebimentosPagamentos`: `webhook repetido do mesmo pagamento envia a confirmação uma única vez`; `pagamento depois da expiração não envia a mensagem de agendamento confirmado`.
- [ ] **Step 2: Rodar** `npx vitest run src/__tests__/sinalConfirmado.test.ts src/__tests__/recebimentosPagamentos.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** `whatsappConfirmacao.ts` e o desvio por `source` em `avisarSinalConfirmado`; completar os `select` do repositório se necessário. Evitar importar `whatsappFlowService.ts` (módulo grande, risco de ciclo): usar `getBotConfig`, `formatMessage` e `deleteSession` diretamente.
- [ ] **Step 4: Rodar** os testes acima, `npx vitest run src/__tests__/appointments*.test.ts` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(robo): confirma o agendamento pelo WhatsApp depois do pagamento do sinal`.

---

### Task 6: Aviso de expiração à cliente

**Files:**
- Modify: `backend/src/services/cronService.ts` (`expirePendingAppointments`, linhas ~169-206)
- Test: `backend/src/__tests__/expirePendingAppointmentsCron.test.ts` (existente, ampliar)

**Interfaces:**
- Consumes: `deposit_expired_message` (Tarefa 3); `getBotConfig`, `formatMessage`, `deleteSession`, `sendWhatsAppMessage`.
- Comportamento: o `select` da busca inclui `source` e `client.phone`; para cada reserva expirada com sucesso (`canceladas`) e `source === 'whatsapp'`, envia a `deposit_expired_message` à cliente (`origin: 'pix_recibo'`) e apaga a sessão; falha em um envio não afeta os demais nem a notificação ao negócio.

- [ ] **Step 1: Escrever os testes**: `reserva do robô expirada avisa a cliente e apaga a sessão`; `reserva da página pública expirada não manda WhatsApp`; `reserva paga entre a leitura e a expiração (expirarReserva falso) não avisa`; `falha no envio não impede as outras reservas nem a notificação do negócio`.
- [ ] **Step 2: Rodar** `npx vitest run src/__tests__/expirePendingAppointmentsCron.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar** o envio dentro do laço de `canceladas`, cada um protegido por `try/catch` com `logger.warn`.
- [ ] **Step 4: Rodar** o teste acima e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(robo): avisa a cliente quando a pré-reserva do sinal expira`.

---

### Task 7: Toggle em Ajustes › Recebimentos

**Files:**
- Create: `frontend/src/components/recebimentos/SinalNoRoboCard.tsx`
- Modify: `frontend/src/components/settings/RecebimentosSection.tsx` (renderizar o card abaixo do `PixManualCard`)
- Modify: `frontend/src/lib/businessPublicPage.ts` (`PublicPageSettings.botCobraSinal: boolean`; `updateSettings` aceita `botCobraSinal?: boolean`)
- Test: `frontend/src/components/recebimentos/__tests__/SinalNoRoboCard.test.tsx`

**Interfaces:**
- Consumes: `businessPublicPageApi.getSettings()` e `updateSettings({ botCobraSinal })` (Tarefa 1).
- Produces: `SinalNoRoboCard()` com um interruptor "Cobrar o sinal pelo WhatsApp". Texto de apoio: o robô passa a cobrar o sinal dos serviços que têm sinal configurado, usando a forma de pagamento padrão do negócio, e confirma o horário depois do pagamento. Sem chave Pix salva, o interruptor fica desabilitado com a mensagem "Cadastre a chave Pix acima para ativar."; erro do servidor aparece em `Banner`. Seguir o visual e os componentes de `PixManualCard.tsx` (`Card`, `Banner`, `Skeleton`).

- [ ] **Step 1: Escrever os testes** no estilo de `PixManualCard.test.tsx`: `mostra o interruptor desligado por padrão`; `liga e salva botCobraSinal true`; `fica desabilitado sem chave Pix e mostra o aviso`; `mostra o erro quando salvar falha e volta ao valor anterior`.
- [ ] **Step 2: Rodar** `cd frontend && npx vitest run src/components/recebimentos/__tests__/SinalNoRoboCard.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar** o card e o encaixe na seção.
- [ ] **Step 4: Rodar** o teste, `npx vitest run src/components/settings` e `npm run typecheck` (ou `npx tsc --noEmit`) em `frontend/`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(recebimentos): interruptor para o robô cobrar o sinal`.

---

### Task 8: Documentação e verificação final

**Files:**
- Modify: `WHATSAPP_BOT.md` (nova seção "Cobrança de sinal pelo robô": opção, regra, passos da conversa, textos editáveis, o que acontece no pagamento e na expiração)
- Modify: `API_DOCS.md` (campo `botCobraSinal` nas configurações da página pública)

- [ ] **Step 1: Atualizar os dois documentos.**
- [ ] **Step 2: Rodar a suíte inteira**: `cd backend && npx vitest run` e `npm run typecheck`; `cd frontend && npx vitest run` e checagem de tipos. Esperado: tudo verde. Se algo falhar fora do escopo, informar sem corrigir às cegas.
- [ ] **Step 3: Rodar localmente** (regra do projeto após trabalho visual): subir backend e frontend, ligar a opção em Ajustes › Recebimentos e passar pelo simulador do robô com um serviço que tenha sinal, conferindo a mensagem do sinal e o `AVISO_TESTE`. Pagamento real de Mercado Pago/InfinitePay segue sem teste real; dizer isso no relatório.
- [ ] **Step 4: Commit** `docs(robo): documenta a cobrança de sinal pelo robô`.
