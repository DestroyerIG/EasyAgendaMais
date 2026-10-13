# Sub-projeto 2A — Agenda, Comanda e Caixa com dados reais

Data: 2026-10-13 · Status: aprovado em conversa, aguardando revisão da especificação escrita.

## Contexto e objetivo

O EasyAgenda+ precisa ficar pronto para venda: nenhuma tela pode mostrar dado inventado, e o
visual segue **fielmente a versão mais nova de cada tela do Google Stitch** (projeto
`10354872023808937772`). Todas as telas do projeto foram baixadas para
`docs/design/stitch/projeto/` (índice em `INDICE.md`).

**Regra para escolher a versão mais nova:** entre versões da mesma tela, vale a que segue as
regras de conteúdo do `docs/design/DESIGN.md` (rodapé "Plano Equipe", sem "Pro"/"Funil"/
"WABA", datas de 2026). As versões com "Plano Pro" são as antigas.

O antigo sub-projeto 2 ("dados reais no painel") foi dividido em quatro partes; esta é a 2A,
a base de dinheiro de que Hoje (2B), Relatórios e Comissões (sub-projeto 3) e Clube (4)
dependem.

| Parte | Escopo |
|---|---|
| **2A (este documento)** | Agenda, Drawer de detalhes, Comanda, Caixa, produtos, comissão, status |
| 2B | Hoje, CRM de clientes (lista e fases), ficha da cliente |
| 2C | WhatsApp (conexão, conversas, hora de voltar, automações, campanhas) |
| 2D | Ajustes › Plano e cobrança, comparação e upgrade |
| 3 | Relatórios e Comissões (Salão-Parceiro) |
| 4 | Clube e pacotes |
| 5 | App da profissional (PWA) |

**Sucesso da 2A:** a dona conclui um atendimento pela comanda, cobra serviço + produto com
desconto e gorjeta, vê o repasse da profissional, a cliente recebe o comprovante no WhatsApp,
e o Caixa do dia fecha batendo com a gaveta — tudo com dado real, sem nenhuma chave de
`conteudoDemo.agenda` ou `conteudoDemo.caixa` restante.

## Referências do Stitch (versão nova)

| Tela | Arquivo em `docs/design/stitch/projeto/` | Situação atual |
|---|---|---|
| Agenda desktop | `studio-aurora-agenda-diaria-timeline-desktop-corrigida--44833f.html` | implementada a partir da versão antiga `c8e2d7`; ajustar |
| Agenda mobile | `studio-aurora-agenda-mobile-lista-e-gesto-de-deslizar--7ec58f.html` | única versão; ajustar ações |
| Drawer de detalhes | `studio-aurora-detalhes-do-agendamento-drawer-completo--7ba488.html` | implementado a partir da antiga `0286d2`; refazer |
| Comanda | `studio-aurora-fechamento-de-comanda-e-comissao-ajustada--a9945c.html` | nova |
| Caixa do dia | `studio-aurora-caixa-do-dia-e-fechamento--baf21f.html` | já é a nova; trocar dado de exemplo por real |

## Decisões tomadas

1. **Status do agendamento:** `aguardando_pagamento` → `confirmado` → `em_atendimento` →
   `concluido`; ou `faltou` / `cancelado`. Transições validadas no backend:
   - `aguardando_pagamento` → `confirmado`, `cancelado`
   - `confirmado` → `em_atendimento`, `concluido`, `faltou`, `cancelado`
   - `em_atendimento` → `concluido`, `confirmado` (desfazer início), `cancelado`
   - `concluido`, `faltou`, `cancelado` → nenhuma (finais)
   - `concluido` só é alcançado fechando a comanda (o endpoint de status rejeita `concluido`
     direto; a comanda é quem conclui).
