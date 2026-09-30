# Agendamento Público com Sinal Pix — Design

## Contexto e objetivo

Hoje todo agendamento é criado de dentro do painel autenticado, pelo dono do negócio
ou por um profissional. Não existe nenhuma forma de um cliente final agendar sozinho,
sem login. Este documento especifica o **Sub-projeto A** da iniciativa de onboarding
guiado: uma página pública de agendamento por negócio, com cobrança de sinal via Pix,
que existe *antes e independente* do onboarding wizard em si (Sub-projeto B, spec
separada).

Motivação direta: a Etapa 4 do onboarding gerado no Stitch ("Sua Página") pressupõe
que essa vitrine pública com autoagendamento já existe. Ela não existe — este
documento é o que a torna real.

**Fora de escopo desta spec:** o onboarding wizard de 5 passos (Sub-projeto B), que
consome o que é construído aqui na sua Etapa 4.

## Decisão de arquitetura: como o dinheiro chega na conta do negócio

A integração de pagamento existente (`asaasBillingProvider`) cobra a **assinatura da
plataforma** — o dinheiro vai para a conta Asaas da EasyAgenda+. Um sinal de
agendamento precisa cair direto na conta do **negócio individual** (promessa já
publicada na landing: "sem intermediário, sem taxa retida").

Três caminhos foram avaliados:

1. **Chave Pix própria do negócio + confirmação manual** (escolhido) — o negócio
   cadastra sua própria chave Pix; o sistema gera o BR Code (copia-e-cola/QR)
   diretamente a partir dela, sem gateway. O dinheiro cai mesmo direto na conta do
   negócio. Como a plataforma não tem visibilidade da conta bancária do negócio, a
   confirmação de pagamento é manual (o dono confirma no painel ao ver o Pix cair).
2. Subconta Asaas por negócio (split automático) — confirmação automática via
   webhook, mas exige que cada negócio complete o KYC do Asaas antes de receber o
   primeiro sinal, e uma integração bem maior. **Evolução futura**, não parte desta
   spec.
3. Sinal cai na conta da EasyAgenda+ e é repassado depois — mais rápido de construir,
   mas contradiz a promessa já publicada e implica reter dinheiro de terceiros
   (questão regulatória). **Descartado.**

Esta spec implementa a opção 1.

## Modelo de dados

### `Business` (novos campos)

| Campo | Tipo | Notas |
|---|---|---|
| `slug` | `String?` único | Identificador da URL pública (`/agendar/[slug]`). Gerado a partir do nome no cadastro do slug, editável, validado (`a-z0-9-`, sem espaços). |
| `pixKey` | `String?` | Chave Pix de recebimento do negócio. |
| `pixKeyType` | `String?` | Um de: `cpf`, `cnpj`, `email`, `telefone`, `aleatoria`. |
| `logoUrl` | `String?` | URL da logo/foto exibida na página pública. |
| `brandColor` | `String?` | Cor hex (`#RRGGBB`) usada nos destaques da página pública. |

Todos opcionais a nível de banco — a página pública só fica acessível
(`publicPageEnabled`, calculado, não persistido) quando `slug`, `pixKey` e
`pixKeyType` estão preenchidos e há pelo menos 1 serviço ativo.

### `Service` (novo campo)

| Campo | Tipo | Notas |
|---|---|---|
| `depositPercentage` | `Decimal(5,2)?` | Percentual do preço cobrado como sinal (ex: `30.00`). `null`/`0` = serviço não exige sinal (não deve aparecer selecionável na página pública nesta v1 — todo serviço listado publicamente precisa ter sinal configurado, para manter a promessa de "sinal obrigatório trava a vaga"). |

### `Appointment` (novo status + campo)

- `status` ganha um quarto valor válido: `aguardando_pagamento` (além dos já
  existentes `confirmado`, `concluido`, `cancelado`).
- Novo campo `expiresAt: DateTime?` — preenchido apenas quando `status =
  aguardando_pagamento`; é `now() + 15 minutos` no momento da criação pública.
- Novas transições em `VALID_STATUS_TRANSITIONS`:
  `aguardando_pagamento: ['confirmado', 'cancelado']`.
- `source: String` (novo campo, default `'painel'`) — distingue agendamentos criados
  no painel (`'painel'`) dos criados pela página pública (`'publico'`), útil para
  filtros e métricas futuras.

## Expiração da reserva (sem job em background)

Não há infraestrutura de job/cron hoje. A expiração é **preguiçosa**: qualquer
consulta que precise saber se um horário está livre (checagem de disponibilidade,
`hasConflict`, listagem de agendamentos do dia) trata um agendamento
`aguardando_pagamento` cujo `expiresAt` já passou como **inexistente para fins de
conflito** — sem escrever no banco nesse momento. Uma rotina complementar
(`releaseExpiredPendingAppointments`, chamada no início de cada requisição pública de
disponibilidade) marca esses registros expirados como `cancelado` de forma
assíncrona/best-effort, para não acumular lixo indefinidamente, mas a
**correção da disponibilidade nunca depende dessa limpeza ter rodado**.

