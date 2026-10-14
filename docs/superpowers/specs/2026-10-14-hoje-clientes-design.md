# Sub-projeto 2B — Hoje e Clientes com dados reais

Data: 2026-10-14 · Status: aprovado em conversa, aguardando revisão da especificação escrita.

## Contexto e objetivo

Continuação do relançamento do EasyAgenda+ para venda (roteiro em
`docs/superpowers/specs/2026-10-13-agenda-comanda-caixa-design.md`). O 2A (Agenda, Comanda
e Caixa) já está na `main` local e no PR #3; suas tabelas (comandas, caixa, produtos) e
status (`em_atendimento`, `faltou`) estão aplicados no banco de produção.

O 2B reconstrói, **fiel à versão mais nova de cada tela do Stitch**, a tela **Hoje** e o
**CRM de Clientes** (lista, visão por fases e ficha da cliente), trocando todo o conteúdo de
exemplo (`conteudoDemo.hoje`, `conteudoDemo.clientes`) por dados reais.

Regra para a versão mais nova do Stitch: vale a que segue o `docs/design/DESIGN.md`
(rodapé "Plano Equipe", sem "Pro"/"Funil"/"WABA", datas de 2026).

**Sucesso:** a dona abre a Hoje e cada número, pendência e nome vem do negócio dela; abre
Clientes e vê a fase real de cada cliente, o ciclo, o retorno previsto, o LTV; abre a ficha e
registra a ficha técnica, as fotos dos procedimentos e o consentimento de WhatsApp; inscreve
alguém na lista de espera e oferece uma vaga pelo WhatsApp. Nenhuma chave de
`conteudoDemo.hoje` ou `conteudoDemo.clientes` resta.

## Referências do Stitch (versão nova, em `docs/design/stitch/projeto/`)

| Tela | Arquivo | Situação |
|---|---|---|
| Hoje desktop | `studio-aurora-hoje-painel-desktop--575b48.html` | já implementada nessa versão; trocar dados |
| Hoje mobile | `studio-aurora-hoje-painel-mobile--b808ac.html` | única versão; trocar dados |
| Clientes lista | `studio-aurora-crm-clientes-lista-desktop-ajustada--805f33.html` | implementada pela antiga `3b6f5d`; ajustar |
| Clientes fases | `studio-aurora-crm-clientes-visao-por-fases-corrigida--19ad17.html` | nova |
| Ficha da cliente | `studio-aurora-ficha-da-cliente-mariana-souza-ajustada--96f71e.html` | implementada pela antiga `94c43e`; refazer |
| Ficha mobile | `studio-aurora-ficha-resumida-da-cliente-mobile--e3b0b0.html` | nova |

(`48a30e` é outra versão "Equipe" da Hoje, praticamente igual à `575b48`; vale a `575b48`, já
implementada.)

## Decisões tomadas

1. **Ficha técnica:** modelo por segmento do negócio + campos livres. "Alergias e restrições"
   sempre presente. O segmento é escolhido em Ajustes.
2. **Etiquetas:** automáticas (calculadas) + manuais (criadas pela dona). "Clube VIP" só no
   sub-projeto 4.
3. **Ações de WhatsApp no 2B** abrem a conversa da cliente (`https://wa.me/<telefone>?text=`)
   com mensagem pronta e editável, uma por vez. Disparo em massa/automático fica no 2C.
4. **Lista de espera** real. A métrica "Receita recuperada via lembretes" é trocada por
   **"Confirmados por lembrete"** (definição honesta, sem atribuir causa).
5. **Fotos de procedimento** são dado pessoal da cliente: bucket **privado** novo, links
   assinados de curta duração, upload pelo backend.
6. **Consentimento LGPD:** registro explícito com data e canal. Clientes existentes ficam
   **"não informado"** — nunca dados como consentidos. A caixa de consentimento na página
   pública vem **desmarcada** (consentimento pré-marcado não é válido pela LGPD).
7. **Cálculos no backend**, com um endpoint de resumo por tela (mesmo padrão do 2A).

## Regras de cálculo

Base: agendamentos `concluido` da cliente (visitas). Receita: `earnings.amount` (= serviços +
produtos − desconto da comanda, gravado no fechamento — 2A). Datas no fuso do negócio.

- **Ciclo médio** = média, em dias inteiros arredondados, dos intervalos entre visitas
  consecutivas; `null` com menos de 2 visitas.
- **Retorno previsto** = última visita + ciclo médio. Se já passou: "Venceu há N dias".
  Sem ciclo: 1 visita → "Sugerir retorno em ~45 dias"; 0 visitas → "—".
