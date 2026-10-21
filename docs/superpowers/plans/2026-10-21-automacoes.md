# Automações do WhatsApp (2C-2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Automações fiel ao Stitch, com as 7 regras do WhatsApp funcionando de verdade (confirmação, sinal Pix, radar de retorno, lista de espera, lembrete, aniversário, avaliação), métricas reais do mês e textos editáveis por negócio.

**Architecture:**
- Um módulo novo `backend/src/modules/whatsappAutomacoes/` guarda a configuração das regras (`whatsapp_automacoes`), as funções puras (catálogo, textos, compatibilidades), os gatilhos por evento, as rotinas agendadas, as respostas pendentes e as métricas.
- O que é em massa ou por horário entra na fila `whatsapp_envios` do 2C-2a, que ganha `prioridade` e `appointment_id`.
- O que é transacional e urgente (sinal Pix, lista de espera, lembrete) sai direto por `sendWhatsAppMessage`, como o lembrete já faz.
- O frontend troca o `AutomacoesProvisorio` pela tela do Stitch e leva os painéis antigos do robô para a aba Conexão.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest, node-cron 4; Next.js 15, React, Tailwind com tokens, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-automacoes-campanhas-design.md` (seções "As 7 regras", "Tela de Automações" e "Dados — 2C-2b"). Campanhas ficam fora deste plano.

## Global Constraints
- Responder e escrever textos de interface em português do Brasil.
- `backend/.env` aponta para **produção**:
  - nunca rodar `prisma migrate dev/deploy/db push/reset`;
  - só `npx prisma validate`, `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (para conferir) e `npx prisma generate`;
  - o SQL da migração é escrito à mão em `backend/prisma/migrations/20261021120000_whatsapp_automacoes/migration.sql`.
- Testes nunca tocam o banco:
  - repositórios mockados com `vi.mock`;
  - todo teste que importa um serviço que chega em `avatares` ou `config/prisma` mocka esses módulos, como em `backend/src/modules/whatsappRetorno/__tests__/retornoService.test.ts`.
- Horários sempre no fuso do negócio: `getBusinessScheduleSettings(businessId)` → `timezone`, `todayInTimezone`, `zonedToUtc` de `backend/src/utils/businessDate.ts`.
- Origens novas em `Origem` (`backend/src/modules/whatsappInbox/inbox.types.ts`): `sinal_pix`, `aniversario`, `avaliacao`, `campanha`.
  - SAIR e consentimento revogado bloqueiam `confirmacao`, `retorno`, `lista_espera`, `lembrete`, `aniversario`, `avaliacao` e `campanha`.
  - `sinal_pix` não é bloqueado.
- Prioridade na fila: `confirmacao` = 1, regras normais = 5, campanha = 9 (constantes `PRIORIDADE_ALTA = 1`, `PRIORIDADE_NORMAL = 5`, `PRIORIDADE_CAMPANHA = 9` em `fila.rules.ts`).
- Na primeira leitura, só o `lembrete` está ligado: ele herda `business_settings.whatsapp_reminders` e o texto `whatsapp_bot_config.reminder_message`. As outras 6 começam desligadas.
- Rotas sob a permissão de plano `whatsapp_automation`, montadas como `backend/src/modules/whatsappRetorno/retorno.routes.ts`.
- Frontend:
  - cores só por token (`frontend/src/__tests__/themeCompliance.test.ts`);
  - proxies Next em `frontend/src/app/api/whatsapp/automacoes/...` com `proxyRequest`, como os do `retorno`.
- Visual fiel a `docs/design/stitch/projeto/studio-aurora-whatsapp-automacoes-ajustada--07d4c8.html`. Abrir o HTML e copiar estrutura, espaçamentos e textos fixos.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Variável sem valor** (negócio sem endereço, sem link público, sem link do Google): a linha com a variável vazia não pode sair com "Estamos na ." nem "{link_mapa}" cru. `renderizarTexto` remove linhas que ficaram só com pontuação ou espaço depois da troca. Teste na Task 2.
2. **"1" ou "2" de quem está no menu do robô sem confirmação pendente**: segue para o robô normalmente. Só uma espera de resposta válida (menos de 24h) intercepta. Teste na Task 5.
3. **Agendamento cancelado ou remarcado entre o enfileiramento e o envio da confirmação**: o item é pulado com "Horário já passou" (se a data e hora já passaram) ou "Agendamento não está mais confirmado". Teste na Task 4.
4. **Cancelamento de vaga no passado ou em menos de 1h**: não avisa a lista de espera. Teste na Task 6.
5. **Rotina diária rodando duas vezes no mesmo dia** (reinício do servidor): aniversário e radar não podem enfileirar a mesma cliente de novo. O aniversário confere envio `aniversario` da cliente no ano; o radar confere envio `retorno` nos últimos 30 dias, mais o índice único da fila. Teste na Task 7.

---

