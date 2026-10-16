# Sub-projeto 2C-1 — WhatsApp: Conversas e base de envio

Data: 2026-10-16 · Branch: `feat/whatsapp-conversas` (sai de `feat/hoje-clientes`, PR #4)

## Contexto e objetivo

O WhatsApp do EasyAgenda+ já conecta por QR code (Evolution API v2), tem robô com menu configurável, lembretes automáticos e recibos. Mas **nenhuma mensagem é guardada**: não há central de conversas, histórico de disparos nem contagem de envios. O 2C foi dividido em duas partes (decisão do dono, 2026-10-16):

- **2C-1 (este):** abas **Conversas** e **Conexão** fiéis ao Stitch, mais a base que o resto depende — guardar mensagens, registro de envios, opt-out (SAIR/VOLTAR) e atendimento humano.
- **2C-2 (depois):** Hora de voltar, Automações (7 regras) e Campanhas (fila cadenciada).

Sucesso: a dona vê e responde as conversas das clientes pelo painel, assume e devolve ao robô, vê a saúde e o histórico de envios reais, e quem responde SAIR para de receber mensagens automáticas.

## Referências do Stitch (versão nova, em `docs/design/stitch/projeto/`)

| Tela | Arquivo |
|---|---|
| Conexão e limites | `studio-aurora-whatsapp-conexao-e-limites-ajustada--ff12c8.html` |
| Central de conversas | `studio-aurora-whatsapp-central-de-conversas-ajustada--4ea360.html` |

O visual (layout, cores, textos, ordem dos blocos) segue essas telas. Os dados de exemplo ("Studio Aurora", "Carla", "68 de 250") são trocados por dados reais; bloco sem dado real ou some ou é trocado por equivalente real no mesmo lugar (lista em "Desvios do Stitch").

## Decisões tomadas (com o dono)

1. **Divisão 2C-1 / 2C-2** como acima.
2. **Quem aparece na central (opção B):** só clientes cadastradas do negócio e números que conversaram com o robô. Outras conversas do número não são gravadas e continuam só no celular.
3. **Armazenamento próprio (abordagem A):** mensagens gravadas no nosso banco a partir do webhook (entrada e eco `fromMe`) e do ponto único de envio `sendWhatsAppMessage` (saída).
4. **Volta automática ao robô** depois de **12 h** sem atividade numa conversa em atendimento humano.
5. **Retenção de 180 dias** das mensagens, com limpeza diária.
6. **Abas no 2C-1:** Conversas, Conexão e **Automações**. Até o 2C-2, Automações hospeda a configuração atual do robô (Menu, Mensagens, Simulador) sem mudanças; no 2C-2 ela ganha o visual do Stitch e essa configuração vai para "Configurações de envio". Hora de voltar e Campanhas só aparecem no 2C-2 (nenhuma aba vazia ou "em breve"). Ordem das abas segue o Stitch: Automações, Conversas, Conexão.
7. **Palavra de opt-out padronizada: SAIR** (o Stitch usa "PARAR" numa tela e "SAIR" noutra). Também aceitas: PARAR, CANCELAR, STOP, DESCADASTRAR (texto inteiro da mensagem, sem diferenciar maiúsculas/acentos/espaços). Reativação: **VOLTAR**.

## Modelo de dados (migração Prisma única, só adições)

Migração `20261016120000_whatsapp_conversas`. RLS habilitada nas três tabelas, no mesmo padrão das tabelas do 2B.

**`whatsapp_conversations`** — uma por negócio + telefone
- `id` uuid PK; `business_id` uuid FK (cascade); `phone` varchar(20) (só dígitos, com DDI 55); `client_id` uuid FK nullable (SetNull)
- `handler` varchar(10): `bot` | `humano` (default `bot`)
- `assigned_user_id` uuid FK users nullable (SetNull) — quem assumiu
- `status` varchar(12): `aberta` | `aguardando` | `finalizada` (default `aberta`)
- `last_message_at` timestamptz; `last_message_preview` varchar(160); `last_inbound_at` timestamptz nullable
- `unread_count` int default 0
- `created_at`, `updated_at`
- Único: (`business_id`, `phone`). Índice: (`business_id`, `status`, `last_message_at` desc).

**`whatsapp_messages`**
- `id` uuid PK; `business_id` uuid FK (cascade); `conversation_id` uuid FK (cascade)
- `direction` varchar(3): `in` | `out`
- `origin` varchar(20): `cliente` | `bot` | `lembrete` | `confirmacao` | `pix_recibo` | `lista_espera` | `manual_painel` | `manual_celular` | `sistema`
- `body` text (texto; mídia vira marcador, ver Bordas); `media_type` varchar(12) nullable (`imagem` | `audio` | `video` | `documento` | `figurinha`)
- `provider_message_id` varchar(128) nullable
- `status` varchar(10): `recebida` | `enviada` | `entregue` | `lida` | `falhou`
- `sent_by_user_id` uuid FK users nullable (SetNull) — autor no painel
- `created_at` timestamptz
- Único parcial: (`business_id`, `provider_message_id`) onde `provider_message_id` não é nulo. Índices: (`conversation_id`, `created_at`), (`business_id`, `direction`, `created_at`).

**`whatsapp_opt_outs`**
- `id` uuid PK; `business_id` uuid FK (cascade); `phone` varchar(20); `client_id` uuid nullable
- `opted_out_at` timestamptz default now(); `keyword` varchar(20); `reactivated_at` timestamptz nullable
- Único: (`business_id`, `phone`). Um número está em opt-out quando existe linha com `reactivated_at` nulo.

**Colunas novas em tabelas existentes**
- `businesses.whatsapp_connected_at` timestamptz nullable — gravada quando o webhook `connection-update` informa `open` (só se estava nula ou desconectada antes); zerada quando informa `close`/logout.
- `business_settings.whatsapp_politica` text nullable — texto da resposta rápida "Política", editável na aba Automações › Mensagens (campo novo "Política de cancelamento e sinal", até 1000 caracteres).

Consentimento (tabela `client_consents` do 2B): SAIR de cliente cadastrada grava `granted=false, channel='whatsapp'`; VOLTAR grava `granted=true, channel='whatsapp'`. `recorded_by` nulo.

## Fluxo

### Saída (ponto único)
`sendWhatsAppMessage(phone, message, context)` ganha em `context`: `businessId` (obrigatório para gravar), `origin` e `sentByUserId` opcional. Todos os chamadores atuais passam a informar `businessId` e `origin`:

| Chamador | origin |
|---|---|
| `whatsappFlowService` (robô) | `bot` |
| `cronService` lembrete | `lembrete` |
| `appointments.service` confirmação/aviso | `confirmacao` |
| `comandas/receipt.ts` e sinal Pix | `pix_recibo` |
| oferta da lista de espera (servidor) | `lista_espera` |
| envio pelo painel (novo) | `manual_painel` |
| teste de envio (`/test-send`) | `sistema` |

Depois do envio (sucesso ou falha) grava a mensagem com `status` `enviada` ou `falhou` e o `provider_message_id` devolvido pela Evolution, e atualiza a conversa (prévia, `last_message_at`). **Gravar nunca bloqueia nem derruba o envio**: erro de gravação vira `logger.warn`.

Mensagens que não são de conversa com cliente (ex.: teste de envio para o próprio número) gravam a mensagem para contagem, mas a conversa só é criada se o número passar na regra da decisão 2.

**Opt-out na saída:** envios automáticos (`lembrete`, `confirmacao` de lembrete, `lista_espera` automática e as regras do 2C-2) são **pulados** para números em opt-out. Respostas do robô a uma mensagem que a própria cliente mandou, recibos de pagamento e envios manuais pelo painel não são bloqueados (são resposta a um contato iniciado por ela ou transacionais).

### Entrada (webhook `MESSAGES_UPSERT`)
1. Ignora grupos (`@g.us`), status/broadcast e mensagens sem telefone.
2. Resolve o negócio pela instância (lógica atual).
3. Aplica a regra da decisão 2: grava se o telefone é de cliente do negócio **ou** já existe conversa **ou** o robô vai atender esta mensagem (sessão nova/ativa do robô). Caso contrário não grava nada.
4. Grava mensagem `in`/`cliente`/`recebida`, incrementa `unread_count`, atualiza `last_inbound_at`, prévia e `last_message_at`; vincula `client_id` pelo telefone quando ainda nulo.
5. **SAIR/VOLTAR** (antes do robô): SAIR → cria/atualiza opt-out, revoga consentimento se cliente, responde "Pronto, você não vai mais receber mensagens automáticas do {negócio}. Para voltar, responda VOLTAR." e encerra (robô não processa). VOLTAR → `reactivated_at = now()`, grava consentimento concedido, responde confirmação. Vale mesmo para número sem cadastro (fica registrado por precaução).
6. **Atendimento humano:** se `handler = humano`, o robô **não** responde; status vira `aguardando` quando a última mensagem é da cliente.
7. Caso contrário, segue para o robô (fluxo atual).

**Eco `fromMe`** (mensagem saindo do número): se o `provider_message_id` já existe, só atualiza; se não existe, é mensagem digitada no celular → grava `out`/`manual_celular`/`enviada` (respeitando a regra da decisão 2). Hoje `fromMe` é descartado no início do webhook; passa a ser tratado só para isso, sem acionar o robô.

### Situação de entrega (`MESSAGES_UPDATE`)
`MESSAGES_UPDATE` entra em `WEBHOOK_EVENTS`. O handler é mínimo: lê `keyId`/`status`, atualiza `status` para `entregue` (DELIVERY_ACK) ou `lida` (READ/PLAYED) quando existe a mensagem, sem regredir (lida não volta a entregue). Sem log por evento além de debug. Como `verifyAndFixWebhook` compara os eventos com `WEBHOOK_EVENTS`, basta incluir o evento: as instâncias existentes são corrigidas por `whatsappService.syncAllWebhooks()`, que passa a ser chamado uma vez na subida do servidor (sem bloquear o `listen`, erro só vira `logger.warn`; não roda com `DISABLE_CRON=true`), além dos pontos que já chamam `verifyAndFixWebhook` ao conectar/consultar status.

### Atendimento humano
- Menu do robô "Falar com um humano" (`handler: 'attendant'`): envia a `attendant_message` atual e passa a conversa para `handler=humano`, `status=aguardando`, `assigned_user_id` nulo.
- **Assumir** (painel): `handler=humano`, `assigned_user_id=usuário`, grava mensagem `sistema` "{Nome} assumiu o atendimento" (só no painel, não enviada).
- **Devolver ao Bot:** `handler=bot`, `assigned_user_id` nulo, `status=aberta`; mensagem `sistema` "Conversa devolvida ao robô". Encerra sessão do robô presa, se houver.
- **Finalizar** acontece quando: conversa com o robô sem nova mensagem por 24 h (mesmo cron da volta automática), ou volta automática. Conversa finalizada reabre (`aberta`, ou `aguardando` se humano) com nova mensagem da cliente.
- **Volta automática:** cron a cada 15 min: conversas `humano` com `last_message_at` há mais de 12 h → `handler=bot`, `status=finalizada`, mensagem `sistema` "Voltou ao robô por inatividade".
- Envio manual pelo painel numa conversa `bot` assume automaticamente (evita robô e pessoa respondendo ao mesmo tempo).

### Limpeza (cron diário 03:30)
Apaga `whatsapp_messages` com mais de 180 dias; conversas sem mensagens e sem atividade há 180 dias são apagadas. Opt-outs **não** são apagados (precisam persistir).

## API (módulo `modules/whatsappInbox/`, guard `authMiddleware + requireTenantRoles + requireFeature('whatsapp_automation')`)

| Método e rota | Função |
|---|---|
| `GET /whatsapp/conversations?filtro=todas\|aguardando\|bot\|finalizadas&cursor=` | Fila (30 por página, por `last_message_at` desc) + contadores por filtro |
| `GET /whatsapp/conversations/:id` | Cabeçalho + contexto da cliente (fase, cliente desde, LTV, ciclo médio vindos do CRM do 2B; próximo agendamento; 2 últimas visitas) |
| `GET /whatsapp/conversations/:id/messages?antes=` | 50 mensagens por página, mais novas por último |
| `POST /whatsapp/conversations/:id/messages` `{ texto }` | Envio manual (`manual_painel`), assume se estiver com o bot |
| `POST /whatsapp/conversations/:id/assumir` | Assumir |
| `POST /whatsapp/conversations/:id/devolver` | Devolver ao robô |
| `POST /whatsapp/conversations/lidas` `{ ids? }` | Marcar lidas (todas do filtro atual se `ids` ausente) |
| `GET /whatsapp/conversations/:id/respostas-rapidas` | Textos prontos de Chave Pix, Como chegar, Horários livres, Política (cada um com `disponivel` e motivo) |
| `GET /whatsapp/connection/summary` | Cartões, envios de hoje por grupo, saúde e últimos 20 envios |

Regras comuns: tudo filtrado por `businessId` da sessão; `:id` não-UUID → 404 "Conversa não encontrada" (reaproveitar o helper do 2B e adicionar "Conversa" à lista de femininos do `NotFoundError`); texto do envio 1–4096 caracteres; erros em pt-BR.

**Permissões:** `tenant_admin` faz tudo. `employee` vê a fila e as conversas; envia/assume só se a conversa está `aguardando` sem responsável ou atribuída a ela; não devolve conversa de outra pessoa (403 "Esta conversa está com outra pessoa").

**Envio com WhatsApp desconectado:** 409 "WhatsApp desconectado. Reconecte na aba Conexão." e nada é gravado.

### Regras de cálculo da Conexão
- **Envios de hoje:** mensagens `out` do negócio desde 00:00 no fuso do negócio, excluindo `sistema` de painel (assumiu/devolveu). Grupos: "Lembretes e confirmações automáticas" = `lembrete`+`confirmacao`+`lista_espera`; "Notificações de sinal Pix e recibos" = `pix_recibo`; "Mensagens manuais / Chat" = `manual_painel`+`manual_celular`+`bot`.
- **Limite recomendado:** 250/dia (constante); "% utilizado" e "N envios disponíveis hoje" derivam dele.
- **Saúde:** falhas de hoje ÷ envios de hoje: `< 2%` Excelente, `< 8%` Boa, senão Atenção; sem envios hoje → Excelente.
- **Tempo conectado:** desde `businesses.whatsapp_connected_at` (coluna nova, ver Modelo de dados). "Sem interrupções" aparece quando a conexão está aberta há 24 h ou mais; com menos de 24 h mostra "Reconectado há X h". Coluna nula (instância conectada antes do deploy) → mostra "Conectado" sem a contagem de dias até o próximo evento de conexão.
- **Histórico recente:** últimos 20 `out` (exceto `sistema` de painel) com horário, nome da cliente ou "Sem cadastro", telefone mascarado `+55 83 99611-****`, tipo legível por origem, situação.

## Telas (fiéis ao Stitch)

### Abas do módulo WhatsApp
Barra: **Automações · Conversas · Conexão** (ordem do Stitch, sem Hora de voltar/Campanhas até o 2C-2). Automações renderiza os painéis atuais (Menu, Mensagens, Simulador) como sub-seções, sem mudar o comportamento além do campo novo "Política de cancelamento e sinal" em Mensagens. Aba padrão: Conversas se conectado, Conexão se desconectado. Aba na URL (`?aba=`), como na Agenda.

### Conexão (ff12c8)
Cabeçalho com título, descrição, "Sincronizado há X" e "Atualizar status"; cartão de status (nome do negócio, Conectado/Desconectado, "Conectado por QR code • número • conectado há N dias") com Testar envio, Reconectar (novo QR code), Desconectar; quatro cartões (Número conectado, Tipo de integração "WhatsApp Web / QR Code", Tempo conectado, Status da conexão); Saúde e limite (nota, envios de hoje/250, barra, disponíveis, detalhamento em 3 grupos); Boas práticas (5 itens do Stitch, item 4 com "SAIR"); tabela Histórico recente; modal do QR code com o visual do Stitch. Desconectado: cartões mostram estado vazio e o botão principal vira "Conectar WhatsApp". `ConnectionPanel.tsx` deixa de usar `conteudoDemo.whatsapp` (remover a chave `whatsapp` de `conteudoDemo.ts` e ajustar o teste).

### Conversas (4ea360)
Três colunas no desktop:
1. **Fila:** título "Conversas do WhatsApp", "N abertas", "Instância: número"; filtros com contadores (Todas, Aguardando você, Pelo Bot, Finalizadas); "Marcar lidas"; itens com avatar/iniciais, nome (ou telefone formatado), selo Humano/Bot/Aguardando, telefone, hora (hoje: HH:MM; senão "Ontem"/data), contador de não lidas, prévia, "Atendente: X" quando humano e selo do agendamento ("Sinal pendente") quando houver. Atualização a cada 15 s enquanto a aba está visível (pausa em segundo plano).
2. **Conversa:** cabeçalho (nome, telefone, "Em atendimento humano (Nome)" ou "Com o robô", Assumir/Devolver ao Bot, Ver ficha CRM → `/clientes/<id>`; sem cadastro → "Cadastrar cliente", abrindo o modal de cliente existente com o telefone preenchido); separadores de dia ("Hoje • 16 de Outubro"); balões: cliente à esquerda, saída à direita com rótulo do autor ("Bot EasyAgenda+" / "Nome (Negócio)") e "• Automático" para origens automáticas; mensagens `sistema` como linha central ("Carla assumiu o atendimento"); ícone de situação nos balões de saída (enviada/entregue/lida/falhou). Rodapé: respostas rápidas (Chave Pix, Como chegar, Horários livres, Política — desabilitadas com dica quando sem dado) que inserem o texto no campo; campo de texto (Enter envia, Shift+Enter quebra linha) e botão enviar. Carregar mais antigas ao rolar ao topo.
3. **Contexto da cliente:** selo da fase (CRM), nome, "Cadastrada há N meses", LTV acumulado, ciclo médio; Agendamento relacionado (próximo agendamento futuro ou em aberto): selo de status, data/hora, serviço, valor, profissional, sinal; se `status = aguardando_pagamento` → texto "O bot aguarda a confirmação deste sinal Pix de R$ X para travar a vaga na agenda de {profissional}." e botão "Confirmar agendamento" (mesmo fluxo do "Confirmar Pix" da aba Aguardando Pix da Agenda: `PUT /appointments/:id/status { status: 'confirmado' }`, que já exige reserva não expirada para `aguardando_pagamento` → `confirmado`); Histórico recente (2 últimas visitas com data, serviço, valor e "Pago"). Sem cadastro: bloco com "Cadastrar cliente".

**Estados:** sem conversas ("Nenhuma conversa ainda. As mensagens das clientes aparecem aqui."), filtro vazio, erro com "Tentar de novo", WhatsApp desconectado (faixa com link para Conexão; envio desabilitado), sem permissão de envio (campo desabilitado com motivo).

**Celular:** fila em tela cheia; tocar abre a conversa em tela cheia com voltar; contexto da cliente num painel recolhível abaixo do cabeçalho.

### Respostas rápidas (texto gerado no servidor)
- **Chave Pix:** "Segue a chave Pix do {negócio}:\nChave {tipo}: {chave}\n{nome do recebedor, se houver}". Indisponível sem `pix_key`.
- **Como chegar:** "{endereço}\nNo mapa: https://www.google.com/maps/search/?api=1&query={endereço codificado}". Indisponível sem endereço.
- **Horários livres:** até 3 próximas vagas a partir de agora (mesmo cálculo de vagas da Hoje do 2B, qualquer profissional), formato "Qua 14:30 com Camila". Indisponível sem vagas nos próximos 7 dias.
- **Política:** o texto de `business_settings.whatsapp_politica`. Indisponível se vazio (dica: "Cadastre o texto em Automações › Mensagens").

## Desvios do Stitch (sem dado real)
- Coluna "Latência" do histórico: removida.
- "Solicitar aumento de limite de disparos": vira nota "O limite recomendado protege seu número contra bloqueio do WhatsApp."
- Nota "Excelente": calculada pela taxa de falha (acima).
- "LTV", "Ciclo médio", "Cliente Fiel": vêm do CRM do 2B (fase em vez de "Cliente Fiel" fixo).

## Erros e bordas
- Webhook repetido: único (`business_id`, `provider_message_id`) evita duplicata (upsert/ignorar conflito).
- Mídia: grava marcador `[Foto]`, `[Áudio]`, `[Vídeo]`, `[Documento]`, `[Figurinha]` + legenda se houver; o painel mostra "Abra no celular para ver".
- Mensagem sem texto e sem mídia reconhecida: não grava.
- Número fora da regra B: nada é gravado; robô segue como hoje.
- Falha ao gravar: envio/robô seguem; `logger.warn`.
- Cliente cadastrada depois: a conversa existente passa a ter `client_id` na próxima mensagem (ou no `GET` da conversa, por busca de telefone).
- Telefones: normalizados para dígitos com DDI 55 (reaproveitar o normalizador existente do WhatsApp/CRM).
- Duas abas respondendo: o envio manual não tem trava além do `handler`; aceitável.

## Testes
**Backend (vitest):** gravação de entrada/saída e deduplicação; eco `fromMe` (do sistema × do celular); regra B (cadastrada, conversa existente, robô, descartado); SAIR/VOLTAR (sinônimos, acentos, consentimento, resposta, robô não processa); opt-out bloqueia automáticos e não bloqueia manual/recibo; atendimento humano silencia o robô; assumir/devolver/permissões de `employee`; volta automática de 12 h; `MESSAGES_UPDATE` sem regressão de status; resumo da conexão (grupos, saúde, fuso); respostas rápidas disponíveis/indisponíveis; limpeza de 180 dias sem apagar opt-out; isolamento entre negócios; 404 com id inválido; 409 desconectado.

**Frontend (vitest + Testing Library):** abas e `?aba=`; fila com filtros, contadores, não lidas e polling pausando; conversa com balões, separadores, sistema, situação; envio (Enter/Shift+Enter, erro, desconectado); respostas rápidas (inserir, desabilitada); assumir/devolver; contexto com e sem cadastro e "Confirmar agendamento"; Conexão conectada/desconectada, saúde e histórico; celular (fila → conversa → voltar).

## Fora do 2C-1
- Hora de voltar, Automações (visual e 7 regras), Campanhas, fila cadenciada → 2C-2.
- Envio de mídia pelo painel, busca dentro das conversas, notificações push de nova mensagem.
- Conversas de números fora da regra B.
