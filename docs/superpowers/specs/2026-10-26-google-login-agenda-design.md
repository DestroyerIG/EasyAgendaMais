# Login com Google e Google Agenda — fase 7

## Contexto
- O login de hoje é por e-mail e senha. O Supabase confere a identidade (`supabaseAuthService.signInWithPassword`) e o backend cria a sessão própria (cookies `access_token`/`refresh_token`). O cadastro pede nome do negócio, responsável, e-mail, WhatsApp, CPF/CNPJ, senha e plano desejado (`registerSchema`), e a conta só nasce depois de confirmar o e-mail.
- `users` já tem `auth_provider` (padrão `email`) e `supabase_user_id`. `password_hash` é obrigatório.
- A disponibilidade de horários é calculada em três lugares, e todos passam `blockedRanges` para `generateAvailableTimeSlots` (hoje só com a pausa da profissional):
  - `appointmentsService.getAvailableSlots` (painel e bancada);
  - `publicBooking.service` (página pública);
  - `whatsappFlowService` (bot).
- Agendamentos são gravados por muitos caminhos: painel, página pública, bot, bancada (reagendar e cancelar), mudança de status, comanda e clube. `appointments.updated_at` muda em toda gravação.
- O `cronService` (node-cron) já roda tarefas a cada minuto.
- O app da profissional (fase 5) existe só nos planos Equipe e Salão. A profissional entra por e-mail e senha.
- A dona que atende não tem ligação gravada com o próprio cadastro de profissional: no "sozinha" do onboarding, o cadastro de profissional é criado com o nome dela, mas `users.professional_id` fica vazio.

## Decisões do dono (26/10)
1. **Login com Google só para a dona, no painel.** A profissional e a recepção continuam entrando como hoje, e a cliente final não faz login.
2. **Cria a conta pelo Google.** A dona sem conta toca em "Continuar com Google", cria a conta ali e completa os dados do negócio logo depois.
3. **Apple fica para depois.** O código deve permitir incluir outro provedor sem refazer o fluxo.
4. **Google Agenda em todos os planos** (Solo, Equipe e Salão).
5. **A dona conecta o Google dela e vê os agendamentos de todas as profissionais.** No Solo, isso é a agenda dela mesma.
6. **Cada profissional conecta o Google dela pelo app** e vê só os agendamentos dela.
7. **Agendamentos vão para o Google:** criar, remarcar e cancelar se refletem no Google dela.
8. **Compromissos pessoais do Google bloqueiam o horário** daquela pessoa na página de agendamento.
9. Aprovado como descrito na conversa: agenda separada "EasyAgenda+" dentro do Google; leitura só de ocupado/livre, sem títulos; "Ocupado (Google)" na agenda do painel, com a recepção podendo encaixar com aviso; desconectar em Ajustes ou no app.

## Escopo

### Parte A · Login e cadastro com Google
1. **Botão "Continuar com Google"** em `/login` e `/cadastro`, acima do formulário de e-mail e senha, que continua igual.
2. **Login pelo Supabase:** `supabase.auth.signInWithOAuth({ provider: 'google' })`, com escopos só `openid email profile`. Na volta, a página `/auth/callback` pega a sessão do Supabase e chama o backend.
3. **O backend decide** (`POST /auth/oauth/sessao`, com o access token do Supabase):
   - Valida o token no Supabase e lê o e-mail (verificado pelo Google), o nome e o `supabase_user_id`.
   - **Já existe usuário** com esse `supabase_user_id` ou com esse e-mail: liga a identidade (grava `supabase_user_id` se faltar e marca `email_verified`), aplica as mesmas regras do login por senha (bloqueado, assinatura, onboarding pendente) e cria a sessão.
   - **Não existe:** responde `{ completarCadastro: true, email, nome }`, sem criar nada.
4. **Completar cadastro** (`/cadastro/completar`): nome do negócio, nome da responsável (vem do Google), WhatsApp, CPF/CNPJ e plano. O e-mail aparece fixo. O formulário usa as mesmas validações do `registerSchema`, sem senha.
   - O envio (`POST /auth/oauth/completar`, com o mesmo token) cria negócio e usuário já com e-mail verificado, `auth_provider = 'google'`, e abre a sessão.
   - Depois segue o mesmo caminho de quem acabou de confirmar o e-mail: pagamento quando o plano pede, e em seguida o onboarding de 5 etapas.
   - Um cadastro por senha iniciado e nunca confirmado com o mesmo e-mail (`pending_registrations`) é descartado ao completar pelo Google.
5. **O plano e o segmento escolhidos antes do Google se mantêm.** O `?plano=` e o `easyagenda:segmento-cadastro` (localStorage) sobrevivem à ida e volta do Google e chegam pré-marcados no completar e no onboarding.
6. **Conta com senha continua aceitando senha.** Conta criada pelo Google pode definir uma senha em "Esqueci minha senha" e passa a entrar das duas formas.