### Task 1: Migração, schema e origens novas

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261021120000_whatsapp_automacoes/migration.sql`
- Modify: `backend/src/modules/whatsappInbox/inbox.types.ts` (tipo `Origem`)
- Modify: `backend/src/modules/whatsappInbox/inbox.rules.ts` (rótulos e lista de origens bloqueáveis, se existir)
- Modify: `frontend/src/lib/whatsappInbox.ts` (tipo de origem e rótulos, se houver)

**Interfaces:**
- Produces (Prisma):
  - `WhatsappAutomacao { id, businessId, regra (varchar 20), ativa Boolean @default(false), texto String? @db.Text, config Json @default("{}"), updatedAt @updatedAt }`, `@@unique([businessId, regra])`, `@@map("whatsapp_automacoes")`;
  - `WhatsappRespostaPendente { id, businessId, phoneKey (varchar 20, map phone_key), tipo (varchar 15), appointmentId (uuid, map appointment_id), expiresAt (map expira_em, timestamptz), createdAt }`, `@@index([businessId, phoneKey])`, `@@map("whatsapp_respostas_pendentes")`, FK para `businesses` e `appointments` com `onDelete: Cascade`;
  - `Appointment.clientConfirmedAt DateTime? @map("client_confirmed_at") @db.Timestamptz(6)` e `Appointment.confirmationSentAt DateTime? @map("confirmation_sent_at") @db.Timestamptz(6)`;
  - `WhatsappEnvio.priority Int @default(5) @map("prioridade") @db.SmallInt` e `WhatsappEnvio.appointmentId String? @map("appointment_id") @db.Uuid` (sem FK; agendamento apagado só faz o item ser pulado);
  - índice `whatsapp_envios(business_id, status, prioridade, agendado_para)`;
  - `BusinessSettings.googleReviewUrl String? @map("google_review_url") @db.VarChar(500)`.
- Produces (TS): `Origem` acrescido de `'sinal_pix' | 'aniversario' | 'avaliacao' | 'campanha'`.

- [ ] **Step 1:** Editar `schema.prisma` com os campos acima. As relações inversas (`Business.whatsappAutomacoes`, `Business.whatsappRespostasPendentes`, `Appointment.whatsappRespostasPendentes`) seguem o estilo de `WhatsappEnvio`.
- [ ] **Step 2:** Escrever o `migration.sql` à mão, com `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, índices, FKs, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` nas duas tabelas novas, igual a `backend/prisma/migrations/20261020120000_whatsapp_envios/migration.sql`.
- [ ] **Step 3:** Rodar `npx prisma validate` e `npx prisma generate` (em `backend/`). Esperado: "The schema … is valid" e o client gerado. Se o `generate` der EPERM, encerrar o node órfão que segura o `query_engine` e repetir.
- [ ] **Step 4:** Estender `Origem` e todo `Record<Origem, …>` que o compilador apontar, com os rótulos "Sinal Pix", "Aniversário", "Avaliação" e "Campanha". Rodar `npx tsc --noEmit` em `backend/` e em `frontend/`. Esperado: sem erros.
- [ ] **Step 5:** Rodar `npm test` em `backend/`. Esperado: tudo passa.
- [ ] **Step 6:** Commit `feat(whatsapp): tabelas das automações, respostas pendentes e prioridade na fila`.

### Task 2: Catálogo das regras e funções puras

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.rules.ts`
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.types.ts`
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/automacoesRules.test.ts`

**Interfaces:**
- Produces (`automacoes.types.ts`):
  ```ts
  export type Regra = 'confirmacao' | 'sinal_pix' | 'retorno' | 'lista_espera' | 'lembrete' | 'aniversario' | 'avaliacao';
  export const REGRAS: Regra[]; // nesta ordem (a do Stitch)
  export interface ConfigRegras {
    confirmacao: { hora: string };                       // 'HH:MM', 07:00–12:00, padrão '09:00'
    sinal_pix: { toleranciaMin: 15 | 30 | 60 };          // padrão 15
    retorno: { modo: 'ciclo' | 'dias'; dias: number };   // padrão { modo:'ciclo', dias: 21 }, dias 7–180
    lista_espera: { quantas: 1 | 3 | 5 };                // padrão 3
    lembrete: { modo: '2h' | 'vespera'; hora: string };  // padrão { modo:'2h', hora:'18:00' }
    aniversario: { presente: string };                   // padrão 'R$ 20 OFF em qualquer serviço', 1–80 chars
    avaliacao: { horas: 1 | 2 | 4; linkGoogle: string | null }; // padrão { horas: 2, linkGoogle: null }
  }
  export interface RegraDto<R extends Regra = Regra> { regra: R; ativa: boolean; texto: string; textoPadrao: string; personalizado: boolean; config: ConfigRegras[R]; variaveis: string[] }
  ```
- Produces (`automacoes.rules.ts`):
  - `TEXTO_PADRAO: Record<Regra, string>` e `TEXTO_PADRAO_LEMBRETE_2H: string`. O `lembrete` usa `TEXTO_PADRAO.lembrete` no modo véspera e o texto de 2h no modo 2h.
  - `VARIAVEIS: Record<Regra, string[]>`.
  - `CONFIG_SCHEMA: { [R in Regra]: z.ZodType<ConfigRegras[R]> }` e `configPadrao(regra)`.
  - `lerConfig<R>(regra: R, bruto: unknown): ConfigRegras[R]`: mescla com o padrão; campo inválido volta ao padrão.
  - `renderizarTexto(texto: string, vars: Record<string, string | null | undefined>): string`.
  - `respostaConfirmacao(texto: string): 'sim' | 'nao' | null`.
  - `notaAvaliacao(texto: string): 1 | 2 | 3 | 4 | 5 | null`.
  - `aniversarianteEm(birthDate: Date, hojeYmd: string): boolean`.
  - `periodoDoHorario(hhmm: string): 'manha' | 'tarde' | 'noite'` (antes de 12:00 = manhã; 12:00–17:59 = tarde; 18:00 em diante = noite).
  - `entradaCompativel(e: { serviceId: string; professionalId: string | null; desiredDate: string | null; period: string; duracaoServico: number }, vaga: { serviceId: string; professionalId: string; data: string; hora: string; duracao: number }): boolean`.
  - `seloTaxa(pct: number): 'Excelente' | 'Boa' | 'Baixa'`.

