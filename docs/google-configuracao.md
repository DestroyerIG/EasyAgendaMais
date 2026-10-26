# Configurar o Google (login e Google Agenda)

Passo a passo para ligar a fase 7. Sem esta configuração, o botão "Continuar com Google" e o cartão do Google Agenda simplesmente não aparecem, e nada quebra.

São três lugares: Google Cloud, Supabase e as variáveis do backend e do frontend.

## 1. Google Cloud

1. Entre em https://console.cloud.google.com com a conta Google da empresa e crie um projeto, por exemplo `EasyAgenda+`.
2. **APIs e serviços › Biblioteca:** ative a **Google Calendar API**.
3. **APIs e serviços › Tela de consentimento OAuth** (em alguns painéis, "Google Auth Platform › Branding"):
   - Tipo de usuário: **Externo**.
   - Nome do app: `EasyAgenda+`, e-mail de suporte, logo.
   - Domínios autorizados: o domínio do site (ex.: `easyagenda.com.br`) e o do backend.
   - Links da página inicial, da política de privacidade (`/privacidade`) e dos termos (`/termos`).
   - Escopos ("Acesso a dados"): `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar.app.created` e `https://www.googleapis.com/auth/calendar.freebusy`.
   - **Usuários de teste:** enquanto o app não for verificado, só os e-mails desta lista (até 100) conseguem conectar o Google Agenda. Coloque o seu e o das primeiras clientes.
4. **APIs e serviços › Credenciais › Criar credenciais › ID do cliente OAuth:**
   - Tipo: **Aplicativo da Web**.
   - **URIs de redirecionamento autorizados**, os dois:
     - `https://<projeto>.supabase.co/auth/v1/callback` (o endereço aparece no Supabase, no provedor Google);
     - `https://<backend>/api/v1/google-agenda/callback`.
   - Guarde o **ID do cliente** e a **chave secreta do cliente**.

## 2. Supabase

1. **Authentication › Sign In / Providers › Google:** ative e cole o ID e a chave secreta do cliente.
2. **Authentication › URL Configuration › Redirect URLs:** acrescente `https://<site>/auth/callback` (e `http://localhost:3000/auth/callback` para testar local).

## 3. Variáveis

Backend (Render ou onde o backend roda):

| Variável | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | ID do cliente do passo 1.4 |
| `GOOGLE_CLIENT_SECRET` | Chave secreta do cliente |
| `GOOGLE_AGENDA_REDIRECT_URI` | `https://<backend>/api/v1/google-agenda/callback` (igual ao cadastrado no Google) |
| `GOOGLE_TOKEN_KEY` | Chave de 32 bytes para cifrar o acesso guardado. Gere uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e **não troque depois**: trocar invalida as conexões existentes. |

Frontend (Vercel):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO` | `1` (mostra "Continuar com Google" no login e no cadastro) |

O banco precisa da migração `20261029120000_google_agenda` aplicada **antes** do deploy do backend.

## 4. Verificação do Google

- O **login** (`openid email profile`) não precisa de verificação; basta a marca configurada no passo 1.3.
- Os escopos de **agenda** precisam da verificação do app. Em "Tela de consentimento › Publicar app", o Google pede:
  - a política de privacidade publicada, que já explica os dados do Google (seção 8);
  - um vídeo curto (YouTube não listado) mostrando o login, a tela de consentimento e o uso: conectar em Ajustes, o agendamento aparecendo no Google e o horário bloqueado na página pública;
  - a justificativa de cada escopo, por exemplo: `calendar.app.created` cria a agenda "EasyAgenda+" com os agendamentos; `calendar.freebusy` lê só ocupado/livre para não oferecer horário em que a profissional tem compromisso.
- A análise costuma levar de alguns dias a algumas semanas. Até a aprovação, só os usuários de teste conectam a agenda.