### Parte B · Google Agenda
1. **Conectar:**
   - **Dona:** em Ajustes › Integrações › Google Agenda, em todos os planos.
   - **Profissional:** no app, em um cartão "Google Agenda" (Equipe e Salão).
   - A conexão é um OAuth próprio do backend, separado do login, com `access_type=offline` para ter o refresh token. Funciona com qualquer conta Google, também para quem entra no EasyAgenda+ por senha.
2. **Ao conectar:**
   - O sistema cria no Google dela uma agenda chamada "EasyAgenda+" (na da dona, "EasyAgenda+ · <nome do negócio>").
   - Copia para ela os agendamentos de hoje até 90 dias à frente.
   - Começa a ler o ocupado da agenda principal dela.
3. **Quem a dona é na grade:** ao conectar, a dona responde se também atende e, se sim, escolhe o próprio cadastro na equipe. No Solo com uma profissional só, essa vem marcada. Os compromissos dela bloqueiam só esse cadastro. Se ela não atende, a conexão dela só recebe os agendamentos e não bloqueia ninguém.
4. **EasyAgenda → Google:**
   - Um evento por agendamento em cada conexão que deve vê-lo: a do negócio vê todos, e a da profissional vê os dela.
   - Remarcar move o evento. Cancelar apaga o evento. Os demais status mantêm o evento.
   - Trocar a profissional de um agendamento tira o evento da conexão antiga e põe na nova.
5. **Google → EasyAgenda:**
   - Os períodos ocupados da agenda principal dela, de hoje até 60 dias à frente, entram como `blockedRanges` nos três cálculos de disponibilidade, só para a profissional ligada à conexão.
   - A agenda "EasyAgenda+" não é lida, então os próprios agendamentos não bloqueiam duas vezes.
6. **Agenda do painel:** os períodos ocupados aparecem como bloco "Ocupado (Google)" na coluna da profissional, sem título. Criar ou remarcar por cima é permitido, com o aviso "Esse horário está ocupado no Google Agenda de <nome>".
7. **Estado e erros:** o cartão mostra a conta conectada, a última sincronização e "Desconectar".
   - Se o Google recusar o token (acesso revogado ou senha trocada), a conexão fica "Precisa reconectar".
   - Nesse caso, a dona recebe aviso no sino e por push (a profissional, no app), e o ocupado daquela pessoa deixa de bloquear até reconectar.
8. **Desconectar:** revoga o token no Google e apaga o token e o ocupado guardados. A agenda "EasyAgenda+" fica no Google dela, sem receber mais nada.
9. **Plano:**
   - Se a conta cair para o Solo, as conexões das profissionais param, com status "Pausada pelo plano", e voltam se o plano subir.
   - A conexão da dona nunca para por plano.
10. **Privacidade:** a política de privacidade (`/privacidade`) ganha uma seção sobre os dados do Google: o que é lido (só ocupado/livre), o que é escrito (a agenda "EasyAgenda+"), como desconectar e o cumprimento da Limited Use Policy do Google. A verificação do Google exige isso.

## Fora do escopo
- Login com Apple (decisão 3).
- Login com Google para profissional e recepção criarem conta. Se alguma delas já tiver conta com o mesmo e-mail, o botão funciona (ver "Decisões do Claude").
- Ler títulos, convidados ou detalhes dos compromissos pessoais.
- Editar no Google e refletir no EasyAgenda: mexer no evento "EasyAgenda+" pelo Google não muda o agendamento, e a próxima sincronização sobrescreve.
- Outlook ou iCloud.
- Push do Google (watch channels). A leitura do ocupado é por consulta periódica.

## Modelo de dados
- `users.password_hash` passa a aceitar nulo, para contas só do Google. O login por senha de uma conta sem senha responde "Essa conta entra com o Google".
- `users.auth_provider`: `email` | `google`. Conta com senha que entrou pelo Google continua `email`.
- **`google_agenda_conexoes`:**
  - identificação: `id`, `business_id`, `user_id` (quem conectou);
  - tipo: `tipo` (`negocio` | `profissional`) e `professional_id` (a pessoa cujo ocupado bloqueia; nulo quando a dona não atende);
  - conta Google: `google_email`, `refresh_token_cifrado`, `calendario_id` (a agenda "EasyAgenda+");
  - estado: `status` (`ativa` | `reconectar` | `pausada_plano`), `ultimo_erro`, `ultima_sync_em`, `criada_em`.
  - Restrições: única por `user_id`, e uma conexão `negocio` por negócio.