Textos padrão (exatos):
- `confirmacao`: `Olá {primeiro_nome}! Tudo bem? Seu agendamento de {servico} está marcado para amanhã às {horario}. Responda 1 para Confirmar ou 2 para Reagendar.`
- `sinal_pix`: `Sua vaga para {servico} está pré-reservada por {prazo} min! Para garantir, pague o sinal de R$ {valor_sinal} pelo Pix abaixo:\n\n{pix_copia_e_cola}`
- `retorno`: `Oi {primeiro_nome}! Já faz {dias} dias do seu {ultimo_servico}. Vamos manter o cuidado impecável? Reserve sua manutenção: {link_agenda}`
- `lista_espera`: `Abriu uma vaga {data} às {horario} com {profissional}! A primeira a agendar fica com o horário: {link}`
- `lembrete` (véspera): `Seu horário amanhã é às {horario}. Estamos na {endereco}. Trajeto Waze/Maps: {link_mapa}. Chegue com 5 min de antecedência!`
- lembrete 2h: o texto atual de `runReminderJob` (`⏰ Lembrete!\n\nOlá {nome_cliente}!...`), copiado sem mudança.
- `aniversario`: `Parabéns pelo seu dia, {primeiro_nome}! 🎉 Você ganhou {presente} para comemorar em grande estilo esta semana: {link}`
- `avaliacao`: `Como foi sua experiência no {negocio} hoje? Responda com uma nota de 1 a 5 ⭐`

Variáveis (exatas):
- confirmacao: `nome, primeiro_nome, servico, horario, data, profissional, negocio`
- sinal_pix: `nome, servico, valor_sinal, pix_copia_e_cola, prazo, horario, data`
- retorno: `primeiro_nome, dias, ultimo_servico, profissional, horarios_livres, link_agenda, negocio`
- lista_espera: `primeiro_nome, data, horario, profissional, servico, link`
- lembrete: `nome, nome_cliente, primeiro_nome, servico, profissional, horario, data, endereco, link_mapa`
- aniversario: `primeiro_nome, presente, link, negocio`
- avaliacao: `primeiro_nome, negocio, servico, link_avaliacao`

- [ ] **Step 1: Escrever os testes falhando:**
```ts
it('renderizarTexto troca variáveis e some com linha que ficou vazia', () => {
  expect(renderizarTexto('Oi {primeiro_nome}!\nEstamos na {endereco}.\nAté', { primeiro_nome: 'Ana', endereco: null })).toBe('Oi Ana!\nAté');
  expect(renderizarTexto('Link: {link}', { link: '' })).toBe('');
  expect(renderizarTexto('Oi {desconhecida}', {})).toBe('Oi {desconhecida}');
});
it('respostaConfirmacao', () => {
  for (const t of ['1', ' sim ', 'Confirmo', 'SIM!']) expect(respostaConfirmacao(t)).toBe('sim');
  for (const t of ['2', 'não', 'nao', 'Reagendar']) expect(respostaConfirmacao(t)).toBe('nao');
  for (const t of ['12', 'sim, mas atraso 10 min', '3', '']) expect(respostaConfirmacao(t)).toBeNull();
});
it('notaAvaliacao', () => {
  expect(notaAvaliacao('5')).toBe(5); expect(notaAvaliacao(' 4 ⭐')).toBe(4);
  expect(notaAvaliacao('6')).toBeNull(); expect(notaAvaliacao('nota 5 muito bom')).toBeNull();
});
it('aniversarianteEm trata 29/02 em ano não bissexto', () => {
  expect(aniversarianteEm(new Date('1990-02-29T00:00:00Z'), '2027-02-28')).toBe(true);
  expect(aniversarianteEm(new Date('1992-02-29T00:00:00Z'), '2028-02-28')).toBe(false);
  expect(aniversarianteEm(new Date('1990-10-21T00:00:00Z'), '2026-10-21')).toBe(true);
});
it('periodoDoHorario e entradaCompativel', () => {
  expect(periodoDoHorario('11:59')).toBe('manha'); expect(periodoDoHorario('12:00')).toBe('tarde'); expect(periodoDoHorario('18:00')).toBe('noite');
  const vaga = { serviceId: 's1', professionalId: 'p1', data: '2026-10-22', hora: '14:00', duracao: 60 };
  expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: null, period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(true);
  expect(entradaCompativel({ serviceId: 's2', professionalId: 'p1', desiredDate: '2026-10-22', period: 'tarde', duracaoServico: 45 }, vaga)).toBe(true);
  expect(entradaCompativel({ serviceId: 's2', professionalId: null, desiredDate: null, period: 'qualquer', duracaoServico: 90 }, vaga)).toBe(false);
  expect(entradaCompativel({ serviceId: 's1', professionalId: 'p2', desiredDate: null, period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(false);
  expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: '2026-10-23', period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(false);
  expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: null, period: 'manha', duracaoServico: 60 }, vaga)).toBe(false);
});
it('lerConfig volta ao padrão em campo inválido', () => {
  expect(lerConfig('confirmacao', { hora: '15:00' })).toEqual({ hora: '09:00' });
  expect(lerConfig('lista_espera', { quantas: 5 })).toEqual({ quantas: 5 });
  expect(lerConfig('retorno', null)).toEqual({ modo: 'ciclo', dias: 21 });
});
it('seloTaxa', () => { expect(seloTaxa(80)).toBe('Excelente'); expect(seloTaxa(50)).toBe('Boa'); expect(seloTaxa(49.9)).toBe('Baixa'); });
```
- [ ] **Step 2:** Rodar `npx vitest run src/modules/whatsappAutomacoes/__tests__/automacoesRules.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar.
  - `respostaConfirmacao` normaliza (minúsculas, sem acento, sem pontuação nas pontas) e aceita só a palavra inteira.
  - `renderizarTexto` troca `{chave}` conhecida (presente em `vars`, mesmo vazia) e mantém as desconhecidas. Depois remove as linhas que, sem a pontuação e os espaços, ficaram sem letras nem dígitos, ou que eram só "rótulo + variável vazia". Regra: a linha tinha variável, a variável virou vazia e o que sobrou tem até 20 caracteres sem dígitos. Por fim, colapsa 3+ quebras de linha em 2 e faz `trim()`.
- [ ] **Step 4:** Rodar o teste. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): catálogo e regras puras das automações`.

