# Documentação da API

Atualizado em 27/10/2026. A fonte de verdade são os arquivos `*.routes.ts` em `backend/src/modules/` e `backend/src/routes/`, montados em `backend/src/server.ts`.

Base URL canônica:

- `http://localhost:5000/api/v1`

Compatibilidade:

- Rotas `/api/*` sem `/v1` são redirecionadas para `/api/v1/*` com HTTP 301.
- No frontend, as chamadas passam pelo BFF do Next.js (`frontend/src/app/api/*`), que repassa os cookies para o backend.

## Autenticação

- Cadastro, confirmação de e-mail e login usam o Supabase Auth. O login com Google também passa pelo Supabase (`/auth/oauth/*`).
- A sessão da API usa os cookies httpOnly `access_token` e `refresh_token`, criados pelo backend.
- `Authorization: Bearer <token>` é aceito para compatibilidade nos endpoints protegidos.
- `AUTH_PROVIDER_MODE` é obsoleto.

Papéis (`users.role`): `platform_admin`, `tenant_admin` (dona), `employee` (recepção), `professional` (app da profissional). Os papéis legados `admin` e `barber` são lidos como `tenant_admin` e `employee`.

## Formato de resposta

Sucesso:

```json
{ "success": true, "data": {} }
```

Com paginação:

```json
{ "success": true, "data": [], "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }
```

Erro:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos", "details": [] } }
```

## Status HTTP

| Status | Quando |
|---|---|
| `200` / `201` | Sucesso / criado |
| `400` | Entrada inválida (inclui regra de negócio violada, como público vazio de campanha) |
| `401` | Sem sessão |
| `402` | O plano ou o status da assinatura não libera o recurso |
| `403` | Papel sem permissão |
| `404` | Não encontrado |
| `409` | Conflito (horário ocupado, pagamento repetido) |
| `429` | Limite de requisições |
| `500` | Erro interno |

## Como ler as tabelas

- **Recurso** é a permissão de plano exigida (`requireFeature`), conforme `PLANOS.md`.
- **Papel** é o papel exigido além da sessão. Sem indicação, vale qualquer papel do negócio.
- "Público" significa sem sessão.

## Status e saúde

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` (fora de `/api/v1`) | Status simples da API |
| GET | `/health` (fora de `/api/v1`) | API e conexão com o banco |

## Auth (`/auth`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/register` | Público | Inicia o cadastro (Supabase Auth) |
| POST | `/login` | Público | Login por senha e criação dos cookies |
| GET | `/verify-email` | Público | Compatibilidade da confirmação |
| POST | `/verify-email-session` | Público | Valida a sessão de confirmação |
| POST | `/confirm` | Público | Confirma o cadastro e cria negócio e usuário |
| POST | `/resend-verification` | Público | Reenvia a confirmação |
| POST | `/oauth/sessao` | Token do Supabase | Login com Google: abre a sessão ou responde `{ completarCadastro: true, email, nome }` |
| POST | `/oauth/completar` | Token do Supabase | Cria negócio e usuário de quem veio pelo Google |
| POST | `/refresh` | Cookie | Renova o access token |
| POST | `/logout` | Cookie | Encerra a sessão |
| GET | `/me` | Sessão | Usuário, negócio, plano, onboarding pendente e vocabulário do segmento |

Limites: login 20 por 15 min, cadastro 50 por 15 min, reenvio 10 por 15 min.

## Onboarding (`/onboarding`), papel `tenant_admin`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Estado do onboarding (etapa atual e dados salvos) |
| GET | `/catalogo` | Serviços sugeridos do segmento |
| PUT | `/negocio` | Etapa 1: segmento e "sozinha ou com equipe" |
| PUT | `/horarios` | Etapa 2: dias, horários, intervalo e pausa |
| PUT | `/servicos` | Etapa 3: serviços (e chave Pix quando há sinal) |
| POST | `/concluir` | Conclui o onboarding |
| GET | `/primeiros-passos` | Itens do cartão "Termine de configurar" |
| POST | `/primeiros-passos/dispensar` | Dispensa o cartão |