## Fluxo público (`/agendar/[slug]`)

1. **Vitrine**: `GET` público retorna nome do negócio, logo, cor, lista de serviços
   ativos com `depositPercentage` configurado (nome, preço, duração).
2. Cliente escolhe **serviço** → sistema lista os **profissionais** que atendem esse
   serviço (reaproveita a relação já existente entre profissional e serviço, se
   houver, ou lista todos os profissionais ativos do negócio).
3. Cliente escolhe **profissional** → vê horários livres reaproveitando a mesma
   função de disponibilidade real usada no painel (`getBookedSlots`/`hasConflict`),
   agora também considerando `aguardando_pagamento` não expirado como ocupado.
4. Cliente informa **nome e WhatsApp**. Backend localiza um `Client` existente pelo
   par (`businessId`, `phone` normalizado) ou cria um novo.
5. Backend cria o `Appointment` com `status = aguardando_pagamento`, `source =
   'publico'`, `expiresAt = now() + 15min`, e retorna o valor do sinal calculado
   (`service.price × service.depositPercentage / 100`).
6. Frontend gera e exibe o **Pix copia-e-cola/QR Code** a partir da chave Pix do
   negócio (payload EMV/BR Code montado no backend, nunca expondo mais dados do
   negócio do que o necessário).
7. Tela final: "Aguardando confirmação do pagamento pelo estabelecimento." Sem
   polling de status nem link de consulta nesta v1 (reduz superfície pública sem
   autenticação). O cliente é orientado a aguardar contato do negócio.

## Confirmação manual (painel)

Nova aba/seção **"Aguardando Pix"** (dentro do módulo de Agenda) lista agendamentos
`aguardando_pagamento` não expirados, com nome do cliente, serviço, horário, valor do
sinal e botão **"Confirmar recebimento do Pix"**. Ao confirmar:

1. `status` → `confirmado`.
2. Dispara mensagem automática via WhatsApp para o cliente (reaproveita a integração
   `WhatsappSession`/envio já existente), confirmando o horário.

Um botão secundário **"Cancelar reserva"** permite ao dono liberar o horário
manualmente antes dos 15 minutos, se souber que o cliente desistiu.

## Segurança e prevenção de abuso

- **Rate limiting** por IP nos endpoints públicos de disponibilidade e criação de
  agendamento: o projeto já usa `express-rate-limit` globalmente (120 req/min em
  `security.ts`); a rota de criação de agendamento (`POST
  /public/businesses/:slug/appointments`) ganha um limite adicional, mais restritivo
  (ex: 5 tentativas por IP a cada 15 minutos), por ser uma escrita pública sensível a
  spam.
- Endpoints públicos nunca retornam: chave Pix bruta fora do payload de pagamento já
  formatado, dados de outros clientes, dados financeiros do negócio, ou qualquer
  agendamento que não seja o recém-criado (sem endpoint de "listar meus
  agendamentos" sem login nesta v1).
- Validação estrita de entrada (nome, telefone, `serviceId`/`professionalId`
  pertencentes ao mesmo `businessId` do slug) para impedir criar agendamento em
  negócio/serviço incompatível.
- `slug` nunca aceita caracteres fora de `[a-z0-9-]`, checagem de unicidade no
  backend antes de salvar.

## Novos endpoints (rascunho)

Públicos (sem autenticação):
- `GET /public/businesses/:slug` — vitrine (nome, logo, cor, serviços elegíveis).
- `GET /public/businesses/:slug/availability?serviceId=&professionalId=&date=` —
  horários livres.
- `POST /public/businesses/:slug/appointments` — cria o agendamento
  `aguardando_pagamento` e retorna o payload Pix.

Autenticados (painel, dono/tenant):
- `GET /appointments/pending-payment` — lista agendamentos `aguardando_pagamento` do
  negócio.
- `POST /appointments/:id/confirm-payment` — confirma recebimento, muda status,
  dispara WhatsApp.
- `PATCH /business/public-page` — atualiza `slug`, `pixKey`, `pixKeyType`,
  `logoUrl`, `brandColor`.
- `PATCH /services/:id` (já existe) — ganha o campo `depositPercentage`.

## Testes

- Geração do payload Pix (BR Code) a partir de chave + valor + nome do
  recebedor — unitário, comparando contra um payload de referência conhecido.
- `hasConflict`/disponibilidade: agendamento `aguardando_pagamento` não expirado
  bloqueia o horário; expirado, não bloqueia.
- Fluxo público completo (criar → aparecer em "Aguardando Pix" → confirmar → status
  `confirmado` → mensagem WhatsApp disparada) — integração.
- Validação de entrada: serviço/profissional de outro negócio é rejeitado.
- Slug: geração, unicidade, caracteres inválidos rejeitados.

## Fora de escopo desta spec

- Confirmação automática de pagamento (subconta Asaas / split) — evolução futura.
- Consulta de status do agendamento pelo cliente sem login.
- Reagendamento/cancelamento pelo próprio cliente via link público.
- O onboarding wizard de 5 passos em si (Sub-projeto B).
