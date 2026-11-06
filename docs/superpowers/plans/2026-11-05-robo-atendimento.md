# Robô de atendimento: plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os erros do robô de WhatsApp, adaptar o menu ao segmento do negócio e tornar editável, em uma tela só, tudo o que a cliente lê.

**Architecture:** Três PRs em sequência. O PR 1 corrige o comportamento sem migração. O PR 2 cria a fonte única do menu por segmento e a opção "Remarcar ou cancelar". O PR 3 cria o catálogo de textos, com uma coluna JSON nova, e reorganiza a tela.

**Tech Stack:** Node, Express, Prisma, PostgreSQL e Vitest no backend. Next.js, React, Testing Library e Vitest no frontend.

**Spec:** `docs/superpowers/specs/2026-11-05-robo-atendimento-design.md`

## Global Constraints

- Tudo em português do Brasil: textos, nomes novos de funções de domínio e mensagens de commit.
- Trabalhar em worktree próprio (`superpowers:using-git-worktrees`), a partir da `main` atualizada. A pasta principal está em uso por outro trabalho (`feat/pagina-publica-fase2`). Não mexer nos arquivos desse trabalho.
- Branches: `fix/robo-correcoes`, `feat/robo-menu-segmento` e `feat/robo-textos-tela`. Cada uma sai da `main` depois que o dono juntar a anterior.
- Copiar a spec e este plano para o worktree e commitá-los no primeiro commit de `fix/robo-correcoes`.
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Todo PR termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- O `backend/.env` aponta para PRODUÇÃO. Migração só com autorização explícita do dono, em momento separado do PR.
- Testes do backend: exportar `DATABASE_URL` e `DIRECT_URL` para um endereço inexistente antes do `npx vitest run`.
- Suíte completa do frontend leva mais de 8 min: rodar sem `next dev` no ar. Durante as tarefas, rodar só os arquivos afetados.
- Porta 3000 costuma estar ocupada: usar outra no `next dev`.
- Nunca enviar `@seunegocio`, nem um padrão com desconto ou benefício que o negócio não definiu.
- Texto editado pelo dono nunca é alterado por mudança de padrão ou de segmento.

## Review Focus

1. A cliente digita o número de uma opção escondida ou um número maior que a lista: recebe opção inválida e o menu, nunca outra opção. Teste na Task 1.
2. Todas as opções ficam desligadas ou escondidas: o robô não mostra números que não funcionam. Teste na Task 1.
3. Outra pessoa pega o horário durante a remarcação: o agendamento original continua intacto e a cliente escolhe de novo. Teste na Task 3.
4. O simulador roda com um número que já é cliente real do negócio: nada é gravado. Teste na Task 4.
5. O dono abre a tela e clica em Salvar sem mexer em nada: nenhum texto vira "Personalizada". Teste na Task 10.

---

# PR 1: correções, sem migração

### Task 1: Numeração pela lista visível

**Files:**
- Create: `backend/src/services/whatsapp/whatsappMenu.ts`
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts` (`buildMenuMessage`, `handleMenuStep`)
- Modify: `backend/src/services/whatsapp/whatsappConfigService.ts` (`MenuOptionRow` exportado)
- Test: `backend/src/__tests__/whatsappMenu.test.ts`, `backend/src/__tests__/whatsappFlowService.test.ts`

**Interfaces:**
- Produces:
  - `interface ContextoMenu { promocoes: string; instagramVisivel: boolean }`
  - `opcoesVisiveis(options: MenuOptionRow[], ctx: ContextoMenu): MenuOptionRow[]`: ativas, ordenadas por `option_order`, sem `handler === 'rating'`, sem `promotions` se `ctx.promocoes.trim()` for vazio, sem `instagram` se `!ctx.instagramVisivel`.
  - `resolverEscolha(visiveis: MenuOptionRow[], escolha: number): MenuOptionRow | null`: posição 1..n.
  - `carregarMenuVisivel(businessId: string, config: BotConfig): Promise<MenuOptionRow[]>`: usa `getMenuOptions` e lê `instagramHandle`.
- A Task 2 define `instagramVisivel`. Até lá, `carregarMenuVisivel` passa `instagramVisivel: true`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const op = (order: number, handler: string, active = true) =>
  ({ id: String(order), option_order: order, label: handler, emoji: '', type: 'system', handler, active }) as MenuOptionRow;
const ctx = { promocoes: 'Oferta', instagramVisivel: true };

it('renumera sem a opção desligada', () => {
  const v = opcoesVisiveis([op(1, 'schedule'), op(5, 'promotions', false), op(6, 'instagram'), op(7, 'attendant')], ctx);
  expect(resolverEscolha(v, 2)?.handler).toBe('instagram');
  expect(resolverEscolha(v, 3)?.handler).toBe('attendant');
});
it('esconde promoções sem texto e nunca mostra avaliação', () => {
  const v = opcoesVisiveis([op(1, 'rating'), op(2, 'promotions'), op(3, 'attendant')], { ...ctx, promocoes: '   ' });
  expect(v.map((o) => o.handler)).toEqual(['attendant']);
});
it('número fora da lista não resolve', () => {
  const v = opcoesVisiveis([op(1, 'schedule')], ctx);
  expect(resolverEscolha(v, 0)).toBeNull();
  expect(resolverEscolha(v, 2)).toBeNull();
});
```