- **LTV** = soma da receita das visitas da cliente; com o número de atendimentos.
- **Ticket médio** = LTV ÷ visitas (null com 0 visitas).
- **Fase** (exatamente uma, avaliada nesta ordem, `dias` = dias desde a última visita,
  `limite` = 1,5 × ciclo médio, ou 45 quando não há ciclo):
  1. **Perdido**: tem visita e `dias > 120`.
  2. **Em risco**: tem visita e `dias > limite`.
  3. **Novo**: 0 ou 1 visita.
  4. **Fiel / VIP**: 5 ou mais visitas.
  5. **Recorrente**: demais (2 a 4 visitas, dentro do limite).
- **Etiquetas automáticas** (não gravadas): fase; "Aniversário DD/MM" quando o aniversário cai
  no mês corrente; "Primeira vez" com exatamente 1 visita; "Resgatável" na fase Em risco.
- **Taxa de retenção** = clientes com visita nos últimos 90 dias que também tinham visita nos
  90 dias anteriores ÷ clientes com visita nos 90 dias anteriores (percentual inteiro; `null`
  sem base).
- **Clientes ativas** = clientes `active = true` com ao menos 1 visita nos últimos 120 dias.
- **Faturamento de hoje** = soma dos `earnings` com data de hoje.
- **Ocupação de hoje** = minutos agendados (não cancelados) ÷ minutos disponíveis no expediente
  de cada profissional ativa, **descontando o intervalo de almoço**; comparação com a média da
  mesma métrica nas 4 semanas anteriores no mesmo dia da semana ("+6% vs média de terça").
- **Horários livres à tarde** = vagas livres de 30 min ou mais entre 12:00 e o fechamento.
- **Confirmados por lembrete (mês)** = atendimentos `concluido` no mês corrente com
  `reminder_sent = true`, quantidade e soma da receita. Rótulo: "Confirmados por lembrete" /
  "N atendimentos com lembrete enviado no mês".
- **Retorno vencido** (pendência da Hoje) = clientes ativas cujo retorno previsto já passou e
  que não têm agendamento futuro.
- **Avaliação desfavorável** = `whatsapp_ratings.rating <= 3` nos últimos 7 dias.

## Modelo de dados (migração Prisma única)

- `business_settings`: `segment varchar(20) default 'outro'`
  (`unhas` | `cilios_sobrancelhas` | `cabelo` | `barbearia` | `estetica` | `outro`) e
  `daily_revenue_goal decimal(10,2) null`.
- `tags`: `id`, `business_id`, `name varchar(40)`, `color varchar(20)` (nome de token:
  `brand` | `success` | `warning` | `danger` | `tertiary` | `muted`), `created_at`;
  `unique(business_id, lower(name))` — índice funcional criado por SQL na migração (o Prisma não expressa `lower()` em `@@unique`).
- `client_tags`: `client_id`, `tag_id`, `created_at`; PK composta; cascade nos dois lados.
- `client_technical_sheets`: `client_id` PK/FK, `business_id`, `allergies text null`,
  `fields jsonb default '{}'` (chaves do modelo do segmento), `custom_fields jsonb default '[]'`
  (`[{label, value}]`), `updated_at`, `updated_by` (user).
- `client_photos`: `id`, `business_id`, `client_id`, `appointment_id null`, `service_name
  varchar(255) null` (cópia), `caption varchar(255) null`, `storage_path text`, `taken_at date`,
  `created_at`, `created_by`.
- `client_consents`: `id`, `business_id`, `client_id`, `kind` (`whatsapp_lembretes`),
  `granted bool`, `channel` (`painel` | `publico` | `whatsapp`), `granted_at`,
  `revoked_at null`, `recorded_by null` (user, quando pelo painel). Estado atual = registro
  mais recente; nenhum registro = "não informado".
- `waitlist_entries`: `id`, `business_id`, `client_id`, `service_id`, `professional_id null`,
  `desired_date date null`, `period` (`manha` | `tarde` | `noite` | `qualquer`),
  `notes varchar(255) null`, `status` (`aguardando` | `oferecida` | `agendada` | `cancelada`),
  `offered_at null`, `appointment_id null`, `created_at`.
- Bucket Supabase Storage **privado** `client-photos`, criado pela migração se não existir
  (`storage.buckets`, `public = false`), objetos em `<business_id>/<client_id>/<uuid>.<ext>`.
- RLS habilitado em todas as tabelas novas (sem policy).

