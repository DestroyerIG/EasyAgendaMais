# Troubleshooting

Guia de diagnóstico para erros comuns em desenvolvimento e operação.

## Diagnóstico Inicial

```bash
curl http://localhost:5000/health
psql -h localhost -p 5432 -U postgres -d easyagenda -c "SELECT 1;"
node -v
npm -v
```

## Backend Não Inicia

Sintomas:

- Processo encerra no boot.
- Log fatal de variável ausente.
- Falha de conexão com banco.

Checklist:

- `DATABASE_URL` existe e conecta.
- `JWT_SECRET` existe.
- PostgreSQL está ativo.
- Se `ASAAS_BASE_URL` está definido, `ASAAS_API_KEY` também precisa estar.

## PostgreSQL

### Conexão recusada

```bash
psql -h localhost -p 5432 -U postgres -d easyagenda -c "SELECT current_database();"
```

Verifique serviço, host, porta, usuário e senha.

### Schema incompleto ou migração pendente

```bash
cd backend
npm run db:migrate:status
```

- Migração pendente: `npm run db:migrate:deploy` (em produção, só com autorização).
- Postgres local reclamando de `auth`, `storage` ou `authenticated`: aplique `backend/prisma/local/supabase-stub.sql` antes das migrações.
- Coluna inexistente logo depois de um deploy: o código subiu antes da migração.

Detalhes em `POSTGRESQL_SETUP.md`.

### Docker

| Sintoma | O que conferir |
|---|---|
| `backend` não sobe e o `migrate` saiu com erro | `docker compose logs migrate`. Se o volume veio de uma versão antiga do compose, recomece com `docker compose down -v` |
| Função ou schema `auth`/`storage` não existe | O stub só roda na primeira subida do volume. Recomece com `docker compose down -v` |
| Login falha no painel | `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no `.env` da raiz, e `docker compose build frontend` depois de mudar as chaves |
| `setup.ps1` para em "psql nao encontrado" | Coloque a pasta `bin` do PostgreSQL no PATH |

## Cadastro, Confirmação e Login

O fluxo atual usa Supabase Auth obrigatoriamente.

Checklist:

- `SUPABASE_URL` correto.
- `SUPABASE_ANON_KEY` correto.
- `SUPABASE_SERVICE_ROLE_KEY` configurado no backend.
- `AUTH_SUPABASE_REDIRECT_TO` igual ao redirect permitido no Supabase.
- Frontend com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_API_URL` termina em `/api/v1`.

`AUTH_PROVIDER_MODE` é obsoleto e não deve ser usado para tentar voltar ao fluxo legado.

## Cookies e CORS

Sintomas:

- Login funciona, mas `/auth/me` retorna 401.
- Frontend não mantém sessão.

Checklist:

- `FRONTEND_URL` igual à origem pública do frontend.
- HTTPS em produção.
- `AUTH_COOKIE_DOMAIN` correto quando usar subdomínios.
- Cliente HTTP enviando credenciais.

## Billing

### Asaas (cartão e Pix)

O Asaas é o único meio de cobrança da assinatura. Verifique:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`
- Endpoint `/api/v1/billing/webhooks/asaas`.
- CPF/CNPJ válido no checkout (a tela de pagamento pede quando falta).
- Tokenização habilitada na conta de produção: sem ela, reativar no cartão, estender o teste com cartão e mudar o valor numa troca de plano falham.

## Recebimentos (Mercado Pago e InfinitePay)

- A seção "Recebimentos" não aparece em Ajustes: faltam `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_REDIRECT_URI` e `RECEBIMENTOS_TOKEN_KEY` no backend.
- Mercado Pago pede "Reconectar": a autorização venceu ou foi revogada. A rotina das 04:00 renova as que vencem em menos de 30 dias.
- InfinitePay conecta mas o pagamento não confirma: confira `BACKEND_URL` (sem barra final) no backend. A rotina de cada minuto confirma por consulta, mas só se o gateway estiver disponível.
- Sinal pago e a reserva não confirmou: a rotina de cada minuto (`conferirPendentes`) cobre o aviso perdido. Se persistir, confira o alerta no sino (pagamento fora do prazo, em dobro ou devolvido).
- Cobrança do saldo na comanda não fecha: com a cobrança pendente a comanda fica travada; cancele a cobrança no painel para voltar a editar. A maquininha Point precisa estar em modo PDV (Recebimentos › Maquininhas).
- Guias: `docs/mercado-pago-configuracao.md` e `docs/infinitepay-configuracao.md`.

## WhatsApp

Guia completo em `WHATSAPP_BOT.md` › Troubleshooting. Checklist rápido:

- `EVOLUTION_API_URL` acessível pelo backend e `EVOLUTION_API_KEY` correta.
- `BACKEND_WEBHOOK_BASE_URL` aponta para o **backend** (`/api/v1/whatsapp/webhook`), sem sufixo de evento.
- Eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `CONNECTION_UPDATE` ligados, e `MESSAGES_SET` desligado.
- `businesses.whatsapp_instance_name` do negócio certo.

## Mensagens automáticas não saem

- O processo do backend precisa estar acordado (hospedagem que hiberna precisa de keep-alive).
- Só uma instância do backend deve rodar as rotinas.
- `BUSINESS_TIMEZONE` correto: o servidor roda em UTC.
- A regra está ligada em WhatsApp › Automações. O interruptor antigo de Ajustes não existe mais.
- A fila só envia das 08:00 às 20:00, até 25 por hora (ou a cadência da campanha), com intervalo de 45 a 90 s.
- A cliente não está em opt-out (SAIR) nem com o consentimento revogado.
- O WhatsApp está conectado. Itens de campanha esperam a reconexão.

## Google Agenda e login com Google

- O botão "Continuar com Google" não aparece: falta `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1` no frontend.
- O cartão do Google Agenda não aparece: faltam `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI` ou `GOOGLE_TOKEN_KEY` no backend.
- `redirect_uri_mismatch`: a URL do callback no Google Cloud precisa ser igual a `GOOGLE_AGENDA_REDIRECT_URI`.
- "Acesso bloqueado" ou expiração em 7 dias: o app está em modo Teste no Google, então só os usuários de teste conectam. Publique e verifique o app (`docs/google-configuracao.md`).
- Login com Google volta para `/login`: confira a redirect URL `https://<site>/auth/callback` no Supabase.
- Conexões pararam depois de trocar a `GOOGLE_TOKEN_KEY`: a chave não pode mudar. Cada pessoa precisa reconectar.

## Notificações push

- O botão "Ativar notificações" não aparece: faltam `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no backend, ou o navegador não suporta push.
- O push só funciona em HTTPS (ou `localhost`).
- No iPhone, o push só funciona com o app instalado na tela inicial.

## App da profissional

- A profissional cai no painel em vez da bancada: o usuário dela precisa ter o papel `professional` e estar ligado ao cadastro (`users.professional_id`). Isso acontece pelo aceite do convite.
- Erro 402 na bancada: o negócio não está no Equipe ou no Salão.
- O convite não chega: confira o SMTP. O link também pode ser copiado na tela da profissional.

## Rate Limit

Limites principais:

- API geral: 300 requisições por 15 minutos.
- Login: 20 tentativas por 15 minutos.
- Cadastro: 50 tentativas por 15 minutos.
- Reenvio de verificação: 10 tentativas por 15 minutos.

## Testes

```bash
cd backend && npm test && npm run typecheck
cd frontend && npm test && npm run build
```

Depois de um `git pull`, o backend pode precisar de `npm install` e `npx prisma generate` antes do `typecheck` e dos testes.