No teste do fluxo, com a opção 5 desligada, o texto "5" responde o que o menu mostrou como 5. Com `opcoesVisiveis` vazia, a mensagem enviada não contém `1️⃣` e contém `attendant_message`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappMenu.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar `whatsappMenu.ts` e ligar o fluxo**

`buildMenuMessage` e `handleMenuStep` passam a usar `carregarMenuVisivel`; a consulta por `option_order = ${choice}` sai. Com lista vazia, `buildMenuMessage` devolve o cabeçalho seguido de `attendant_message`, e `buildFallbackWelcomeMessage` só cobre erro de leitura. Ajustar nos testes existentes os mocks que simulavam a consulta por `option_order`, usando `mockGetMenuOptions`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappMenu.test.ts src/__tests__/whatsappFlowService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `fix(robo): numero do menu segue a lista que a cliente le`

### Task 2: Variáveis, promoções e Instagram

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappConstants.ts`, `whatsappMenu.ts`, `whatsappFlowService.ts`, `whatsappConfigService.ts`
- Modify: `backend/src/routes/whatsapp.ts`
- Modify: `frontend/src/components/whatsapp/MenuOptionsPanel.tsx`, `MessageConfigPanel.tsx`, `frontend/src/components/WhatsAppModule.tsx`
- Test: `backend/src/__tests__/whatsappMenu.test.ts`, `whatsappFlowService.test.ts`; `frontend/src/components/whatsapp/__tests__/MenuOptionsPanel.test.tsx` (novo)

**Interfaces:**
- Produces:
  - `instagramVisivel(handle: string | null | undefined, mensagem: string): boolean`
  - `normalizarInstagram(entrada: string): string | null`: aceita `perfil`, `@perfil` ou URL do instagram.com e devolve `@perfil`; vazio devolve `null`; perfil inválido lança `ValidationError`. Regex do perfil: `/^[a-zA-Z0-9._]{1,30}$/`.
  - `GET /whatsapp/config/instagram` → `{ handle: string | null }`
  - `PUT /whatsapp/config/instagram` com `{ handle: string | null }` → `{ handle: string | null }`
  - `PROMOCOES_PADRAO_ANTIGO: string`: o texto atual de `promotions_message`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it('mostra Instagram com perfil ou com texto próprio sem a variável', () => {
  expect(instagramVisivel('@loja', DEFAULT_BOT_CONFIG.instagram_message)).toBe(true);
  expect(instagramVisivel(null, DEFAULT_BOT_CONFIG.instagram_message)).toBe(false);
  expect(instagramVisivel(null, 'Siga @loja')).toBe(true);
  expect(instagramVisivel(null, 'Siga {instagram_handle}')).toBe(false);
});
it('normaliza o perfil', () => {
  expect(normalizarInstagram('https://instagram.com/loja.x/')).toBe('@loja.x');
  expect(normalizarInstagram(' loja ')).toBe('@loja');
  expect(normalizarInstagram('')).toBeNull();
  expect(() => normalizarInstagram('com espaço')).toThrow();
});
```

No fluxo: Promoções com `{nome_negocio}` chega com o nome do negócio; Instagram com `{nome_negocio}` e `{instagram_handle}` chega preenchido; nenhuma mensagem enviada contém `@seunegocio`. Em `getBotConfig`, texto salvo igual a `PROMOCOES_PADRAO_ANTIGO` volta como `''`. No frontend, editar a opção `instagram` mostra o campo "Perfil do Instagram", e salvar chama `onSalvarInstagram('@loja')`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappMenu.test.ts`
Expected: FAIL, funções inexistentes.

- [ ] **Step 3: Implementar**

`promotions_message` padrão passa a ser `''`. Promoções e Instagram passam por `formatMessage` com `businessName` e `instagramHandle`. Em `MessageConfigPanel`, tirar `{lista_agendamentos}` das dicas. Em `cancel_no_appointments_message` e `reschedule_no_appointments_message`, tirar "escolha a opção 1️⃣" e usar "Se quiser marcar um horário, volte ao menu.". `MenuOptionsPanel` recebe `instagramHandle` e `onSalvarInstagram`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappMenu.test.ts src/__tests__/whatsappFlowService.test.ts`, depois no frontend `npx vitest run src/components/whatsapp/__tests__/MenuOptionsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**: `fix(robo): variaveis, promocoes e perfil do instagram`

### Task 3: Remarcar move o agendamento

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappBookingService.ts` (`handleConfirmReschedule`)
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts` (`handleChooseTimeStep`)
- Modify: `backend/src/services/whatsapp/whatsappConstants.ts`, `whatsappVocabulario.ts`
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`