- **`google_agenda_eventos`:** `conexao_id`, `appointment_id`, `google_event_id`, `versao` (o `updated_at` do agendamento sincronizado). Única por (`conexao_id`, `appointment_id`).
- **`google_agenda_ocupado`:** `conexao_id`, `inicio`, `fim` (timestamptz). Substituído inteiro a cada leitura daquela conexão.
- O refresh token é cifrado com AES-256-GCM e a chave vem de `GOOGLE_TOKEN_KEY`. O access token não é gravado.

## Regras
- **Saída:** um job a cada minuto procura, nas conexões ativas, os agendamentos de ontem a +90 dias que não têm evento ou cuja `versao` mudou, e cria, atualiza ou apaga o evento.
  - Depois de gravar um agendamento, o painel, a página pública e o bot pedem uma sincronização imediata daquele agendamento, sem esperar o job. Se ela falhar, o job cobre.
  - O tempo até o evento aparecer fica em até 1 minuto.
- **Evento:**
  - Título: "<primeiro nome da cliente> · <serviço>", e na conexão do negócio também " · <profissional>".
  - Horário no fuso do negócio.
  - Descrição com o link do agendamento no painel. O telefone da cliente não vai.
- **Entrada:** um job a cada 5 minutos consulta o `freeBusy` da agenda principal (`primary`) de cada conexão ativa com `professional_id`, de agora até +60 dias, e substitui o `google_agenda_ocupado`. Ao conectar, a primeira leitura acontece na hora.
- **Disponibilidade:** os três cálculos juntam pausa e ocupado do Google em `blockedRanges` para a profissional e o dia. Conexão sem status `ativa` não bloqueia.
- **Erros do Google:** 401 ou `invalid_grant` passa para `reconectar` e avisa uma vez. 429 ou 5xx tenta de novo no próximo ciclo, sem mudar o status.
- **Escopos do Google Agenda:** `https://www.googleapis.com/auth/calendar.app.created` (criar e mexer só na agenda criada pelo app) e `https://www.googleapis.com/auth/calendar.freebusy` (só ocupado/livre). Nenhum escopo amplo de leitura.

## API
- `POST /auth/oauth/sessao` — `{ accessToken }` → sessão criada ou `{ completarCadastro, email, nome }`.
- `POST /auth/oauth/completar` — `{ accessToken, businessName, ownerName, whatsapp, cpfCnpj, desiredPlan }` → conta criada e sessão.
- `GET /google-agenda/conectar?para=negocio|profissional` → URL de consentimento do Google (com `state` assinado e de uso único).
- `GET /google-agenda/callback` → troca o código, cria a conexão e a agenda, dispara a cópia inicial e volta para Ajustes ou para a bancada.
- `GET /google-agenda/conexao` → a conexão de quem está logado (e, para a dona, as das profissionais com o status).
- `PUT /google-agenda/conexao` — `{ professionalId | null }` → só para a dona dizer quem ela é na grade.
- `DELETE /google-agenda/conexao` → desconectar.
- Os blocos "Ocupado (Google)" do painel vêm junto com a consulta da agenda do dia (`/appointments`), por profissional.

## Telas
- `/login` e `/cadastro`: botão "Continuar com Google" no padrão visual do Google, mais um divisor "ou".
- `/auth/callback`: carregamento até o backend responder.
- `/cadastro/completar`: o formulário do cadastro sem e-mail e senha.
- **Ajustes › Integrações › Google Agenda:**
  - desconectado: explicação curta e "Conectar Google Agenda";
  - conectado: e-mail, última sincronização, "Você também atende?" com a escolha do cadastro, e "Desconectar";
  - no Equipe e no Salão, a lista das profissionais com o status da conexão de cada uma.
- **App da profissional:** cartão "Google Agenda" com os mesmos estados.
- **Agenda do painel:** bloco hachurado "Ocupado (Google)" e o aviso ao criar ou remarcar por cima.

## Configuração externa (o dono faz, com passo a passo entregue junto)
- **Google Cloud:**
  - projeto, tela de consentimento externa com logo, domínio e links de privacidade e termos;
  - Google Calendar API ativada;
  - um cliente OAuth Web com dois redirects: o callback do Supabase e o `/google-agenda/callback` do backend.