### Task 3: Configuração das regras (repositório, serviço e rotas)

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.repository.ts`
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.service.ts`
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.controller.ts`
- Create: `backend/src/modules/whatsappAutomacoes/automacoes.routes.ts`
- Modify: o arquivo que monta `retornoRoutes` (montar `automacoesRoutes` em `/api/v1/whatsapp/automacoes`, antes do `whatsappRoutes`)
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/automacoesService.test.ts`

**Interfaces:**
- Consumes: Task 2 inteira.
- Produces:
  - `automacoesRepository.listar(businessId): Promise<Array<{ regra: string; ativa: boolean; texto: string | null; config: unknown }>>`, `salvar(businessId, regra, data: { ativa?: boolean; texto?: string | null; config?: object })` (upsert) e `legadoLembrete(businessId): Promise<{ ativa: boolean; texto: string | null }>` (lê `whatsappReminders` e `reminderMessage`).
  - `automacoes.obterTodas(businessId): Promise<RegraDto[]>` (as 7, na ordem de `REGRAS`).
  - `automacoes.obter<R>(businessId, regra: R): Promise<RegraDto<R>>`.
  - `automacoes.atualizar(businessId, regra, patch: { ativa?: boolean; texto?: string | null; config?: Partial<ConfigRegras[R]> }): Promise<RegraDto<R>>`. `texto: null` restaura o padrão. Texto com 1 a 1000 caracteres; senão, `ValidationError`.
  - `automacoes.testar(businessId, regra): Promise<{ enviado: true; para: string }>`: manda o texto renderizado com dados de exemplo ("Mariana", "Design de Sobrancelha", "14:00", "amanhã", nome do negócio) para o número conectado do negócio, com `origin: 'sistema'`. Sem conexão: `AppError('Conecte o WhatsApp para testar', 409, 'WHATSAPP_DISCONNECTED')`.
  - Rotas:
    - `GET /api/v1/whatsapp/automacoes` → `{ regras: RegraDto[] }`;
    - `PATCH /api/v1/whatsapp/automacoes/:regra` (body Zod: `ativa?`, `texto?` string ou null, `config?` objeto) → `RegraDto`;
    - `POST /api/v1/whatsapp/automacoes/:regra/testar`.
  - `regra` inválida → 400.

- [ ] **Step 1: Testes falhando** (repositório e `whatsappService` mockados):
  - `obterTodas` sem linhas devolve 7 regras com só o `lembrete` ativo e `texto === textoPadrao`;
  - com `whatsappReminders=false`, o lembrete vem desligado;
  - com `reminderMessage` preenchido, o texto do lembrete é esse, com `personalizado: true`;
  - uma linha salva do `lembrete` ganha do legado;
  - `atualizar(..., 'confirmacao', { config: { hora: '10:30' } })` chama `salvar` com a config mesclada `{ hora: '10:30' }`;
  - `{ config: { hora: '23:00' } }` lança `ValidationError`;
  - `{ texto: null }` grava `texto: null` e devolve `personalizado: false`;
  - `testar` sem conexão lança 409.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Config inválida no PATCH é erro (não volta silenciosamente ao padrão): validar com `CONFIG_SCHEMA[regra].partial()` antes de mesclar.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS. Rodar `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(whatsapp): configuração das regras de automação`.

### Task 4: Fila com prioridade, agendamento vinculado e pós-envio

**Files:**
- Modify: `backend/src/modules/whatsappFila/fila.rules.ts`, `fila.repository.ts`, `fila.service.ts`
- Create: `backend/src/modules/whatsappAutomacoes/respostas.repository.ts`
- Test: `backend/src/modules/whatsappFila/__tests__/` (estender os testes existentes do serviço da fila)

**Interfaces:**
- Produces:
  - `EnfileirarInput` ganha `prioridade?: number` (padrão `PRIORIDADE_NORMAL`) e `appointmentId?: string | null`.
  - `proximoVencido` ordena por `[{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }]`.
  - Novos motivos em `fila.service.ts`: `MOTIVO_HORARIO_PASSOU = 'Horário já passou'` e `MOTIVO_NAO_CONFIRMADO = 'Agendamento não está mais confirmado'`.
  - `respostasRepository.registrar({ businessId, phoneKey, tipo: 'confirmacao' | 'avaliacao', appointmentId, expiresAt })`: apaga as esperas anteriores do mesmo `businessId+phoneKey` e cria a nova. `maisRecente(businessId, phoneKey, agora)`: a mais nova com `expiresAt > agora`. `apagar(id)`.
  - `filaRepository.agendamentoParaEnvio(businessId, appointmentId): Promise<{ status: string; date: Date; time: Date } | null>`.
- Comportamento:
  - Antes de enviar `confirmacao`: com `appointmentId`, se o agendamento não existe ou não está `confirmado`, pula com `MOTIVO_NAO_CONFIRMADO`. Se a data e hora (no fuso) já passaram, pula com `MOTIVO_HORARIO_PASSOU`.
  - Antes de enviar `avaliacao`: o agendamento precisa existir. Se já tem `WhatsappRating`, pula com `'Já avaliou'`.
  - Depois de `enviado` com `origin` `confirmacao` ou `avaliacao` e `appointmentId`, chama `respostasRepository.registrar` com `expiresAt = agora + 24h`. Falha aqui só gera log, não muda o status.

