# WhatsApp

Guia técnico do WhatsApp: conexão, robô, central de conversas, fila de envios, Hora de voltar, automações e campanhas. Atualizado em 27/10/2026.

O que a dona vê em cada aba está em `docs/FUNCIONALIDADES.md` › WhatsApp. As decisões de produto estão nas specs `2026-10-16-whatsapp-conversas`, `2026-10-20-hora-de-voltar` e `2026-10-21-automacoes-campanhas` em `docs/superpowers/specs/`.

## Arquitetura

```text
Frontend → BFF (Next.js) → Backend EasyAgenda+ → Evolution API v2 → WhatsApp
                                  ↑
                    Webhook da Evolution (mensagens e conexão)
```

- A Evolution API roda como serviço externo. Cada negócio tem a própria instância (`businesses.whatsapp_instance_name`, única).
- O WhatsApp está no plano Solo em diante (recurso `whatsapp_automation`).

| Parte | Onde |
|---|---|
| Conexão, webhook e robô | `backend/src/modules/whatsapp/`, `backend/src/services/whatsapp/`, `backend/src/bot/` |
| Central de conversas | `backend/src/modules/whatsappInbox/` |
| Fila de envios | `backend/src/modules/whatsappFila/` |
| Fotos de perfil | `backend/src/modules/whatsappAvatar/` |
| Hora de voltar | `backend/src/modules/whatsappRetorno/` |
| Automações | `backend/src/modules/whatsappAutomacoes/` |
| Campanhas | `backend/src/modules/whatsappCampanhas/` |

## Variáveis

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua_chave
BACKEND_WEBHOOK_BASE_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_API_TIMEOUT_MS=10000
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
WHATSAPP_SESSION_TIMEOUT_MS=1800000
BUSINESS_TIMEZONE=America/Sao_Paulo
```

- `BACKEND_WEBHOOK_BASE_URL` é a URL **do backend**, nunca a do frontend, e sem barra final. É só a base: com `webhook_by_events=true` a Evolution acrescenta `/{evento}`. `EVOLUTION_WEBHOOK_URL` é o nome antigo, usado se o novo estiver vazio.
- `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_INSTANCE_BUSINESS_MAP` e `WHATSAPP_DEFAULT_BUSINESS_ID` são legados, só para desenvolvimento e teste. Em produção, deixe vazias.
- `FRONTEND_URL` é usada nos links das mensagens (página pública, avaliação). Sem ela, a linha do link some.

## Webhook

- `POST /api/v1/whatsapp/webhook`
- `POST /api/v1/whatsapp/webhook/:event`

Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE` (status de entrega e leitura), `CONNECTION_UPDATE` e `QRCODE_UPDATED`. Deixe `MESSAGES_SET` desligado, porque o payload é pesado e o backend bloqueia. Handlers em `backend/src/services/whatsapp/handlers/`.

## Conexão (aba Conexão)

1. A dona abre WhatsApp › Conexão (ou a etapa 5 do onboarding).
2. O backend cria ou reaproveita a instância e registra o webhook.
3. O painel mostra o QR (`/whatsapp/qrcode`) e acompanha o `/whatsapp/status`.
4. O `connection-update` com `open` grava `businesses.whatsapp_connected_at`. O `close` ou o logout zeram o campo.

A aba também mostra a saúde da conexão, os limites e o histórico de envios (`/whatsapp/connection/summary`).

## Robô de agendamento