## Hoje (`/dashboard`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Métricas gerais (legado) |
| GET | `/today` | Tela Hoje: faturamento, ocupação, pendências e próximas vagas |

## Agenda (`/appointments`), recurso `appointments`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Agendamentos do período |
| GET | `/pending-payment` | Reservas públicas aguardando o sinal Pix |
| GET | `/available-slots` | Horários livres (considera almoço, reservas e Google Agenda) |
| GET | `/:id/details` | Painel de detalhes (cliente, sinal, clube, histórico) |
| POST | `/` | Cria agendamento |
| PUT | `/:id` | Edita |
| PUT | `/:id/status` | Muda o status (transições validadas; `concluido` só pela comanda) |
| DELETE | `/:id` | Exclui |
| POST | `/:id/comanda` | Abre a comanda do atendimento |

## Comanda (`/comandas`), recurso `finance`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/settings` | Comissão padrão do negócio |
| PUT | `/settings` | Salva a comissão padrão |
| GET | `/shortcuts` | Atalhos de produtos e serviços |
| GET | `/:id` | Comanda com itens, cobertura do clube e totais |
| PUT | `/:id` | Salva itens, desconto, gorjeta e uso do clube |
| POST | `/:id/close` | Fecha: grava comissões, conclui o atendimento e lança no caixa (idempotente) |
| POST | `/:id/receipt` | Reenvia o comprovante no WhatsApp |

## Produtos (`/products`), recurso `services`

`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`: catálogo simples, sem estoque.

## Caixa (`/cash`), recurso `finance`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/today` | Caixa do dia com entradas por forma de pagamento |
| POST | `/open` | Abre com saldo inicial |
| POST | `/movements` | Sangria, suprimento ou despesa |
| POST | `/close` | Fecha com o valor contado |
| POST | `/reopen` | Reabre |

## Financeiro (`/finance`)

| Método | Rota | Recurso |
|---|---|---|
| GET | `/summary` | `finance` |
| GET | `/monthly` | `reports` |
| GET | `/expenses` | `finance` |
| POST | `/expenses` | `finance` |
| PUT | `/expenses/:id` | `finance` |
| DELETE | `/expenses/:id` | `finance` |

## Clientes e CRM (`/clients`), recurso `clients`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista |
| POST | `/` | Cria |
| PUT | `/:id` | Edita |
| GET | `/:id/history` | Histórico de agendamentos |
| GET | `/insights` | Métricas da lista (retenção, ativas, fases) |
| GET | `/phases` | Visão por fases |
| GET | `/export.csv` | Exportação em CSV |
| GET | `/:id/profile` | Ficha: ciclo, retorno previsto, LTV, etiquetas e contrato do clube |
| GET | `/:id/timeline` | Linha do tempo |
| PUT | `/:id/technical-sheet` | Ficha técnica |
| POST | `/:id/consent` | Registra o consentimento de WhatsApp (LGPD) |
| PUT | `/:id/tags` | Etiquetas manuais da cliente |
| GET | `/:id/photos` | Fotos (links assinados) |
| POST | `/:id/photos` | Envia foto (bucket privado) |
| DELETE | `/:id/photos/:photoId` | Apaga foto |

## Etiquetas (`/tags`), recurso `clients`

`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`.

## Lista de espera (`/waitlist`), recurso `appointments`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista |
| POST | `/` | Inscreve |
| PUT | `/:id` | Edita |
| POST | `/:id/offer` | Oferece a vaga pelo WhatsApp |
| POST | `/:id/booked` | Marca como agendada |

## Relatórios e comissões (`/reports`), recurso `reports`, papel `tenant_admin`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/overview` | Indicadores do topo com comparação |
| GET | `/occupancy` | Mapa de ocupação por turno |
| GET | `/evolution` | Evolução de 6 meses e origem dos agendamentos |
| GET | `/avaliacoes` | Avaliações das clientes |
| GET | `/commissions` | Apuração por profissional no período |
| GET | `/commissions/export.csv` | Exportação para o contador |
| POST | `/commissions/payouts` | Marca como pago (idempotente) |
| DELETE | `/commissions/payouts/:id` | Desfaz o pagamento |
| GET | `/advances` | Adiantamentos |
| POST | `/advances` | Lança adiantamento |
| DELETE | `/advances/:id` | Remove adiantamento |
| PUT | `/settings/payout-model` | Comissão tradicional ou salão-parceiro (este exige `salao_parceiro`) |