- [ ] **Step 1: Testes falhando:**
  - a ordem pedida ao repositório tem `priority` primeiro;
  - confirmação de agendamento `cancelado` → `pulado` com `'Agendamento não está mais confirmado'`;
  - confirmação de agendamento confirmado cuja hora já passou → `'Horário já passou'`;
  - confirmação enviada com sucesso → `respostasRepository.registrar` chamado com `tipo: 'confirmacao'` e `expiresAt` 24h depois;
  - `registrar` lançando erro não muda o status `enviado`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `npx vitest run src/modules/whatsappFila`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): fila com prioridade e envios ligados a agendamento`.

### Task 5: Respostas da confirmação e da avaliação

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/respostas.service.ts`
- Modify: `backend/src/services/whatsapp/handlers/messagesUpsertHandler.ts` (passo 7b, depois do bloco de SAIR/VOLTAR e antes de `if (conversa?.handler === 'humano')`)
- Modify: `backend/src/modules/whatsappInbox/inbox.recorder.ts` (acrescentar `avisoDoSistema`)
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/respostasService.test.ts`

**Interfaces:**
- Consumes: `respostasRepository` (Task 4), `respostaConfirmacao` e `notaAvaliacao` (Task 2), `automacoes.obter` (Task 3), `inboxRecorder.pedirAtendimentoHumano`, `appointmentsService.updateStatus` (`backend/src/modules/appointments/appointments.service.ts`), `automacoesGatilhos.aoCancelar` (Task 6; chamado por `updateStatus`, não aqui).
- Produces:
  - `respostas.tratar(i: { businessId: string; phone: string; texto: string | null; instanceName?: string }): Promise<boolean>`: `true` quando a mensagem foi consumida.
  - `inboxRecorder.avisoDoSistema(businessId: string, phone: string, texto: string): Promise<void>`: grava uma mensagem `direction: 'out'`, `origin: 'painel_evento'`, com o texto na conversa (não conta como envio). Erros só geram log.
- Comportamento (textos exatos):
  - **Confirmação "sim":** grava `clientConfirmedAt = agora` (só se ainda `confirmado`), responde `Obrigada! Seu horário está confirmado ✨` com `origin: 'sistema'` e apaga a espera.
  - **Confirmação "não":**
    - chama `appointmentsService.updateStatus(appointmentId, businessId, 'cancelado')` (o que dispara a lista de espera pela Task 6);
    - chama `pedirAtendimentoHumano`;
    - grava `avisoDoSistema(..., 'Pediu para reagendar pelo WhatsApp')`;
    - responde `Tudo bem! Liberamos seu horário e a equipe já vai falar com você para remarcar.`;
    - apaga a espera.
    - Se o agendamento já não estava `confirmado`, só apaga a espera e devolve `false`.
  - **Avaliação 1–5:**
    - faz upsert de `WhatsappRating` (`appointmentId`, `rating`);
    - responde `Obrigada pela nota!`;
    - nota 5 com `config.avaliacao.linkGoogle`: manda também `Que bom que gostou! Se puder, deixe sua avaliação no Google: {link}`;
    - nota 1 ou 2: `pedirAtendimentoHumano` + `avisoDoSistema(..., 'Avaliação baixa (N) — vale falar com ela')`;
    - apaga a espera.
  - Texto que não bate com o tipo da espera → `false` e a espera continua.
  - Erro interno → log e `false`, para a mensagem seguir o fluxo normal.
- No handler: `if (await respostas.tratar({ businessId, phone, texto: parsed.text, instanceName: effectiveInstance })) return { ok: true, reason: 'resposta_automacao', authorPhone: phone, businessId };`

- [ ] **Step 1: Testes falhando:**
  - sem espera → `false`, nada chamado;
  - espera de confirmação + "1" → `clientConfirmedAt` gravado, resposta enviada, espera apagada, `true`;
  - espera de confirmação + "2" → `updateStatus(…, 'cancelado')`, `pedirAtendimentoHumano`, aviso gravado, `true`;
  - espera de confirmação + "oi, tudo bem?" → `false`, espera não apagada;
  - espera de avaliação + "5" com linkGoogle → duas mensagens, a segunda com o link;
  - avaliação "2" → `pedirAtendimentoHumano` e aviso "Avaliação baixa (2) — vale falar com ela";
  - espera vencida (o repositório não devolve) + "1" → `false` (Review Focus 2).
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar e ligar ao handler.
- [ ] **Step 4:** Rodar `npx vitest run src/modules/whatsappAutomacoes src/services/whatsapp`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): respostas da confirmação e da avaliação`.

### Task 6: Gatilhos por evento (lista de espera, sinal Pix, avaliação)

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/gatilhos.service.ts`
- Modify:
  - `backend/src/modules/appointments/appointments.service.ts`: em `updateStatus`, quando o novo status é `cancelado`; e em `delete`;
  - `backend/src/services/whatsapp/whatsappBookingService.ts`: no cancelamento pelo robô, linha ~122;
  - `backend/src/modules/publicBooking/publicBooking.service.ts`: `HOLD_MINUTES` vem da config `sinal_pix.toleranciaMin`; o envio acontece depois de criar a reserva;
  - `backend/src/modules/comandas/comandas.service.ts`: em `close`, depois de gravar, no mesmo lugar não bloqueante do recibo;
  - `backend/src/modules/waitlist/waitlist.repository.ts`: consulta das entradas compatíveis e marcação de oferta.
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/gatilhos.test.ts`