**Interfaces:**
- Produces: `BotConfig.reschedule_success_message`, com padrão `'✅ Seu horário foi remarcado!\n\n📋 Serviço: {servico}\n👤 Profissional: {profissional}\n📅 Data: {data}\n⏰ Horário: {horario}\n\nAté lá! 👋'`. Fica só como constante neste PR; a Task 10 torna editável. `mensagensPadrao` adapta o rótulo "Profissional".
- Sessão: `rescheduleAppointmentId: string`, além de `serviceId`, `serviceName`, `serviceDuration`, `professionalId`, `professionalName`.

- [ ] **Step 1: Escrever os testes que falham**

Com a sessão de remarcação em `choose_time`:
- `appointmentsService.update` é chamado com `(id, businessId, { date, time, professionalId })`, e `create` não é chamado.
- A mensagem enviada contém "remarcado", o serviço e a profissional, sem campo vazio.
- `update` rejeitado com `ConflictError`: a cliente recebe "acabou de ser reservado", a sessão continua em `choose_time`, e nenhum `create` ou cancelamento acontece.
- O próprio horário do agendamento não conta como conflito na consulta de `conflictRows`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts -t remarc`
Expected: FAIL, `update` não chamado.

- [ ] **Step 3: Implementar**

`handleConfirmReschedule` busca nome e duração do serviço e nome da profissional e grava na sessão. `handleChooseTimeStep` passa `AND id <> rescheduleAppointmentId` na checagem de conflito quando houver remarcação, e chama `update` em vez de `create`. `appointmentsService.update` já valida conflito quando recebe `date`, `time` e `professionalId`, e avisa a profissional.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts src/__tests__/appointments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `fix(robo): remarcar move o agendamento existente`

### Task 4: Simulador sem gravar

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts`, `whatsappBookingService.ts`
- Modify: `backend/src/routes/whatsapp.ts`
- Modify: `frontend/src/components/whatsapp/ChatSimulator.tsx`, `frontend/src/components/WhatsAppModule.tsx`
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`, `whatsappSimulatorRoute.test.ts`; `frontend/src/components/whatsapp/__tests__/ChatSimulator.test.tsx` (novo)

**Interfaces:**
- Produces:
  - `AVISO_TESTE = '🧪 Teste: nada foi agendado.'`
  - `agendamentoExemplo(agora: Date): AppointmentListRow`: id `simulador`, amanhã às 14:00.
  - `POST /whatsapp/simulator/reset` com `{ phone?: string }` → `{ reiniciado: true }`: apaga só a sessão do simulador.
  - `ChatSimulator` props: `onSendMessage: (text: string) => Promise<string[]>`, `onLimpar: () => Promise<void>`, `temAlteracoes: boolean`.
- As funções de cancelar e remarcar em `whatsappBookingService.ts` recebem o parâmetro final `simulado: boolean`, vindo de `sendContext.simulate === true`.

- [ ] **Step 1: Escrever os testes que falham**

Com `simulationMode: true`, passando pelo fluxo completo e com `prisma.client.findFirst` devolvendo um cliente real:

```ts
expect(prisma.client.create).not.toHaveBeenCalled();
expect(prisma.client.update).not.toHaveBeenCalled();
expect(mockAppointmentServiceCreate).not.toHaveBeenCalled();
expect(prisma.appointment.update).not.toHaveBeenCalled();
expect(inboxRecorder.pedirAtendimentoHumano).not.toHaveBeenCalled();
expect(automacoesGatilhos.aoCancelar).not.toHaveBeenCalled();
```

A última resposta do agendamento simulado contém `AVISO_TESTE`. Cancelar no simulador lista o agendamento de exemplo. No frontend: três respostas viram três balões; com `temAlteracoes`, aparece "O teste usa as mensagens salvas"; Limpar chama `onLimpar`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts -t simul`
Expected: FAIL, `create` chamado.

- [ ] **Step 3: Implementar**

Em simulação, o fluxo guarda nome e dados só na sessão e pula toda escrita. Conferir, com `grep`, todas as chamadas `prisma.*.(create|update|upsert|delete)`, `appointmentService`, `automacoesGatilhos`, `inboxRecorder` e `respostas` alcançáveis a partir de `handleIncomingMessage`. `handleSimulatorMessage` passa a devolver `response.data?.botResponses ?? []`. `WhatsAppModule` calcula `temAlteracoes` comparando `botConfig` com a última versão salva.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts src/__tests__/whatsappSimulatorRoute.test.ts src/__tests__/whatsappMessageServiceSimulator.test.ts`, depois no frontend `npx vitest run src/components/whatsapp/__tests__/ChatSimulator.test.tsx src/components/whatsapp/__tests__/WhatsAppModule.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**: `fix(robo): simulador nao grava dados reais e mostra todas as respostas`