## Clube e pacotes (`/clube`), recurso `clube`, papel `tenant_admin`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/ofertas` | Ofertas |
| POST | `/ofertas` | Cria oferta |
| PUT | `/ofertas/:id` | Edita, pausa ou arquiva |
| GET | `/contratos` | Assinantes e pacotes ativos |
| GET | `/contratos/export.csv` | Exportação em CSV |
| POST | `/contratos` | Venda no balcão |
| POST | `/contratos/:id/cancelar` | Cancela |
| POST | `/cobrancas/:id/confirmar` | Confirma o Pix (idempotente) |
| POST | `/cobrancas/:id/reenviar` | Reenvia a cobrança no WhatsApp |
| GET | `/clientes/:clientId` | Contratos de uma cliente |

## Negócio e Ajustes (`/business`)

| Método | Rota | Recurso ou papel |
|---|---|---|
| GET / POST | `/services` | `services` |
| PUT / DELETE | `/services/:id` | `services` |
| GET / POST | `/professionals` | `services` (respeita o limite do plano) |
| PUT / DELETE | `/professionals/:id` | `services` |
| GET / PUT | `/settings` | `advanced_admin` |
| GET / PUT | `/crm-settings` | Segmento, ciclo de retorno e etiquetas |
| GET / PUT | `/profile` | `billing` |
| GET / PUT | `/account-profile` | `tenant_admin` |
| PUT | `/account-password` | `tenant_admin` |

Exemplo de `PUT /business/settings`:

```json
{
  "diasAbertos": ["seg", "ter", "qua", "qui", "sex"],
  "openingTime": "09:00",
  "closingTime": "20:00",
  "slotIntervalMinutes": 30,
  "allowWalkins": true,
  "autoConfirmAppointments": false
}
```

`slotIntervalMinutes` aceita `0`, `15`, `20`, `30`, `45`, `60`, `90` e `120`; `0` gera horários contínuos pela duração do serviço.

## Minha página (`/business-public-page`), sessão

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Configuração da página |
| GET | `/slug-availability` | Checa se o endereço está livre |
| PUT | `/` | Salva slug, logo, cor, galeria, endereço e chave Pix |
| POST | `/upload-image` | Envia logo ou foto da galeria |

## Página pública (`/public`), público

| Método | Rota | Descrição |
|---|---|---|
| GET | `/:slug` | Vitrine: negócio, serviços, galeria e vocabulário |
| GET | `/:slug/professionals` | Profissionais do serviço |
| GET | `/:slug/availability` | Horários livres |
| POST | `/:slug/appointments` | Reserva com sinal Pix (15 min para pagar) |
| GET | `/:slug/clube` | Clubes públicos |
| GET | `/:slug/clube/:ofertaId` | Detalhe do clube |
| POST | `/:slug/clube/:ofertaId/adesao` | Adesão: gera o Pix da primeira mensalidade |

## Avaliação da cliente (`/avaliacoes`), público

| Método | Rota | Descrição |
|---|---|---|
| GET | `/:token` | Dados da avaliação (link do comprovante) |
| POST | `/:token` | Envia nota de 1 a 5 e comentário |

## Equipe e convites

`/equipe`, recurso `app_profissional`, papel `tenant_admin`:

| Método | Rota | Descrição |
|---|---|---|
| GET | `/acessos` | Situação do acesso de cada profissional |
| GET / PUT | `/configuracao` | Chave "A profissional cobra no app" |
| POST | `/profissionais/:id/convite` | Convida ou reenvia o convite por e-mail |
| DELETE | `/profissionais/:id/convite` | Revoga o convite |
| POST | `/profissionais/:id/acesso/remover` | Remove o acesso |
| POST | `/profissionais/:id/acesso/reativar` | Reativa o acesso |