**Interfaces:**
- Consumes: `automacoes.obter`, `renderizarTexto`, `entradaCompativel`, `filaEnvios.enfileirar`, `sendWhatsAppMessage`, `inboxRecorder.estaEmOptOut`.
- Produces (`automacoesGatilhos`), todas "dispara e esquece" (o chamador faz `void …catch(log)`; nunca derrubam o fluxo principal):
  - `aoCancelar(businessId: string, appointmentId: string, agora?: Date): Promise<number>`: número de clientes avisadas.
    - Só com `lista_espera` ativa e vaga a pelo menos 60 min de `agora`.
    - Busca as entradas `aguardando` do negócio por `createdAt asc`, filtra com `entradaCompativel` e corta em `config.quantas`.
    - Pula quem está em opt-out.
    - Envia direto com `origin: 'lista_espera'`. `{data}` = "hoje", "amanhã" ou "qui, 23/10". `{link}` = `${FRONTEND_URL}/agendar/${slug}` (sem `FRONTEND_URL` ou slug, a linha some pelo `renderizarTexto`).
    - Marca `offeredAt = agora` e o status de "ofertado" que `waitlistService.offer` já usa (ler e reutilizar o valor).
  - `aoCriarReservaComSinal(businessId: string, appointmentId: string, d: { phone: string; nome: string; servico: string; valorSinal: number; pixPayload: string; data: string; horario: string; toleranciaMin: number }): Promise<boolean>`: só com `sinal_pix` ativa e WhatsApp conectado; envio direto com `origin: 'sinal_pix'`; `{valor_sinal}` em "45,00".
  - `toleranciaSinal(businessId: string): Promise<number>`: `config.sinal_pix.toleranciaMin` (padrão 15), usado no lugar de `HOLD_MINUTES`.
  - `aoFecharComanda(businessId: string, appointmentId: string, fechadaEm: Date): Promise<void>`: só com `avaliacao` ativa e sem avaliação no agendamento; enfileira com `origin: 'avaliacao'`, `appointmentId`, `agendadoPara = fechadaEm + config.horas h` e `PRIORIDADE_NORMAL`.

- [ ] **Step 1: Testes falhando:**
  - `aoCancelar` com regra desligada → 0 e nenhum envio;
  - vaga daqui a 30 min → 0 (Review Focus 4);
  - 5 entradas compatíveis e `quantas: 3` → 3 envios, na ordem de `createdAt`, e 3 marcadas;
  - entrada em opt-out → pulada e não conta;
  - `aoCriarReservaComSinal` com regra ligada → `sendWhatsAppMessage` com texto contendo `R$ 45,00` e o payload, e `origin: 'sinal_pix'`;
  - `aoFecharComanda` → `enfileirar` com `agendadoPara` 2h depois e `origin: 'avaliacao'`;
  - `toleranciaSinal` sem linha salva → 15.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar e ligar nos cinco pontos de chamada. Os testes já existentes desses serviços precisam do `vi.mock` do `gatilhos.service`; acrescentar onde faltar.
- [ ] **Step 4:** Rodar `npm test` em `backend/`. Esperado: tudo passa.
- [ ] **Step 5:** Commit `feat(whatsapp): lista de espera, sinal Pix e avaliação disparados por evento`.

### Task 7: Rotinas agendadas (confirmação, lembrete, radar, aniversário)

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/rotinas.service.ts`
- Modify: `backend/src/services/cronService.ts` (`runReminderJob` e `startReminderCron`)
- Modify: `backend/src/modules/whatsappRetorno/retorno.service.ts` (expor a montagem da lista e do texto para a rotina, sem mudar o comportamento da tela)
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/rotinas.test.ts` e o teste existente do `runReminderJob`

**Interfaces:**
- Produces (`automacoesRotinas`):
  - `confirmacoes(agora?: Date): Promise<number>`: para cada negócio com `confirmacao` ativa e hora local ≥ `config.hora`, pega os agendamentos `confirmado` de amanhã (no fuso), com `confirmationSentAt` nulo e `createdAt` mais de 24h antes do horário do agendamento. Grava `confirmationSentAt` e enfileira com `origin: 'confirmacao'`, `PRIORIDADE_ALTA` e `appointmentId`. Roda a cada 10 min.
  - `radarRetorno(agora?: Date): Promise<number>`: às 09:00 locais ou depois, uma vez por dia por negócio (conferir envio `retorno` com `createdAt` de hoje vindo da rotina). Usa a lista do `retornoService`:
    - `modo: 'dias'` filtra por dias desde a última visita ≥ `config.dias`;
    - tira quem teve `retorno` `enviado` nos últimos 30 dias;
    - limite de 30 por negócio por dia;
    - texto da regra (`texto` personalizado ou `TEXTO_PADRAO.retorno`) com `{horarios_livres}` = os encaixes juntos com " ou " e `{link_agenda}` = link público.
    - Roda a cada 15 min.
  - `aniversarios(agora?: Date): Promise<number>`: às 08:00 locais ou depois, clientes com `aniversarianteEm(birthDate, hoje)`, sem envio `aniversario` no ano corrente. Enfileira com `PRIORIDADE_NORMAL`. Roda a cada 15 min.
  - Em `runReminderJob`:
    - o lembrete passa a perguntar `automacoes.obter(businessId, 'lembrete')` (ativa, modo, hora e texto), no lugar de `whatsappReminders`;
    - modo `'2h'` = comportamento atual;
    - modo `'vespera'`: agendamentos `confirmado` de amanhã, com `reminderSent=false`, a partir da `hora` local; envio direto com `origin: 'lembrete'`, `{endereco}` de `business_settings.address` e `{link_mapa}` = `https://www.google.com/maps/search/?api=1&query=` + endereço codificado;
    - ambos marcam `reminderSent`;
    - os dois modos também pulam quem está em opt-out (`inboxRecorder.estaEmOptOut`), além do consentimento revogado que já é checado.
  - Todas as rotinas: `cron.schedule(..., { noOverlap: true })` com try/catch e `logger.warn`, como as rotinas da fila.