2. **Comanda completa:** serviço + produtos, desconto, gorjeta, forma de pagamento, repasse.
3. **Produtos:** catálogo simples (nome, descrição curta, preço, ativo), **sem estoque**.
4. **Comissão:** percentual padrão do negócio para serviço e para produto; a profissional pode
   ter percentuais próprios que substituem o padrão. Gorjeta é 100% da profissional. Os
   percentuais e preços são **copiados para os itens no fechamento** (fotografia), nunca
   recalculados depois.
5. **Faturamento = serviços + produtos − desconto.** Gorjeta **não** é faturamento do negócio.
6. **Caixa completo:** abertura com saldo inicial, sangria/suprimento, despesas, fechamento com
   valor contado e diferença.
7. **Intervalo de almoço por profissional**, que bloqueia horário em todos os canais (painel,
   página pública, bot do WhatsApp).
8. **Comprovante por WhatsApp** ao fechar a comanda, quando o WhatsApp está conectado. O texto
   fala em "comprovante", nunca "recibo fiscal" (o sistema não emite NFS-e).
9. **Fora da 2A:** pausa química (exige atendimento simultâneo no motor de horários); "Clube
   Fibra VIP" como forma de pagamento (sub-projeto 4); "Mesa 02" (não há cadastro de mesas).
   Esses elementos **não aparecem** na tela até existirem.

## Modelo de dados (migração Prisma única)

### `appointments` (alterações)
- `status`: passa a aceitar `em_atendimento` e `faltou` (coluna já é `varchar(20)`).
- `started_at TIMESTAMP NULL` — gravado ao iniciar atendimento.
- `finished_at TIMESTAMP NULL` — gravado ao fechar a comanda ou marcar falta.
- `source`: o bot do WhatsApp passa a gravar `whatsapp` (hoje cai no padrão `painel`).
  Agendamentos antigos do bot continuam `painel` — não há como distingui-los. Rótulos na tela:
  `painel` → "Agendado no painel", `publico` → "Página pública (link da bio)",
  `whatsapp` → "WhatsApp".
- `deposit_amount DECIMAL(10,2) NULL` — sinal pago na reserva pública, gravado na criação
  pública (hoje o valor só é calculado). Agendamentos antigos com `source = 'publico'` e
  status diferente de `aguardando_pagamento` recebem o valor calculado por
  `price × deposit_percentage` do serviço na migração.

### `products` (nova)
`id uuid pk`, `business_id uuid fk`, `name varchar(255)`, `description varchar(255) null`,
`price decimal(10,2)`, `active bool default true`, `created_at`, `updated_at`.
Índice `(business_id, active)`.

### `comandas` (nova)
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid pk | |
| `business_id` | uuid fk | |
| `number` | int | sequencial por negócio, `unique(business_id, number)`; gerado no backend com `MAX+1` dentro de transação com lock do negócio |
| `appointment_id` | uuid fk unique | uma comanda por atendimento |
| `client_id`, `professional_id` | uuid fk | cópia do agendamento |
| `status` | varchar(20) | `rascunho` ou `fechada` |
| `services_total` | decimal(10,2) | soma dos itens de serviço |
| `products_total` | decimal(10,2) | soma dos itens de produto |
| `deposit_applied` | decimal(10,2) | sinal Pix descontado (≤ subtotal) |
| `discount_amount` | decimal(10,2) | desconto em R$ (o % é convertido na tela e gravado em R$) |
| `tip_amount` | decimal(10,2) | gorjeta |
| `total_charged` | decimal(10,2) | subtotal − sinal − desconto + gorjeta, nunca < 0 |
| `payment_method` | varchar(20) null | `pix`, `debito`, `credito`, `dinheiro`; obrigatório para fechar quando `total_charged > 0` |
| `commission_total` | decimal(10,2) | repasse da profissional (serviço + produto + gorjeta) |
| `cash_session_id` | uuid fk null | caixa em que entrou |
| `closed_at` | timestamp null | |
| `closed_by` | uuid fk users null | |
| `receipt_sent_at` | timestamp null | quando o comprovante saiu no WhatsApp |
| `created_at`, `updated_at` | timestamp | |