`/convites`, público (com limite de requisições):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/:token` | Dados do convite |
| POST | `/:token/aceitar` | Cria a senha e liga o login à profissional |

## App da profissional (`/bancada`), papel `professional`

Todas as rotas filtram pela profissional do login e exigem o recurso `app_profissional` do negócio.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/hoje` | Agenda do dia e próxima cliente |
| GET | `/clientes` | Clientes dela |
| GET | `/clientes/:id` | Ficha rápida |
| PUT | `/clientes/:id/nota` | Anotação |
| POST | `/clientes/:id/fotos` | Foto do trabalho |
| POST | `/agendamentos/:id/iniciar` | Inicia o atendimento |
| GET | `/horarios` | Horários livres para reagendar |
| POST | `/agendamentos/:id/reagendar` | Reagenda (avisa a dona e, se marcado, a cliente) |
| POST | `/agendamentos/:id/cancelar` | Cancela |
| GET | `/atalhos` | Atalhos de produtos |
| GET / PUT | `/comandas/:id` | Comanda do atendimento |
| POST | `/comandas/:id/enviar` | Envia para a recepção |
| POST | `/comandas/:id/fechar` | Fecha (só com "A profissional cobra no app") |
| GET | `/numeros` | Meus números do período |
| GET | `/avaliacoes` | Avaliações dela |

## Google Agenda (`/google-agenda`)

| Método | Rota | Papel | Descrição |
|---|---|---|---|
| GET | `/conexao` | Dona, recepção ou profissional | Situação da conexão |
| GET | `/conectar` | Dona ou profissional | URL de autorização do Google |
| POST | `/confirmar` | Dona ou profissional | Conclui a conexão no navegador logado |
| GET | `/ocupado` | Dona ou recepção | Faixas "Ocupado (Google)" para a agenda |
| PUT | `/conexao` | Dona ou profissional | Ajustes da conexão |
| DELETE | `/conexao` | Dona ou profissional | Desconecta |
| GET | `/callback` | Público | Retorno do OAuth do Google (`GOOGLE_AGENDA_REDIRECT_URI`) |

## Notificações (`/notifications`) e push (`/push`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/notifications` | Lista do sino |
| GET | `/notifications/unread-count` | Contador |
| PUT | `/notifications/read-all` | Marca todas como lidas |
| PUT | `/notifications/:id/read` | Marca uma como lida |
| GET | `/push/chave` | Chave pública VAPID |
| POST | `/push/inscricoes` | Inscreve o navegador |
| DELETE | `/push/inscricoes` | Cancela a inscrição |

## WhatsApp (`/whatsapp`), recurso `whatsapp_automation`

Detalhes de funcionamento em `WHATSAPP_BOT.md`.

Webhook (público):

| Método | Rota | Descrição |
|---|---|---|
| POST | `/webhook` | Webhook da Evolution |
| POST | `/webhook/:event` | Webhook por evento (`webhook_by_events=true`) |

Conexão e robô:

| Método | Rota |
|---|---|
| GET | `/status`, `/qrcode`, `/qr`, `/config`, `/config/menu`, `/config/textos`, `/config/instagram` |
| POST | `/connect`, `/initialize`, `/disconnect`, `/logout`, `/restart` |
| POST | `/send`, `/test-send`, `/debug-send`, `/simulator/message`, `/simulator/reset` |
| PUT | `/config`, `/config/menu/:id`, `/config/menu-reorder`, `/config/textos`, `/config/instagram` |
| POST | `/config/reset`, `/config/menu`, `/config/menu/reset` |
| DELETE | `/config/menu/:id` |

Notas do robô: `GET /config/menu` devolve `numero` e `motivoOculta` em cada opção. `PUT /config/menu-reorder` responde 409 `MENU_DESATUALIZADO` se a lista estiver desatualizada. `GET/PUT /config/textos` usa `{ textos: Record<string, string|null> }` e `null` restaura o padrão. `PUT /config/instagram` grava o perfil usado na opção do menu. `POST /simulator/message` não grava nada. `PATCH /whatsapp/automacoes/:regra` aceita `textoConfirmado`, `textoCancelado`, `textoNota` e `textoGoogle` em `config`. `POST /config/reset` não é usada pela tela.