- [ ] **Step 1: Testes falhando:**
  - confirmação às 08:59 locais com hora 09:00 → 0; às 09:05 → enfileira com prioridade 1 e grava `confirmationSentAt`;
  - agendamento criado 3h antes → não enfileira;
  - aniversário: cliente com envio `aniversario` neste ano não entra de novo (Review Focus 5);
  - radar rodando duas vezes no mesmo dia → a segunda não enfileira;
  - radar com 40 elegíveis → 30;
  - lembrete em modo véspera às 18:00 → envia com o endereço;
  - lembrete com regra desligada → nada;
  - modo `'2h'` mantém o teste atual passando.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar e agendar no `startReminderCron`.
- [ ] **Step 4:** Rodar `npm test` em `backend/`. Esperado: tudo passa.
- [ ] **Step 5:** Commit `feat(whatsapp): rotinas de confirmação, lembrete na véspera, radar de retorno e aniversário`.

### Task 8: Métricas e histórico

**Files:**
- Create: `backend/src/modules/whatsappAutomacoes/metricas.repository.ts`, `metricas.service.ts`
- Modify: `automacoes.controller.ts` e `automacoes.routes.ts` (`GET /api/v1/whatsapp/automacoes/painel` e `GET /historico`)
- Test: `backend/src/modules/whatsappAutomacoes/__tests__/metricas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PainelAutomacoesDto {
    receitaMes: number; receitaVariacaoPct: number | null;  // null quando o mês anterior é 0
    faltasEvitadas: number;
    taxaResposta: { pct: number | null; mediaMin: number | null; selo: 'Excelente' | 'Boa' | 'Baixa' | null };
    porRegra: {
      confirmacao: { faltasEvitadas: number };
      sinal_pix: { recebido: number };
      retorno: { recuperado: number };
      lista_espera: { vagasPreenchidas: number };
      lembrete: { enviados: number; lidosPct: number | null };
      aniversario: { aniversariantes: number; agendamentos: number };
      avaliacao: { notaMedia: number | null; novas: number };
    };
    conexao: { conectado: boolean; numero: string | null };
  }
  ```
  - `GET /painel` → `PainelAutomacoesDto` do mês corrente no fuso do negócio.
  - `GET /historico?limite=30` → `{ itens: Array<{ id; criadaEm; cliente: string | null; telefone; tipo: Origem; status }> }`, reaproveitando `inboxRepository.historicoEnvios`, filtrado às origens das 7 regras.
- Definições (da spec):
  - **receita:** preço do serviço de agendamentos criados no mês, não cancelados, de clientes com envio `retorno`, `lista_espera`, `aniversario` ou `campanha` nos 7 dias antes da criação; mais o `depositAmount` dos agendamentos pagos no mês que receberam `sinal_pix`.
    - `recuperado` do retorno = só a parte `retorno`;
    - `recebido` do sinal = só a parte dos sinais.
  - **faltasEvitadas:** agendamentos com `clientConfirmedAt` no mês mais os cancelados no mês por resposta "2". Para identificar o "2", gravar o `avisoDoSistema` "Pediu para reagendar pelo WhatsApp" e contar essas mensagens no mês.
  - **taxa de resposta:** mensagens `out` do mês com as 5 origens; respondida = existe `in` na mesma conversa até 24h depois. `mediaMin` arredondado.
  - **vagasPreenchidas:** entradas da lista com `offeredAt` no mês e status de agendada.
  - **lidosPct:** `status = 'lida'` ÷ lembretes do mês.
  - **aniversário:** clientes com envio `aniversario` no mês e, dessas, as que criaram agendamento até 7 dias depois.
  - **avaliação:** `WhatsappRating` criadas no mês e a média com 1 casa.
- Preferir SQL agregado (`$queryRaw` com `[^0-9]` e não `\D`, ver `inbox.repository.ts:45`) ou `groupBy`, sem carregar listas grandes em memória.