### `comanda_items` (nova)
`id`, `comanda_id fk on delete cascade`, `kind` (`servico`|`produto`), `service_id null`,
`product_id null`, `name varchar(255)` (cópia), `unit_price decimal(10,2)`, `quantity int ≥ 1`,
`duration_minutes int null` (só serviço), `commission_pct decimal(5,2)` (cópia no fechamento),
`commission_amount decimal(10,2)`, `is_main bool` (o serviço do agendamento).

### `cash_sessions` (nova)
`id`, `business_id`, `date date`, `opened_at`, `opened_by fk users`, `opening_balance`,
`closed_at null`, `closed_by null`, `counted_balance null`, `expected_balance null`,
`difference null`, `notes text null`. `unique(business_id, date)` — um caixa por dia.

### `cash_movements` (nova)
`id`, `cash_session_id fk`, `business_id`, `kind` (`sangria`|`suprimento`), `amount > 0`,
`description varchar(255)`, `created_by fk users`, `created_at`.

### `expenses` (alteração)
`payment_method varchar(20) null` — `dinheiro`, `pix`, `debito`, `credito`. Só `dinheiro`
afeta a gaveta. Despesas antigas ficam `null` e aparecem como "Não informado".

### `professionals` (alterações)
`commission_service_pct decimal(5,2) null`, `commission_product_pct decimal(5,2) null`
(null = usa o padrão do negócio), `break_start time null`, `break_end time null`.

### `business_settings` (alterações)
`commission_service_pct decimal(5,2) default 0`, `commission_product_pct decimal(5,2)
default 0`. Padrão 0 para não inventar repasse em negócio que nunca configurou; a tela de
comanda mostra "Configure a comissão em Ajustes" quando ambos são 0.

## Regras de cálculo (função pura, `backend/src/modules/comandas/comandaMath.ts`)

Entrada: itens, sinal disponível, desconto (R$), gorjeta, percentuais.
- `servicesTotal = Σ(unit_price × qty)` dos serviços; `productsTotal` idem para produtos.
- `subtotal = servicesTotal + productsTotal`.
- `depositApplied = min(deposit_amount, subtotal)`.
- `discount = min(discount, subtotal − depositApplied)` (desconto nunca deixa negativo).
- `totalCharged = subtotal − depositApplied − discount + tip`.
- Desconto é rateado proporcionalmente entre serviços e produtos para a comissão:
  `baseServ = servicesTotal − discount × servicesTotal/subtotal`; `baseProd` idem.
- `commissionService = round2(baseServ × pctServ/100)`;
  `commissionProduct = round2(baseProd × pctProd/100)`;
  `commissionTotal = commissionService + commissionProduct + tip`.
- `houseRetention = subtotal − discount − commissionService − commissionProduct`.
- Arredondamento em centavos (half-up), sempre com aritmética em centavos inteiros.

## API (módulo novo `backend/src/modules/comandas/` e `modules/cash/`, padrão dos módulos existentes)

Todas com `authMiddleware`, `requireTenantRoles` e `requireFeature('finance')`, escopo por
`business_id` do usuário.

**Agendamentos**
- `GET /appointments` — DTO passa a trazer `service_duration_minutes`, `deposit_amount`,
  `source`, `started_at`, `comanda_id`, `comanda_status`.
- `GET /appointments/:id/details` — DTO do drawer: agendamento + `client_stats`
  (`average_cycle_days` entre visitas concluídas, `visits_this_year`,
  `last_visit_days_ago`, `last_visit_professional`, `is_recurring` = ≥ 2 visitas), `client_notes`.
- `PUT /appointments/:id/status` — aceita `em_atendimento`, `faltou`, `confirmado`,
  `cancelado`; rejeita `concluido` com 409 ("Feche a comanda para concluir").