Central de conversas:

| Método | Rota | Descrição |
|---|---|---|
| GET | `/conversations` | Lista |
| POST | `/conversations/lidas` | Marca como lidas |
| GET | `/conversations/:id` | Conversa |
| GET | `/conversations/:id/messages` | Mensagens |
| POST | `/conversations/:id/messages` | Responde pelo painel |
| GET | `/conversations/:id/respostas-rapidas` | Respostas rápidas |
| POST | `/conversations/:id/assumir` | Assume o atendimento |
| POST | `/conversations/:id/devolver` | Devolve ao robô |
| GET | `/connection/summary` | Saúde da conexão e histórico de envios |

Hora de voltar (`/whatsapp/retorno`):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Oportunidades com encaixes sugeridos |
| POST | `/enviar` | Enfileira convites (um ou em lote) |
| POST | `/testar` | Envia o teste para o número do negócio |

Automações (`/whatsapp/automacoes`):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | As 7 regras |
| GET | `/painel` | Resultados do mês |
| GET | `/historico` | Histórico de disparos |
| PATCH | `/:regra` | Liga, desliga e edita texto e configuração |
| POST | `/:regra/testar` | Envia o teste |

Campanhas (`/whatsapp/campanhas`):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista |
| GET | `/opcoes` | Profissionais e serviços para os filtros |
| POST | `/publico` | Prévia do público |
| POST | `/` | Cria (rascunho ou agendada) |
| GET | `/:id` | Detalhes com os itens da fila |
| PUT | `/:id` | Edita o rascunho ou agenda |
| POST | `/:id/cancelar` | Cancela |

## Assinatura do sistema

`/billing`:

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/plans` | Público | Catálogo dos planos e matriz de recursos |
| POST | `/validate-coupon` | Sessão | Valida cupom |
| POST | `/checkout/session` | Sessão | Checkout (cartão no Stripe ou Pix no Asaas) |
| GET | `/status` | Sessão | Situação da assinatura |
| POST | `/cancel` | Sessão | Cancela (acesso até o fim do período) |
| POST | `/reactivate` | Sessão | Reativa |
| GET | `/pix/:paymentId` | Sessão | Consulta o Pix |
| GET | `/invoices` | Sessão | Faturas reais (Pix do banco e cartão do Stripe) |
| GET | `/payment-method` | Sessão | Forma de pagamento |
| POST | `/change-plan/preview` | Sessão | Prévia da troca com o proporcional |
| POST | `/change-plan` | Sessão | Upgrade na hora ou downgrade na renovação |
| DELETE | `/change-plan` | Sessão | Cancela o downgrade agendado |
| POST | `/webhooks/stripe` e `/webhook/stripe` | Assinatura do Stripe | Webhook Stripe |
| POST | `/webhooks/asaas` e `/webhook/asaas` | Token do Asaas | Webhook Asaas |

`/subscriptions` (legado do Stripe): `POST /checkout-session`, `GET /status`, `POST /portal`.

## SuperAdmin (`/admin`), papel `platform_admin`

| Método | Rota |
|---|---|
| GET | `/metrics`, `/tenants`, `/tenants/:id`, `/subscriptions`, `/logs`, `/coupons` |
| PATCH | `/tenants/:id/block`, `/tenants/:id/unblock`, `/users/:id/block`, `/users/:id/unblock` |
| DELETE | `/tenants/:id`, `/coupons/:id` |
| POST | `/subscriptions/:id/resync`, `/subscriptions/:id/cancel`, `/coupons` |
| PATCH | `/subscriptions/:id/plan`, `/subscriptions/:id/status`, `/coupons/:id` |

## Autorização por plano

O backend aplica as permissões de `PLANOS.md` (`requireFeature`) e devolve `402` quando o plano ou o status da assinatura não libera o recurso. O frontend esconde ações, mas quem decide é o backend.