- [ ] **Step 1: Testes falhando** (repositório mockado):
  - `receitaVariacaoPct` = `null` com mês anterior 0;
  - 2870 contra 2517,5 → 14 (arredondado);
  - selo `null` quando não houve mensagem;
  - `notaMedia` arredondada para 1 casa (4,94 → 4,9);
  - `historico` exclui origens fora das 7 regras.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os testes e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(whatsapp): painel de resultados das automações`.

### Task 9: Tela de Automações (frontend)

**Files:**
- Create: `frontend/src/lib/whatsappAutomacoes.ts` (tipos espelhando `RegraDto`, `PainelAutomacoesDto` e as funções `listarRegras`, `atualizarRegra`, `testarRegra`, `painel`, `historico`)
- Create: os proxies `frontend/src/app/api/whatsapp/automacoes/route.ts`, `[regra]/route.ts`, `[regra]/testar/route.ts`, `painel/route.ts` e `historico/route.ts`
- Create: `frontend/src/components/whatsapp/automacoes/Automacoes.tsx`, `CartaoRegra.tsx` e `CartoesResultado.tsx`
- Modify: `frontend/src/components/WhatsAppModule.tsx`
  - a aba `automacoes` renderiza `<Automacoes conectado=… onAbrirConexao={() => trocarAba('conexao')} />`;
  - os painéis Menu, Mensagens e Simulador vão para baixo do `ConnectionPanel`, na aba `conexao`, numa seção com título "Robô de atendimento", reaproveitando `AutomacoesProvisorio` renomeado para `RoboAtendimento`;
  - na lista de mensagens do robô, o campo do lembrete deixa de aparecer, porque agora é a regra.
- Test: `frontend/src/components/whatsapp/__tests__/Automacoes.test.tsx` e ajustes em `WhatsAppModule.test.tsx`

**Interfaces:**
- Consumes: as rotas das Tasks 3 e 8.
- Produces:
  - `<Automacoes conectado: boolean; onAbrirConexao: () => void />`.
  - `<CartaoRegra regra: RegraDto; numero: string; descricao: string; titulo: string; icone: string; quando: string; onAlternar(ativa: boolean): void; onConfigurar(): void />`.
- Conteúdo fixo por regra (título, descrição e ícone do rodapé) copiado do Stitch.
  - A linha de rodapé ("24h antes · 09:00", "Tolerância de 30 min", "Aos 21 dias (personalizado)" ou "No ciclo da cliente", "Disparo para as 3 primeiras", "Véspera às 18:00" ou "2 horas antes", "Dia do aniversário às 08:00", "2h após o checkout") vem da config.
  - O número do mês de cada cartão vem do `porRegra`, no formato do Stitch: "38 faltas evitadas este mês", "R$ 1.230 recebidos em sinais", "R$ 1.640 recuperados", "11 vagas preenchidas", "142 lembretes (99% lidos)", "8 aniversariantes · 5 agendamentos", "Nota média 4,9 · 27 novas avaliações".
- Comportamento:
  - o interruptor é otimista; com erro, volta e mostra um toast;
  - os cartões de resultado mostram "—" enquanto carregam (padrão do 2C-2a);
  - "Regras em Execução" mostra "N ativas";
  - o cartão lateral mostra "WhatsApp conectado" e o número, ou "WhatsApp desconectado" com "Conectar" que chama `onAbrirConexao`.

- [ ] **Step 1: Testes falhando:**
  - renderiza os 7 títulos na ordem do Stitch;
  - "Receita recuperada no mês" mostra "R$ 2.870" e "+14%" com o painel mockado;
  - clicar no interruptor da Confirmação chama `atualizarRegra('confirmacao', { ativa: true })` e o selo vira "Ativo";
  - erro no PATCH devolve o interruptor;
  - "Configurações de envio" chama `onAbrirConexao`;
  - a aba Conexão mostra "Robô de atendimento" e a aba Automações não mostra mais "Menu" e "Simulador".
- [ ] **Step 2:** Rodar `npx vitest run src/components/whatsapp` em `frontend/` e ver falhar.
- [ ] **Step 3:** Implementar seguindo o HTML do Stitch (grade, cartões, interruptor verde `whatsapp-*`, cartão lateral). Celular: uma coluna.
- [ ] **Step 4:** Rodar os testes de `frontend/` e `npx tsc --noEmit`. Esperado: PASS, incluindo `themeCompliance`.
- [ ] **Step 5:** Commit `feat(whatsapp): tela de Automações fiel ao Stitch`.

### Task 10: Modais (Configurar regra, Histórico, Nova automação, Testar) e selo na Agenda

**Files:**
- Create: `frontend/src/components/whatsapp/automacoes/ConfigurarRegraModal.tsx`, `HistoricoDisparosModal.tsx` e `NovaAutomacaoModal.tsx`
- Modify: `Automacoes.tsx` (abrir os modais; "Testar envio" com escolha da regra)
- Modify: `backend/src/modules/appointments/appointment.serializer.ts` e os tipos do frontend do agendamento (`clientConfirmedAt`)
- Modify: `frontend/src/components/appointments/AppointmentCard.tsx` e `PainelDetalhesAgendamento.tsx` (selo "Confirmou pelo WhatsApp")
- Test: `frontend/src/components/whatsapp/__tests__/ConfigurarRegraModal.test.tsx`; testes existentes de `AppointmentCard`

**Interfaces:**
- `<ConfigurarRegraModal regra: RegraDto; aberto; onFechar; onSalvo(r: RegraDto) />`:
  - textarea com chips de variáveis (`regra.variaveis`, inseridos na posição do cursor) e contador "N caracteres";
  - campos por regra:
    - confirmação: hora;
    - sinal: 15/30/60;
    - retorno: "No ciclo da cliente" ou "Personalizado" + dias;
    - lista: 1/3/5;
    - lembrete: "2 horas antes" ou "Véspera às" + hora;
    - aniversário: presente;
    - avaliação: 1/2/4 h + link do Google;
  - prévia em balão estilo WhatsApp (os mesmos tokens `whatsapp-chat`/`whatsapp-bubble` da `PreviaConvite`) com dados de exemplo;
  - "Restaurar texto padrão" manda `texto: null`;
  - "Salvar" faz um único PATCH com texto e config, com proteção contra clique duplo (`useRef`, como no 2C-2a).
- `<HistoricoDisparosModal>`: lista com data e hora, cliente ou telefone, tipo (rótulo da origem) e status; vazio: "Nenhum disparo automático ainda".
- `<NovaAutomacaoModal>`: regras com `ativa=false`, cada uma com "Ativar"; todas ativas: "Todas as automações já estão ativas".

- [ ] **Step 1: Testes falhando:**
  - clicar no chip `{primeiro_nome}` insere no cursor;
  - salvar manda `{ texto, config: { hora: '10:00' } }`;
  - "Restaurar texto padrão" manda `texto: null`;
  - duplo clique em Salvar → um PATCH;
  - "Nova automação" lista só as desligadas;
  - `AppointmentCard` com `clientConfirmedAt` mostra "Confirmou pelo WhatsApp".
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Modais em tela cheia no celular.
- [ ] **Step 4:** Rodar todos os testes do frontend e do backend e o `npx tsc --noEmit` dos dois. Esperado: PASS.
- [ ] **Step 5:** Atualizar `docs/design/SEGUIMENTO.md` com a entrada do 2C-2b: o que entrou, as decisões, a migração **pendente de aplicação** e as pendências. Commit `feat(whatsapp): configurar regra, histórico de disparos e selo de confirmação na Agenda`.