### Task 5: Avaliação sai do robô

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappBookingService.ts`, `whatsappFlowService.ts`, `whatsappConstants.ts`, `whatsappConfigService.ts`
- Modify: `backend/src/routes/whatsapp.ts`
- Modify: `backend/src/modules/whatsappAutomacoes/respostas.repository.ts` (`salvarNota`)
- Modify: `frontend/src/components/whatsapp/MessageConfigPanel.tsx`, `frontend/src/components/WhatsAppModule.tsx`
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`, `respostasRepository.test.ts`; `frontend/src/components/whatsapp/__tests__/MessageConfigPanel.test.tsx`

**Interfaces:**
- Remove: `handlePostAttendanceEvaluation`, `handleSendRating`, `RATING_TEXTS`, `STEPS.SEND_RATING`, o `case 'rating'`, e as chaves `no_previous_appointments_message`, `rating_question_message`, `rating_confirmation_message` de `BotConfig` nos dois lados. As colunas ficam no banco.

- [ ] **Step 1: Escrever os testes que falham**

- Sessão gravada com `step: 'send_rating'` e texto `1`: `prisma.whatsappRating.upsert` não é chamado e a resposta é o menu.
- `GET /config/menu` não devolve a opção `rating`.
- A tela não mostra "Pergunta de Avaliação".
- `salvarNota` com nota já gravada pelo link não altera a nota existente.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts -t avalia`
Expected: FAIL.

- [ ] **Step 3: Implementar**

O `default` do `switch` de steps já reinicia a sessão e mostra o menu. `DEFAULT_MENU_OPTIONS` e a cópia em `routes/whatsapp.ts` perdem a opção `rating`. `GET /config/menu` filtra `handler = 'rating'`. `salvarNota` troca o `upsert` por `create`, ignorando o erro `P2002`, para uma nota gravada nunca ser sobrescrita. Reordenar continua funcionando, pois a numeração é por posição. Conferir que o link do comprovante e a automação não dependem do que saiu.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts src/__tests__/avaliacoes.test.ts src/__tests__/respostasService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `fix(robo): avaliacao fica so na automacao, com nota de 1 a 5`

### Task 6: Saudação única e tom neutro

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappConstants.ts`, `whatsappFlowService.ts` (`buildContextualMenuMessage`, `buildBusinessContextMessage`)
- Modify: `backend/src/services/whatsapp/whatsappMessageService.ts` (`buildWelcomeMessage`)
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`, `whatsappGreeting.test.ts`, `vocabulario.test.ts`

**Interfaces:**
- `buildWelcomeMessage(welcomeHeader, menuOptions, businessName, contexto?: string): string`: `contexto` entra entre o cabeçalho e o menu.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const msg = buildWelcomeMessage('Olá 👋 Que bom ter você aqui!', [{ label: 'Agendar', emoji: '' }], 'Loja', 'Hoje atendemos até as 19:00.');
expect(msg.match(/Olá/g)).toHaveLength(1);
expect(msg.indexOf('Hoje atendemos')).toBeLessThan(msg.indexOf('1️⃣'));
```

E para os padrões: nenhum texto de `DEFAULT_BOT_CONFIG` contém `Bem-vindo`, `Um atendente`, `👨‍💼`, `dicas de estilo` ou `dicas de beleza`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Padrões novos:
- `welcome_header`: `'Olá 👋 Que bom ter você aqui!\n\nSou o assistente virtual de {nome_negocio} 🤖.\n\nComo posso ajudar hoje?'`
- `attendant_message`: `'Nossa equipe vai falar com você em breve! 💬'`
- `ask_name_message`: `'Vejo que é sua primeira vez aqui! 😊\n\nQual o seu *nome completo*?'` (sem mudança)
- `instagram_message`: `'📱 *Nos acompanhe no Instagram!*\n\n👉 {instagram_handle}\n\nVeja nossos trabalhos mais recentes e novidades.'`
- Contexto: `Hoje atendemos até as {hora}.`, e, com encaixe, ` Também aceitamos encaixes durante o horário de atendimento.`
- `✅ Olá, *${name}*! Bem-vindo!` vira `✅ Olá, *${name}*!`

Corrigir "Tambem" e "horario" nos textos do fluxo. `FALLBACK_BOT_CONFIG.welcome_header` e `buildFallbackWelcomeMessage` seguem o novo tom.

- [ ] **Step 4: Rodar a suíte do backend**

Run: `npx vitest run` e `npm run typecheck`
Expected: tudo PASS. Registrar no PR o resultado real.

- [ ] **Step 5: Commit**: `fix(robo): uma saudacao so e textos sem genero`