**Modelos de ficha técnica por segmento** (constante compartilhada backend/frontend,
`technicalSheetTemplates`): cada modelo é uma lista de campos `{ key, label, type: 'texto' |
'opcoes', options? }`. Conteúdo:
- `unhas`: formato preferido (amendoado, quadrado, stiletto, bailarina, redondo), comprimento,
  cor/acabamento favorito, curvatura, observações de aplicação.
- `cilios_sobrancelhas`: técnica (fio a fio, volume russo, híbrido, lash lifting), curvatura,
  espessura, tamanho, formato da sobrancelha, observações.
- `cabelo`: tipo de fio, química atual, coloração (número/marca), corte preferido,
  observações.
- `barbearia`: máquina (altura), estilo do corte, barba, produtos preferidos, observações.
- `estetica`: tipo de pele, sensibilidade, protocolo atual, contraindicações, observações.
- `outro`: só observações.

## API (padrão `modules/<nome>/`, todas com auth + tenant + `requireFeature` adequado)

**Hoje** — `GET /dashboard/today` → `{ saudacao: { ownerName, date }, faturamento: { valor,
meta | null, percentual | null }, agendamentos: { total, livresTarde }, ocupacao: { percentual,
variacao | null, diaDaSemana }, confirmadosLembrete: { quantidade, valor }, pendencias: [...],
proximas: Appointment[] (2 h, com profissionais), semana: [{ data, valor }] }`. Cada pendência
tem `tipo` (`vagas_tarde` | `retorno_vencido` | `sinais_pix` | `avaliacao`), contagem e os dados
do texto (soma, prazo, cliente da avaliação…); só vêm as que existem. O endpoint antigo
`GET /dashboard` continua, para não quebrar quem usa.

**Clientes**
- `GET /clients/insights?page&pageSize&busca&fase&etiqueta&profissional&ordem` → itens com
  `id, name, phone, email, birth_date, tags (manuais), etiquetasAuto, fase, ultimaVisita {data,
  servico, profissional, diasAtras}, cicloMedio, retornoPrevisto {data | null, venceuHa | null,
  texto}, ltv, atendimentos, consentimento` + `contagemPorFase` + `total`.
- `GET /clients/phases` → as 5 colunas com contagem, soma de LTV e até 20 cartões cada;
  `kpis: { ativas, ativasNovasNoMes, ltvMedio, retencao }`.
- `GET /clients/:id/profile` → cabeçalho, indicadores (ciclo, ticket médio, visitas no ano,
  faltas + cancelamentos), ficha técnica, consentimento atual, etiquetas.
- `GET /clients/:id/timeline?filtro=todos|agendamentos|financeiro` → eventos ordenados: agendado,
  concluído (com valor da comanda), faltou, cancelado, lembrete enviado, avaliação (nota e
  comentário), sinal Pix, cadastro.
- `GET /clients/export.csv` → CSV (UTF-8 com BOM, `;`): nome, telefone, e-mail, aniversário,
  fase, última visita, ciclo, LTV, atendimentos, etiquetas, consentimento.
- `PUT /clients/:id/technical-sheet` `{ allergies, fields, customFields }`.
- `POST /clients/:id/consent` `{ granted }` (canal `painel`, registra quem).
- Etiquetas: `GET/POST/PUT/DELETE /tags`; `PUT /clients/:id/tags` `{ tagIds }`.
- Fotos: `GET /clients/:id/photos` (cada uma com `url` assinada, 10 min);
  `POST /clients/:id/photos` (base64 até 5 MB, jpeg/png/webp, `caption`, `appointmentId?`);
  `DELETE /clients/:id/photos/:photoId` (apaga o objeto do storage).

**Lista de espera** — `GET /waitlist?status&periodo&data`, `POST /waitlist`,
`PUT /waitlist/:id` (status/campos), `POST /waitlist/:id/offer` (marca `oferecida` e devolve o
link `wa.me` com a mensagem da vaga), `POST /waitlist/:id/booked` `{ appointmentId }`.

**Ajustes** — `business_settings` aceita `segment` e `dailyRevenueGoal` (endpoint de comissão
do 2A é o modelo: `GET/PUT /business/crm-settings`).

**Página pública** — o corpo da reserva aceita `whatsappConsent: boolean`; quando `true`,
grava consentimento com canal `publico`.

**Mensagens prontas** (`whatsappTemplates`, frontend): `retorno_vencido`, `pos_atendimento`,
`mimo`, `resgate`, `resposta_avaliacao`, `oferta_vaga` — textos curtos com `{nome}`,
`{servico}`, `{negocio}`, `{data}`, `{hora}`; sempre editáveis antes de abrir a conversa.

## Telas (fiéis ao Stitch)