- `GET /appointments/available-slots` e disponibilidade da página pública e do bot: excluem o
  intervalo `break_start–break_end` da profissional.

**Comandas**
- `POST /appointments/:id/comanda` — cria (ou devolve a existente) em `rascunho`, com o serviço
  principal como item; muda o status para `em_atendimento` se estava `confirmado`.
- `GET /comandas/:id` — comanda + itens + cálculo + percentuais vigentes + atalhos.
- `PUT /comandas/:id` — salva rascunho (itens, desconto, gorjeta, forma de pagamento).
- `POST /comandas/:id/close` — fecha: exige caixa do dia aberto (409 `CASH_CLOSED` senão),
  valida forma de pagamento, copia percentuais, grava totais, liga ao caixa, conclui o
  agendamento (`concluido`, `finished_at`), grava/atualiza o `earning` com
  `subtotal − discount` e dispara o comprovante (assíncrono, falha não desfaz o fechamento).
  Tudo numa transação.
- `GET /comandas/shortcuts` — os 3 itens extras (serviço ou produto) mais usados nas comandas
  fechadas dos últimos 90 dias; vazio se não houver histórico.

**Produtos**
- `GET/POST/PUT/DELETE /products` (DELETE desativa).

**Caixa**
- `GET /cash/today?date=YYYY-MM-DD` — sessão (ou `null`), métricas de comandas (fechadas =
  comandas fechadas no dia; abertas = agendamentos `em_atendimento`; falta = `faltou`),
  entradas por forma de pagamento (Pix balcão, Sinais Pix do dia, Débito, Crédito, Dinheiro;
  com valor, quantidade e % do total), lista paginada de comandas/atendimentos do dia,
  despesas do dia, movimentos, conferência da gaveta (`opening + entradas dinheiro +
  suprimentos − sangrias − despesas em dinheiro`).
- `POST /cash/open` `{ openingBalance }` — 409 se já aberto.
- `POST /cash/movements` `{ kind, amount, description }` — exige caixa aberto.
- `POST /cash/close` `{ countedBalance, notes? }` — grava esperado, contado e diferença.

**Ajustes e cadastros**
- `business_settings` aceita os dois percentuais padrão.
- `PUT /professionals/:id` aceita percentuais próprios e intervalo (validação: fim > início,
  dentro do expediente).
- `POST /finance/expenses` aceita `payment_method`.

## Telas (fiéis ao Stitch)

**Agenda desktop** — mantém a estrutura atual (já parecida com a Corrigida) e ajusta ao
arquivo `44833f`: textos, contador por coluna, blocos de "Almoço" reais por profissional,
legenda de 6 status todos alcançáveis. "Livre N min · Clique para agendar" e "+ Encaixe
rápido" abrem o `CreateAppointmentModal` pré-preenchido com profissional, data e horário.
Altura dos blocos pela duração real (`service_duration_minutes`); faixa de horário que passa
da meia-noite mostra "23:30 às 01:30".

**Agenda mobile** — ações do gesto de deslizar viram "Iniciar atendimento" (confirmado) e
"Concluir" (em atendimento → abre a comanda em folha inferior). "Total previsto hoje" real.

**Drawer de detalhes** — refeito pelo `7ba488`: cabeçalho "Agendamento #N" + chip de status;
cliente com telefone, selo "Cliente recorrente" e botão de WhatsApp; cartões "Ciclo médio"
(com "Ideal para o serviço" só quando houver ≥ 3 visitas) e "Total de visitas em <ano>"
("Última há N dias com <profissional>"); "Serviço e horário" com origem real; "Pagamento" com
sinal real e "Restante no balcão"; "Observações da ficha técnica" com `client.notes` (bloco
some se vazio); botões por status (Iniciar / Concluir atendimento e receber / Remarcar /
Cliente faltou / Cancelar). Sem dados, cada bloco mostra estado vazio, nunca exemplo.