- **Supabase:** provedor Google ativado com esse cliente, e o `/auth/callback` do site na lista de redirects.
- **Variáveis do backend:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AGENDA_REDIRECT_URI` e `GOOGLE_TOKEN_KEY`.
- **Verificação do Google:**
  - O login (`openid email profile`) não precisa de verificação além da marca.
  - Os escopos de agenda precisam de verificação: vídeo mostrando o uso e a política de privacidade publicada. Até aprovar, só até 100 contas de teste cadastradas conseguem conectar.
- **Sem a configuração:** os botões e cartões do Google não aparecem e nada quebra, como no push sem VAPID.

## Testes
- **Backend, login:**
  - sessão OAuth com usuário existente, por `supabase_user_id` e por e-mail;
  - usuário inexistente pede completar;
  - completar valida como o cadastro e cria a conta verificada;
  - usuário bloqueado é recusado;
  - login por senha numa conta só do Google dá a mensagem certa.
- **Backend, agenda:**
  - cifra e decifra do token;
  - `state` inválido ou repetido é recusado;
  - saída cria, atualiza e apaga pela `versao` (cancelado apaga; troca de profissional move);
  - conexão do negócio vê todos e a da profissional só os dela;
  - ocupado entra em `blockedRanges` nos três cálculos e só para a profissional ligada;
  - conexão em `reconectar` ou `pausada_plano` não bloqueia;
  - `invalid_grant` muda o status e avisa uma vez;
  - plano cai para o Solo e pausa as profissionais.
  - A API do Google é sempre mockada.
- **Frontend:**
  - botão e callback;
  - completar cadastro;
  - cartão de Ajustes nos três estados;
  - cartão do app;
  - bloco "Ocupado (Google)" e o aviso ao encaixar.

## Riscos
- **Verificação do Google pode levar semanas.** Até lá, a agenda funciona só para contas de teste. O login com Google não depende dela.
- **Ocupado com até 5 minutos de atraso:** um compromisso recém-criado no Google pode não bloquear na hora. Aceitável. Push do Google fica para depois, se precisar.
- **Muitas conexões:** o `freeBusy` aceita várias agendas por chamada, mas cada conexão tem o próprio token, então são chamadas separadas. Com poucas centenas de conexões a cada 5 minutos, a cota padrão sobra. Medir antes de crescer.
- **Contas iguais com e-mails diferentes:** a dona que se cadastrou com um e-mail e entra pelo Google com outro cria uma conta nova. A tela de completar avisa "Já tem conta com outro e-mail? Entre com ele".

## Decisões do Claude
- **Login com Google em conta existente vale para qualquer papel**, desde que o e-mail bata. Criar conta pelo Google é só para a dona. Assim a profissional que tocar no botão por engano não fica travada.
- **O token do Google Agenda não vem do login.** A conexão da agenda é um OAuth separado. O Supabase não guarda o refresh token do Google de forma confiável, e a agenda precisa funcionar também para quem entra por senha.
- **Sincronização por varredura de `updated_at`**, em vez de ganchos em cada caminho de gravação: são muitos caminhos, e a varredura não perde nenhum. A sincronização imediata é só um atalho.
- **Janelas:** saída de ontem a +90 dias; ocupado de agora a +60 dias.
- **Agenda principal** é a única lida para o ocupado. Outras agendas pessoais dela ficam de fora.
- **Telefone da cliente fora do evento**, por privacidade.
- **Cancelar apaga o evento;** falta e concluído mantêm.

## Ajustes feitos na implementação
- **`password_hash` continua obrigatório:** a conta criada pelo Google usa o `senhaPlaceholder()`, como todas as contas (a senha real fica no Supabase). O cadastro pelo Google grava o pendente e reaproveita a confirmação do cadastro (`confirmSignup`), e o `auth_provider` fica `google`.
- **Plano no cadastro:** o parâmetro é `?plan=`, o mesmo da página de preços; a tela de completar tem a escolha do plano.
- **"Pausada pelo plano" é calculado** (`conexaoEfetiva`), não gravado; a coluna `status` só guarda `ativa` ou `reconectar`.
- **Ocupado do painel:** vem de `GET /google-agenda/ocupado?data=`, não do `/appointments`.
- **Encaixe com aviso:** a rota de horários do painel (`/appointments/available-slots`) não aplica o ocupado do Google, para a recepção poder encaixar; o modal marca esses horários e avisa. Bancada, página pública e bot continuam bloqueando.
- **Aviso de reconectar da dona:** só pelo sino, que já manda o push para a equipe.
- **Reconectar** a mesma pessoa apaga a conexão antiga e cria uma agenda nova; a antiga fica parada no Google.
- **Conexão confirmada pelo navegador logado:** o callback do Google só troca o código e deixa a conexão pendente por 10 minutos; o app confirma com `POST /google-agenda/confirmar` e a sessão de quem está logado. Se não for a mesma pessoa que pediu, recusa e revoga o acesso (evita ligar a agenda de alguém a outra conta por um link).
- **Reconectar a mesma conta Google reaproveita a agenda** "EasyAgenda+" e a escolha da dona; os eventos têm id fixo derivado do agendamento, então são reencontrados em vez de duplicados.
- **Erro num evento** não trava os outros e fica em `ultimo_erro`; agenda apagada no Google leva a conexão para "reconectar".
- **Sessão do Supabase** no navegador é encerrada logo depois de virar a sessão do app.
- **Rotas do BFF** (`/api/auth/oauth/*` e `/api/google-agenda/*`) no Next, como o resto do app.