**Hoje (desktop e mobile)** — saudação com o nome da dona; "Disparos WhatsApp" leva à tela do
WhatsApp; quatro cartões reais (faturamento + meta ou "Definir meta", agendamentos + livres à
tarde, ocupação + variação, confirmados por lembrete); "Precisa de você" só com pendências
existentes; "Próximas 2 horas"; "Faturamento últimos 7 dias". Sem nomes de exemplo.

**Clientes · lista** — fiel a `805f33`: alternador Lista/Fases, busca, ordenação, abas por fase
com contagem, filtros de etiqueta e profissional, tabela com as colunas da seção de API,
paginação ("Mostrando 1–10 de N clientes"), "Exportar" (CSV), "+ Nova cliente", ações rápidas
(WhatsApp, agendar, menu com editar/etiquetas/excluir).

**Clientes · fases** — fiel a `19ad17`: três KPIs no topo, cinco colunas com rolagem horizontal
no celular, cartões com ação por fase (Novo → "Pós-atendimento WhatsApp"; Recorrente → "Agendar
retorno"; Fiel → "Enviar mimo no WhatsApp"; Em risco → "Resgatar no WhatsApp"; Perdido →
"Campanha de resgate" que abre a mensagem de resgate).

**Ficha da cliente (desktop e mobile)** — fiel a `96f71e` / `e3b0b0`: cabeçalho com etiquetas e
faixa LGPD ("Consentimento ativo para WhatsApp e lembretes · desde <data> · <canal>" /
"Consentimento não informado — registrar"), botões "Conversar no WhatsApp" e "Novo
agendamento"; quatro indicadores; ficha técnica (alergias em destaque `warning`, campos do
modelo, campos livres, "Atualizar ficha técnica" com data e autor); galeria (grade, legenda e
data, "+ Anexar foto", remover); linha do tempo com filtro. "Assinante Clube VIP" não aparece.

**Lista de espera** — painel lateral acessível da Hoje (pendência de vagas) e da Agenda (botão
no cabeçalho): inscrever (cliente, serviço, profissional, data/período, observação), ofertar
vaga (abre o WhatsApp e marca oferecida), agendar (abre o novo agendamento preenchido e, ao
salvar, marca agendada), cancelar.

**Ajustes** — segmento do negócio, meta de faturamento diária, gestão de etiquetas.

**Página pública** — caixa "Quero receber lembretes e novidades pelo WhatsApp de <negócio>",
**desmarcada**, com o texto do consentimento.

Telas sem referência no Stitch (lista de espera, ajustes, gestão de etiquetas) seguem o design
system atual.

## Limpeza

- Remover `conteudoDemo.hoje` e `conteudoDemo.clientes` (e tipos); após o 2B restam só
  `whatsapp` e `plano` (2C/2D).
- `docs/design/SEGUIMENTO.md`: remover itens resolvidos (nomes de exemplo na Hoje, `ownerName`
  fora da sessão, fase CRM de exemplo).

## Erros e bordas

- Cliente sem telefone: botões de WhatsApp desabilitados com dica "Cadastre o telefone".
- Foto acima de 5 MB ou tipo inválido → 400 com mensagem; link assinado expirado → a galeria
  pede novos links ao reabrir.
- Foto de outro negócio: o caminho é sempre derivado do `business_id` do usuário; acesso a
  `photoId` de outro negócio → 404.
- Etiqueta com nome repetido → 409. Apagar etiqueta remove de todas as clientes.
- Lista de espera: agendar uma inscrição já agendada/cancelada → 409.
- Meta inválida (≤ 0) → 400; meta vazia remove a meta.
- Export com muitas clientes: geração em stream, sem limite de linhas.

## Testes

Backend: cada regra de fase nos limites (45/120 dias, 1,5× ciclo, 1/2/5 visitas); ciclo,
retorno e textos; LTV e ticket; retenção; ocupação com almoço e média das 4 semanas;
pendências (só as existentes); confirmados por lembrete; timeline (tipos e filtro); CSV
(cabeçalho, BOM, separador); ficha técnica (modelo por segmento + livres); consentimento
(estado atual, não informado, canal público); etiquetas (409, cascade); fotos (tipo, tamanho,
isolamento entre negócios, apagar no storage); lista de espera (transições e 409).

Frontend: Hoje sem exemplo e com estados vazios; lista (filtros, paginação, exportar); fases
(ações por fase); ficha (ficha técnica, galeria, consentimento, timeline); lista de espera;
ajustes; caixa de consentimento desmarcada na página pública.

Verificação final: tipos, suítes, build, migração aplicada (com confirmação do dono) e o app
rodando para conferência lado a lado com o Stitch.