- Menu por segmento (`menuPadrao(segmento)`, fonte única): até 6 opções, com "Remarcar ou cancelar". A numeração segue a lista visível; o menu não personalizado migra sozinho e o personalizado é mantido. A avaliação não é opção do menu: só existe em Automações (nota de 1 a 5, nunca sobrescrita).
- Rotas do menu (`/whatsapp/config` e `/whatsapp/config/menu`): `GET /config/menu` devolve `numero` e `motivoOculta` (por exemplo promoção sem texto); reordenar com lista desatualizada devolve 409 `MENU_DESATUALIZADO`; o reset usa o segmento atual.
- **Textos editáveis:** `GET/PUT /whatsapp/config/textos` (`{ textos: Record<string, string|null> }`). `null` restaura o padrão e o texto igual ao padrão é gravado como `null`. Ficam em `whatsapp_bot_config.textos_extras` (JSONB); o catálogo está em `services/whatsapp/whatsappTextos.ts`. Todo texto que a cliente lê no fluxo é editável, e o padrão é neutro e usa o vocabulário do segmento (`services/whatsapp/whatsappVocabulario.ts`).
- **Migração `20261109120000_robo_textos`** (cria `textos_extras`): aplicada em produção em 07/11/2026, com autorização do dono, antes do merge, pelo pooler de sessão. Sem a coluna, `lerBotConfig` cai em silêncio nos textos padrão (o negócio com textos salvos os perde no robô e as promoções somem do menu) e `GET/PUT /whatsapp/config/textos` retornam 500.
- Variáveis: `{nome_negocio}` (inclusive em promoções e Instagram), `{horario_atendimento}` e `{hora_fechamento}` (via `formatMessage`).
- Promoções só aparecem com texto cadastrado (sem padrão inventado). O perfil do Instagram fica em `GET/PUT /whatsapp/config/instagram`.
- Remarcar move o agendamento existente: mantém o sinal e zera lembrete e confirmação. O cancelamento confere o negócio e a situação.
- Agenda com os mesmos horários do painel: dias abertos, abertura e fechamento, intervalo, almoço da profissional, reservas pendentes e compromissos do Google Agenda.
- Agendamentos criados pelo robô gravam `source = 'whatsapp'`.
- Respostas das Automações editáveis (confirmação, cancelamento, nota e convite ao Google com `{link}`): campos `textoConfirmado`, `textoCancelado`, `textoNota` e `textoGoogle` em `WhatsappAutomacao.config`.
- Resposta rápida "Política" editável (política de cancelamento e sinal).
- **Tela (aba Robô):** Menu e mensagens + Mensagens gerais, com o simulador ao lado no computador e o botão "Testar" no celular.
- **Simulador:** `POST /whatsapp/simulator/message` testa o fluxo sem gravar nada, mostra todas as respostas e avisa "Teste: nada foi agendado". `POST /whatsapp/simulator/reset` zera a conversa de teste.
- `POST /whatsapp/config/reset` segue no backend, sem uso na tela.

## Ponto único de envio

Toda mensagem sai por `sendWhatsAppMessage(phone, message, context)`, com `businessId` e `origin`. Assim tudo fica gravado na central. Origens: `cliente` (entrada), `bot`, `lembrete`, `confirmacao`, `sinal_pix`, `pix_recibo`, `lista_espera`, `retorno`, `aniversario`, `avaliacao`, `campanha`, `clube`, `painel_evento`, `manual_painel`, `manual_celular` e `sistema`.

## Central de conversas (aba Conversas)

- Tabelas `whatsapp_conversations`, `whatsapp_messages` e `whatsapp_opt_outs`.
- Grava só as conversas de clientes cadastradas e de números que falaram com o robô. As outras conversas do número ficam só no celular.
- A dona responde pelo painel, assume o atendimento (o robô para) e devolve ao robô.
- Respostas rápidas, contagem de não lidas e fotos de perfil (atualizadas pela rotina de cada minuto).
- A conversa em atendimento humano volta ao robô depois de **12 h** sem atividade. A rotina roda a cada 15 min.
- As mensagens ficam guardadas por **180 dias**. A limpeza roda diariamente às 03:30.

## Opt-out

- **SAIR** (e também PARAR, CANCELAR, STOP, DESCADASTRAR, como texto inteiro da mensagem) coloca o número em opt-out. **VOLTAR** reativa.
- Na cliente cadastrada, isso também grava o consentimento (`client_consents`, canal `whatsapp`).
- Mensagens automáticas e de marketing pulam quem está em opt-out ou revogou o consentimento.

## Fila de envios (`whatsapp_envios`)

Tudo que é em massa ou automático passa por uma fila no banco, processada a cada minuto, para não arriscar o número com disparos em rajada.

| Regra | Valor |
|---|---|
| Janela de envio | 08:00 às 20:00 no fuso do negócio |
| Limite padrão | 25 por hora por negócio |
| Intervalo entre envios | 45 a 90 s |
| Prioridade | 1 (confirmação, lembrete), 5 (retorno), 9 (campanha) |
| Campanha | Cadência de 10, 25 ou 60 por hora. O intervalo depois de um item de campanha é 3600/cadência × (0,75 a 1,25), nunca abaixo de 45 s |

- Na hora de enviar, a fila confere o opt-out, o consentimento e se o agendamento ou a campanha ainda valem. Se não conseguir ler o opt-out, o item volta para a fila.
- Um item interrompido no meio vira `falhou` depois de 10 min e não é reenviado, para não duplicar a mensagem.
- O índice parcial `whatsapp_envios_cliente_ativo_key` permite um item ativo por cliente e origem.

## Hora de voltar (aba Hora de voltar)