**Comanda** — modal grande no desktop e tela cheia no celular, fiel ao `a9945c`, menos "Mesa"
e "Clube": cabeçalho, itens com +/− e lixeira (o serviço principal não tem lixeira), busca de
serviço/produto, atalhos, forma de pagamento (Pix "Sem taxa", Débito, Crédito, Dinheiro),
resumo financeiro, desconto (R$ ou %), gorjeta (R$ 5/10/15/Outro, "100% repassado"), total a
cobrar, divisão do repasse com a regra vigente, "Salvar como rascunho" e "Fechar comanda e
enviar WhatsApp (R$ X)" (ou "Fechar comanda" sem WhatsApp conectado). Rodapé com os dois
cartões informativos ("Comprovante instantâneo", "Lançamento em caixa") só quando forem
verdade para aquela comanda. Caixa fechado → passo "Abrir caixa do dia" dentro do próprio
modal antes de fechar.

**Caixa** — `baf21f` com dado real em todos os blocos; botões "Abrir caixa" (quando não há
sessão), "Registrar sangria/suprimento", "Nova despesa" (com forma de pagamento) e "Fechar
caixa" (pede valor contado, mostra diferença; selo "Bate 100%" só quando a diferença é zero).
Navegação por data para ver caixas anteriores (somente leitura).

**Cadastros sem tela no Stitch** (seguem o design system atual): aba "Produtos" em Serviços;
comissão própria e intervalo no modal da profissional; comissão padrão em Ajustes.

## Limpeza

- Apagar de `frontend/src/lib/conteudoDemo.ts` as chaves `agenda` e `caixa` e seus tipos; os
  testes de conformidade/`conteudoDemo.test.ts` são atualizados.
- `docs/design/SEGUIMENTO.md`: remover os itens resolvidos (duração 60 min, meia-noite,
  pré-preenchimento do horário livre, legenda de status, linha em negrito vazia).

## Erros e bordas

- Fechar comanda com caixa fechado → 409 `CASH_CLOSED`; a tela oferece abrir ali mesmo.
- Duas pessoas fechando a mesma comanda → a segunda recebe 409 (`status` já `fechada`).
- Comprovante falhou no WhatsApp → comanda fecha; aviso "Comprovante não enviado" e
  `receipt_sent_at` fica nulo; o drawer oferece "Reenviar comprovante".
- Agendamento cancelado/faltou não pode abrir comanda (409).
- Faltou com sinal pago: o sinal continua contado em "Sinais Pix" do dia em que foi pago; não
  vira comanda.
- Intervalo de almoço fora do expediente ou com fim ≤ início → 400.
- Valores negativos ou quantidade < 1 → 400.

## Testes

Backend (Vitest, padrão atual com mocks de repositório):
- `comandaMath`: totais, sinal maior que subtotal, desconto limitado, rateio do desconto na
  comissão, gorjeta fora do faturamento, arredondamento.
- Transições de status, inclusive rejeição de `concluido` direto.
- Serviço de comanda: criar, salvar rascunho, fechar (caixa fechado, já fechada, sem forma
  de pagamento, cópia de percentuais, earning gravado).
- Caixa: abrir duas vezes, movimento sem caixa, conferência da gaveta, diferença.
- Disponibilidade exclui intervalo de almoço (painel, página pública e bot).
- Atalhos: ordenação por uso, vazio sem histórico.

Frontend (Vitest + Testing Library):
- Comanda: soma ao mudar quantidade, desconto em %, gorjeta "Outro", botão muda sem
  WhatsApp, passo de abrir caixa.
- Drawer: botões por status, blocos vazios sem dado.
- Caixa: estado sem sessão, conferência, selo "Bate 100%".
- Agenda: clique em horário livre abre o modal pré-preenchido; bloco de almoço.

Verificação final: tipos, todos os testes, build, e o app rodando localmente para conferência
lado a lado com o Stitch.