- [ ] **Step 6: Abrir o PR 1**

Rodar a conferência visual da aba Conexão, conforme a Task 13, Step 5. Abrir o PR de `fix/robo-correcoes` para a `main`, sem migração. Parar e esperar o dono juntar antes do PR 2.

---

# PR 2: menu por segmento

### Task 7: Fonte única do menu

**Files:**
- Create: `backend/src/services/whatsapp/whatsappMenuPadrao.ts`
- Modify: `backend/src/services/whatsapp/whatsappConstants.ts`, `whatsappConfigService.ts`, `whatsappFlowService.ts`, `backend/src/routes/whatsapp.ts`
- Test: `backend/src/__tests__/whatsappMenuPadrao.test.ts`

**Interfaces:**
- Produces: `menuPadrao(segmento: Segmento): MenuOption[]`, usado na criação, no reset e na mensagem de reserva.
- Remove: `DEFAULT_MENU_OPTIONS` das duas origens e a lista fixa de `buildFallbackWelcomeMessage`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it.each([
  ['barbearia', '📅 Agendar horário', '✂️ Serviços e preços'],
  ['unhas', '📅 Agendar horário', '💅 Serviços e preços'],
  ['cilios_sobrancelhas', '📅 Agendar horário', '✨ Serviços e preços'],
  ['cabelo', '📅 Agendar horário', '💇 Serviços e preços'],
  ['estetica', '📅 Agendar procedimento', '✨ Procedimentos e preços'],
  ['outro', '📅 Agendar horário', '📋 Serviços e preços'],
])('%s', (seg, um, dois) => {
  const m = menuPadrao(seg as Segmento);
  expect(`${m[0].emoji} ${m[0].label}`).toBe(um);
  expect(`${m[1].emoji} ${m[1].label}`).toBe(dois);
  expect(m.slice(2).map((o) => `${o.emoji} ${o.label}`)).toEqual(
    ['🔄 Remarcar ou cancelar', '🎉 Promoções', '📱 Instagram', '💬 Falar com a equipe']);
  expect(m.map((o) => o.handler)).toEqual(['schedule', 'view_services', 'manage', 'promotions', 'instagram', 'attendant']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappMenuPadrao.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar e trocar as origens**

`seedDefaultMenuOptions(businessId)`, `GET /config/menu` e `POST /config/menu/reset` leem o segmento de `businessSettings` e usam `menuPadrao`. Sem configuração do negócio, vale `outro`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappMenuPadrao.test.ts src/__tests__/whatsappFlowService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `feat(robo): menu padrao por segmento em fonte unica`

### Task 8: Remarcar ou cancelar

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappBookingService.ts`, `whatsappConstants.ts`, `whatsappFlowService.ts`
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`

**Interfaces:**
- Produces:
  - `STEPS.MANAGE_CHOOSE`, `STEPS.MANAGE_ACTION`
  - `handleManageAppointments(phone, businessId, config, simulado): Promise<BookingMessageResult>`
  - `handleManageChoose(phone, choice, businessId, data, config, simulado)` e `handleManageAction(phone, choice, businessId, data, config, simulado)`
  - `BotConfig.manage_list_message = '🔄 Seus agendamentos:'`
  - `BotConfig.manage_no_appointments_message = '📋 Você não tem agendamentos próximos.'`
  - `BotConfig.manage_action_message = 'O que deseja fazer com o agendamento de {data} às {horario}?\n\n1️⃣ Remarcar\n2️⃣ Cancelar\n\n0️⃣ Voltar ao menu'`
- Consumes: o fluxo de remarcação da Task 3 e o cancelamento de `handleConfirmCancel`, extraídos para funções internas reutilizadas pelos handlers `cancel`, `reschedule` e `manage`.

- [ ] **Step 1: Escrever os testes que falham**

- Dois agendamentos: lista com dois itens; escolher 2 mostra `manage_action_message` daquele agendamento.
- Um agendamento: pula a lista.
- Nenhum: `manage_no_appointments_message`.
- Ação 1 inicia a remarcação do agendamento escolhido. Ação 2 cancela e dispara `aoCancelar`. Ação 0 volta ao menu.
- Ação inválida repete a pergunta.
- Em simulação, ação 2 não grava nada.
- Os handlers `cancel` e `reschedule` continuam funcionando.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts -t "remarcar ou cancelar"`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Adicionar `case 'manage'` em `handleMenuStep`, e `STEPS.MANAGE_CHOOSE` e `STEPS.MANAGE_ACTION` no `switch` principal.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `feat(robo): opcao remarcar ou cancelar`

### Task 9: Quem já usa o sistema

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappMenuPadrao.ts`, `whatsappConfigService.ts`, `backend/src/routes/whatsapp.ts`
- Test: `backend/src/__tests__/whatsappMenuPadrao.test.ts`

**Interfaces:**
- Produces:
  - `menuNaoPersonalizado(rows: MenuOptionRow[]): boolean`: verdadeiro se as linhas forem iguais, em ordem, nome, emoji e estado, a `menuPadrao` de qualquer segmento, ao menu antigo de 9 opções, à variante com 💈 em Agendar ou ao menu de 8 opções sem `rating` que o PR 1 gravou, e sem opção própria.
  - `garantirMenuAtual(businessId: string, segmento: Segmento): Promise<void>`: em uma transação, troca o menu não personalizado por `menuPadrao(segmento)` se ele for diferente, e apaga a linha `rating` de menu personalizado.
- `getMenuOptions` e `GET /config/menu` chamam `garantirMenuAtual` antes de ler.

- [ ] **Step 1: Escrever os testes que falham**

- Menu antigo de 9 opções → não personalizado. O mesmo com 💈.
- Menu de 8 opções sem `rating`, gravado pelo PR 1 → não personalizado, e garantirMenuAtual o troca pelo menu atual.
- Uma opção renomeada, desligada, movida ou própria → personalizado.
- `menuPadrao('barbearia')` lido com segmento `estetica` → menu de estética. É assim que a troca de segmento funciona.
- Menu personalizado com `rating` perde só essa linha.
- Segunda chamada não escreve nada.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappMenuPadrao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Depois disso, retirar o filtro de `rating` de `GET /config/menu`, que a Task 5 criou. O de `opcoesVisiveis` fica.

- [ ] **Step 4: Rodar a suíte do backend**

Run: `npx vitest run` e `npm run typecheck`
Expected: tudo PASS.

- [ ] **Step 5: Commit**: `feat(robo): atualiza menus nao personalizados`

- [ ] **Step 6: Abrir o PR 2**

PR de `feat/robo-menu-segmento` para a `main`, sem migração. Parar e esperar o dono juntar antes do PR 3.

---

# PR 3: textos e tela

### Task 10: Catálogo de textos e migração

**Files:**
- Create: `backend/src/services/whatsapp/whatsappTextos.ts`
- Create: `backend/prisma/migrations/<timestamp>_robo_textos/migration.sql`, com timestamp posterior à última migração da `main`
- Modify: `backend/prisma/schema.prisma`, `backend/src/services/whatsapp/whatsappConfigService.ts`, `whatsappVocabulario.ts`, `backend/src/routes/whatsapp.ts`
- Test: `backend/src/__tests__/whatsappTextos.test.ts`

**Interfaces:**
- SQL: `ALTER TABLE whatsapp_bot_config ADD COLUMN textos_extras JSONB NOT NULL DEFAULT '{}';`. Prisma: `textosExtras Json @default("{}") @map("textos_extras")`.
- Produces:
  - `interface TextoDef { chave: string; caminho: 'geral' | 'schedule' | 'view_services' | 'manage' | 'promotions' | 'instagram' | 'attendant'; rotulo: string; variaveis: string[]; importantes?: string[]; permiteVazio?: boolean; max?: number }`
  - `CATALOGO_TEXTOS: TextoDef[]`, na ordem da conversa. Não inclui `session_expired_message` nem `reminder_message`.
  - `textosDoNegocio(businessId): Promise<TextoDto[]>`, com `TextoDto = TextoDef & { valor: string; padrao: string; personalizado: boolean }`
  - `salvarTextos(businessId, textos: Record<string, string | null>): Promise<TextoDto[]>`
  - `GET /whatsapp/config/textos` e `PUT /whatsapp/config/textos` com `{ textos }`
- Chaves com coluna própria continuam na coluna; as novas ficam em `textos_extras`.
- Limite: `max` padrão de 2000; a política mantém 1000.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it('salvar sem mexer não personaliza nada', async () => {
  const antes = await textosDoNegocio(ID);
  const depois = await salvarTextos(ID, Object.fromEntries(antes.map((t) => [t.chave, t.valor])));
  expect(depois.filter((t) => t.personalizado)).toEqual([]);
});
it('texto igual ao padrão atual gravado no banco não conta como personalizado', ...);
it('recusa vazio, menos promoções e política', async () => {
  await expect(salvarTextos(ID, { attendant_message: '  ' })).rejects.toThrow();
  await expect(salvarTextos(ID, { promotions_message: '' })).resolves.toBeDefined();
});
it('null restaura o padrão', ...);
it('recusa chave fora do catálogo', ...);
it('texto editado não muda ao trocar de segmento', ...);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappTextos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`mensagensPadrao(v)` passa a cobrir todo o catálogo e também o segmento `outro`. `salvarTextos` grava `null` quando o valor for igual ao padrão do segmento. `getBotConfig` junta colunas, `textos_extras` e padrões. Criar a migração sem aplicar em produção: `npx prisma generate` e `npm run typecheck` bastam neste passo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappTextos.test.ts src/__tests__/vocabulario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `feat(robo): catalogo de textos editaveis`

### Task 11: Tirar os textos fixos do fluxo

**Files:**
- Modify: `backend/src/services/whatsapp/whatsappFlowService.ts`, `whatsappBookingService.ts`, `whatsappMessageService.ts`, `whatsappTextos.ts`
- Test: `backend/src/__tests__/whatsappFlowService.test.ts`, `whatsappTextos.test.ts`

**Interfaces:**
- Chaves novas no catálogo:

| Chave | Caminho | Variáveis |
|---|---|---|
| `services_list_title`, `no_services_message` | `view_services` | |
| `name_greeting_message` | `schedule` | `nome_cliente` |
| `choose_service_title`, `choose_professional_title`, `no_professionals_message`, `choose_date_title`, `choose_time_title`, `closed_day_message`, `slot_taken_message`, `walkin_notice`, `booking_failed_message` | `schedule` | |
| `manage_list_message`, `manage_no_appointments_message` | `manage` | |
| `manage_action_message` | `manage` | `data`, `horario` |
| `cancel_success_message` | `manage` | |
| `reschedule_success_message` | `manage` | `servico`, `profissional`, `data`, `horario` |
| `new_date_title`, `list_error_message` | `manage` | |
| `out_of_hours_message` | `geral` | `horario_atendimento` |
| `today_hours_message` | `geral` | `hora_fechamento` |
| `paused_message` | `geral` | `nome_negocio` |
| `invalid_list_choice_message` | `geral` | |

- `formatMessage` ganha `{horario_atendimento}` e `{hora_fechamento}`. A confirmação de agendamento passa a usar `formatMessage`.

- [ ] **Step 1: Escrever os testes que falham**

Para cada chave, um `it.each` confirma que o texto personalizado aparece no ponto certo do fluxo. Um teste compara `Object.keys` do padrão com `CATALOGO_TEXTOS`, para nenhuma chave ficar sem padrão.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts -t "texto personalizado"`
Expected: FAIL.

- [ ] **Step 3: Implementar e fazer a varredura**

Trocar cada texto fixo pela chave. Depois varrer `whatsappFlowService.ts` e `whatsappBookingService.ts` em busca de strings que chegam a `sendWhatsAppMessage` ou a `{ message }`. O que a cliente lê e ficou de fora entra no catálogo, exceto erros técnicos genéricos. A resposta de opção própria (response_message do menu personalizado) também passa por `formatMessage`, para aceitar variáveis como `{nome_negocio}`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/whatsappFlowService.test.ts src/__tests__/whatsappTextos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**: `feat(robo): textos do fluxo passam a ser editaveis`

### Task 12: Respostas das automações

**Files:**
- Modify: `backend/src/modules/whatsappAutomacoes/automacoes.rules.ts`, `automacoes.types.ts`, `respostas.service.ts`
- Modify: `frontend/src/lib/whatsappAutomacoes.ts`, `frontend/src/components/whatsapp/automacoes/ConfigurarRegraModal.tsx`
- Test: `backend/src/__tests__/automacoesRules.test.ts`, `respostasService.test.ts`; `frontend/src/components/whatsapp/__tests__/ConfigurarRegraModal.test.tsx`

**Interfaces:**
- `ConfigRegras.confirmacao` ganha `textoConfirmado: string | null` e `textoCancelado: string | null`.
- `ConfigRegras.avaliacao` ganha `textoNota: string | null` e `textoGoogle: string | null`. `textoGoogle` aceita `{link}`.
- `null` usa as constantes atuais `TEXTO_CONFIRMADO`, `TEXTO_CANCELADO`, `TEXTO_NOTA` e `TEXTO_GOOGLE`. Máximo de 500 caracteres.
- Configuração antiga, sem esses campos, continua válida em `lerConfig`.

- [ ] **Step 1: Escrever os testes que falham**

- Nota 5 com `textoGoogle: 'Avalie: {link}'` envia o link preenchido.
- Sem link, o convite não sai.
- Config antiga lê `null` nos campos novos.
- O modal da regra mostra e salva os campos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/__tests__/respostasService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Atualizar `CONFIG_SCHEMA` e `configPadrao`. Em `respostas.service.ts`, ler a regra uma vez por resposta.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/__tests__/automacoesRules.test.ts src/__tests__/automacoesService.test.ts src/__tests__/respostasService.test.ts`, depois no frontend `npx vitest run src/components/whatsapp/__tests__/ConfigurarRegraModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**: `feat(automacoes): respostas de confirmacao e avaliacao editaveis`

### Task 13: Tela nova

**Files:**
- Create: `frontend/src/lib/roboTextos.ts`
- Create: `frontend/src/components/whatsapp/robo/CampoMensagem.tsx`, `OpcaoMenu.tsx`, `MensagensGerais.tsx`
- Modify: `frontend/src/components/whatsapp/RoboAtendimento.tsx`, `MenuOptionsPanel.tsx`, `ChatSimulator.tsx`, `frontend/src/components/WhatsAppModule.tsx`
- Modify: `backend/src/routes/whatsapp.ts` (`GET /config/menu` devolve `numero` e `motivoOculta`)
- Delete: `frontend/src/components/whatsapp/MessageConfigPanel.tsx` e seu teste
- Test: `frontend/src/components/whatsapp/__tests__/CampoMensagem.test.tsx`, `RoboAtendimento.test.tsx`; `backend/src/__tests__/whatsappMenu.test.ts`

**Interfaces:**
- `GET /config/menu`: cada linha ganha `numero: number | null` e `motivoOculta: 'desligada' | 'sem_promocao' | 'sem_instagram' | null`.
- `frontend/src/lib/roboTextos.ts`: tipo `TextoDto`, `listarTextos()`, `salvarTextos(textos)`, `DESCRICAO_OPCAO: Record<string, string>`, `previaTexto(texto: string): string`.
- `CampoMensagem` props: `texto: TextoDto; valor: string; onMudar: (valor: string) => void; onRestaurar: () => void`.
- `DESCRICAO_OPCAO`: `schedule` "Marca um horário pelo WhatsApp"; `view_services` "Mostra seus serviços e preços"; `manage` "Remarca ou cancela um agendamento"; `cancel` "Cancela um agendamento"; `reschedule` "Remarca um agendamento"; `promotions` "Mostra suas promoções"; `instagram` "Mostra seu perfil do Instagram"; `attendant` "Chama sua equipe na central de conversas"; `end_session` "Encerra a conversa".

- [ ] **Step 1: Escrever os testes que falham**

```tsx
it('insere a variável no cursor', ...);
it('mostra o selo só quando personalizada', ...);
it('avisa ao apagar variável importante sem bloquear', async () => {
  // texto com importantes: ['horario', 'data'] e valor sem {horario}
  expect(screen.getByText(/\{horario\}/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled();
});
it('avisa sobre variável desconhecida', ...);
it('bloqueia vazio, menos com permiteVazio', ...);
it('a lista mostra o número real e o motivo da opção oculta', async () => {
  expect(screen.getByText('Não aparece: cadastre seu Instagram')).toBeInTheDocument();
  expect(screen.queryByText(/view_services/)).not.toBeInTheDocument();
});
it('abrir a opção mostra as mensagens do caminho, na ordem do catálogo', ...);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/whatsapp/__tests__/CampoMensagem.test.tsx src/components/whatsapp/__tests__/RoboAtendimento.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`RoboAtendimento` passa a ter as áreas "Menu e mensagens" e "Mensagens gerais". O simulador fica ao lado em telas a partir de `lg`; abaixo disso, abre pelo botão "Testar" em um `Modal`. `politica_message` aparece em "Mensagens gerais" com o rótulo "Resposta rápida: Política". O reset geral some; fica o "Restaurar padrão" de cada campo e o reset do menu com confirmação. O botão Salvar envia só os campos alterados.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/whatsapp/__tests__` e, no backend, `npx vitest run src/__tests__/whatsappMenu.test.ts`
Expected: PASS.

- [ ] **Step 5: Conferir no navegador**

Subir o frontend com mock local, conforme a memória do projeto, a 320 px e em computador, nos segmentos barbearia e estética. Conferir: números do menu, opção oculta com motivo, editor por opção, restaurar padrão, simulador ao lado e pelo botão "Testar", sem rolagem horizontal. O mock precisa responder `/whatsapp/config/menu`, `/whatsapp/config/textos` e `/whatsapp/status`, pois `data: []` genérico derruba o `ConnectionPanel`.

- [ ] **Step 6: Commit**: `feat(robo): menu, mensagens e simulador em uma tela`

### Task 14: Documentação e PR 3

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/design/SEGUIMENTO.md`, `WHATSAPP_BOT.md`, `API_DOCS.md`

- [ ] **Step 1: Atualizar os documentos**

Registrar as três entregas, as rotas novas, as pendências da spec e o pedido de autorização da migração.

- [ ] **Step 2: Rodar as verificações finais**

Run: `npx vitest run` e `npm run typecheck` no backend; `npx vitest run` e `npx tsc --noEmit` no frontend, sem `next dev` no ar.
Expected: tudo PASS. Registrar no PR o resultado real.

- [ ] **Step 3: Commit**: `docs: robo de atendimento no roadmap e no seguimento`

- [ ] **Step 4: Abrir o PR 3**

PR de `feat/robo-textos-tela` para a `main`, avisando em destaque que a migração precisa ser aplicada antes do deploy do backend. Pedir ao dono a autorização, e só então aplicar pelo pooler de sessão, com `migrate status` antes e depois.