- **Quem aparece:** cliente ativa, com última visita há até 120 dias, retorno previsto já vencido e sem agendamento futuro. A lista vem com maior atraso primeiro.
- **Encaixes:** até 2 vagas nos próximos 7 dias com a profissional da última visita, com duração suficiente.
- Envio individual ou em lote pela fila, com a prévia da mensagem e o link da página pública.
- Quem recebeu convite nos últimos 7 dias fica fora do "Selecionar todas" e pede confirmação para reenviar.
- "Testar envio" manda para o WhatsApp cadastrado no negócio.

## Automações (aba Automações)

7 regras (`whatsapp_automacoes`), cada uma com interruptor, texto opcional (sem texto, vale o padrão do segmento) e configuração própria. Contas que já existiam começaram só com o lembrete ligado.

| Regra | Quando dispara | Como sai |
|---|---|---|
| `confirmacao` | Véspera do agendamento, a partir da hora escolhida (08:00 a 12:00). A cliente responde 1 para confirmar ou 2 para cancelar, e o 2 só vale até 24 h depois | Fila, prioridade alta |
| `sinal_pix` | Reserva pública criada com sinal, com tolerância de 15, 30 ou 60 min | Envio direto |
| `retorno` | Todo dia, para as oportunidades da Hora de voltar (pelo ciclo da cliente ou por N dias) | Fila |
| `lista_espera` | Vaga aberta por cancelamento, para quem está aguardando | Fila |
| `lembrete` | 2 horas antes (envio direto) ou na véspera (fila) | Conforme o modo |
| `aniversario` | No dia do aniversário, uma vez por ano | Fila |
| `avaliacao` | Depois do atendimento. A nota vem de 1 a 5 pelo próprio WhatsApp, e o texto pode levar o link do Google do negócio | Fila |

- O resultado do mês (faltas evitadas, sinais recebidos, receita recuperada, vagas preenchidas) vem do banco (`metricas.repository.ts`). Quando é estimativa, o rótulo diz.
- As respostas esperadas (1/2 da confirmação, nota da avaliação) ficam em `whatsapp_respostas_pendentes`.
- O interruptor antigo "Enviar lembretes por WhatsApp" saiu de Ajustes. O `whatsapp_reminders` legado só vale como valor inicial da regra.

## Campanhas (aba Campanhas)

- **Público:** em risco, reativação, aniversariantes, VIPs ou todas, com filtro de profissional e de último serviço. A prévia mostra a contagem real.
- **Mensagem:** variáveis `{primeiro_nome}`, `{profissional}`, `{servico}`, `{horarios_livres}` (até 2 encaixes da semana) e `{link}`. O rodapé fixo é "Responda SAIR para não receber novidades."
- **Programação:** de hoje até 30 dias, das 08:00 às 19:30, com cadência de 10, 25 ou 60 por hora. A tela mostra a previsão de término.
- **Situações:** rascunho, agendada, enviando, concluída (calculada) e cancelada. Cancelar tira da fila os itens pendentes na mesma transação.
- Cada cliente vira um item da fila com origem `campanha` e o id da campanha no lote (`batchId`, coluna `lote_id`). Quem já está na fila de outra campanha fica de fora.

## Lembretes e fuso

Os agendamentos gravam `date`/`time` no relógio local do negócio. O servidor roda em UTC, então as rotinas calculam no fuso do negócio (`BUSINESS_TIMEZONE`, depois `APP_TIMEZONE`, depois `America/Sao_Paulo`).

Em hospedagem que hiberna (como o Render gratuito), mantenha o processo acordado. Senão as rotinas não rodam.

## Outras mensagens que saem pelo WhatsApp

- Comprovante da comanda, com o link de avaliação.
- Cobrança e recibo do sinal Pix da página pública.
- Pix da mensalidade do clube e do pacote vendido como "Pix a receber".
- Aviso de reagendamento ou cancelamento feito pela profissional no app.
- Oferta de vaga da lista de espera.

## Troubleshooting

| Sintoma | O que conferir |
|---|---|
| QR não aparece | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e se a Evolution está no ar |
| Webhook não processa | `BACKEND_WEBHOOK_BASE_URL` aponta para o backend, evento `MESSAGES_UPSERT` ligado, logs do backend |
| 404 em `.../connection-update/connection-update` | Sufixo de evento na URL base: deixe só a base |
| Negócio errado | `businesses.whatsapp_instance_name` |
| 413 no webhook | `MESSAGES_SET` ligado; aumente `WHATSAPP_WEBHOOK_BODY_LIMIT` só se precisar |
| Fila parada | Fora da janela 08:00–20:00, limite por hora atingido, WhatsApp desconectado ou processo hibernando |
| Cliente não recebe | Opt-out (SAIR) ou consentimento revogado |
| Recurso bloqueado (402) | Plano ou status da assinatura (`PLANOS.md`) |
