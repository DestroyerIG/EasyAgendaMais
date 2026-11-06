# Funcionalidades do EasyAgenda+

Guia do que o sistema faz hoje, tela por tela, depois do redesign (fases A a 7 do `docs/ROADMAP.md`).

- As decisões de cada fase estão nas specs em `docs/superpowers/specs/`.
- O visual segue `docs/design/DESIGN.md` e as telas do Google Stitch em `docs/design/stitch/projeto/`.
- O que ficou pendente em cada fase está em `docs/design/SEGUIMENTO.md`.

Atualizado em 27/10/2026.

## Quem usa o sistema

| Quem | Papel (`users.role`) | Onde entra | O que vê |
|---|---|---|---|
| Dona do negócio | `tenant_admin` | `/login` (e-mail e senha ou Google) | O painel inteiro |
| Recepção | `employee` | `/login` | O painel do salão |
| Profissional | `professional` | `/login` (convite por e-mail) | Só o app da profissional em `/bancada` |
| Cliente final | — | Sem login | Página pública, adesão ao clube, avaliação e WhatsApp |
| Equipe da plataforma | `platform_admin` | `/login` | SuperAdmin em `/admin` |

## Segmentos e vocabulário

O negócio escolhe um segmento no onboarding (e pode trocar em Ajustes › CRM). O segmento muda os termos em todo o sistema, com a concordância de gênero:

| Segmento | Profissional | Cliente | Negócio |
|---|---|---|---|
| `barbearia` | barbeiro | cliente (o) | barbearia |
| `unhas` | nail designer | cliente (a) | estúdio |
| `cilios_sobrancelhas` | lash designer | cliente (a) | estúdio |
| `cabelo` | cabeleireira | cliente (a) | salão |
| `estetica` | esteticista | cliente (a) | clínica |
| `outro` | profissional | cliente (a) | negócio |

- O dicionário fica em `backend/src/config/vocabulario.ts`. O frontend recebe os termos no `/auth/me` e no payload da página pública (`useVocabulario`).
- Os termos valem no painel, na bancada, na página pública, no convite e nas mensagens padrão do bot e das automações. Textos que a dona editou não mudam.
- O segmento também define o modelo da ficha técnica e os serviços sugeridos no onboarding.

## Conta, cadastro e acesso

### Cadastro e login
- **Cadastro** (`/cadastro`): nome do negócio, responsável, WhatsApp, CPF/CNPJ, e-mail, senha e plano. A conta só nasce depois de confirmar o e-mail (Supabase Auth). O segmento escolhido na landing (`?segmento=`) e o plano (`?plano=`) chegam pré-marcados.
- **Login** (`/login`): e-mail e senha. A sessão usa cookies httpOnly (`access_token` e `refresh_token`) criados pelo backend.
- **Esqueci minha senha** (`/esqueci-senha`) e **Redefinir senha** (`/auth/redefinir-senha`).
- **Teste grátis de 14 dias** (`TRIAL_DAYS` em `backend/src/config/trial.ts`).

### Login com Google (fase 7)
- Botão **"Continuar com Google"** no login e no cadastro, só para a dona. Aparece quando `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1`.
- Na volta do Google (`/auth/callback`), o backend procura a conta pelo `supabase_user_id` ou pelo e-mail:
  - se a conta existe, liga a identidade Google e abre a sessão, com as mesmas regras do login por senha;
  - se não existe, leva a **Completar cadastro** (`/cadastro/completar`): nome do negócio, WhatsApp, CPF/CNPJ e plano, sem senha.
- Uma conta criada pelo Google pode definir senha em "Esqueci minha senha" e entrar das duas formas.
- Configuração do Google Cloud e do Supabase: `docs/google-configuracao.md`.

### Onboarding guiado (fase 6)
Abre sozinho no primeiro acesso de uma conta nova (`/onboarding`). São 5 etapas, e quem fecha o navegador volta para a etapa em que parou:

1. **Seu negócio:** segmento em cartões e "Atendo sozinha" ou "Tenho equipe". "Atendo sozinha" já cria o cadastro de profissional com o nome da responsável.
2. **Horários:** dias abertos, abertura e fechamento, intervalo da agenda e pausa de almoço.
3. **Serviços:** lista sugerida do segmento, com nome, duração, preço e sinal (%) editáveis. Se algum serviço tem sinal, pede a chave Pix.
4. **Sua página:** endereço (slug), logo, cor e até 6 fotos.
5. **WhatsApp e link:** QR da conexão e o link da página para compartilhar.

- As etapas 1 a 3 são obrigatórias. O painel só abre depois delas.
- As etapas 4 e 5 podem ser puladas. O que ficou pulado aparece no cartão **"Termine de configurar"** da tela Hoje, que pode ser dispensado.
- Contas que já existiam antes da fase 6 não passam pelo onboarding.

### Assinatura do sistema
- Pagamento por **cartão** (Stripe, assinatura recorrente) ou **Pix** (Asaas, cobrança mensal avulsa). Tela de pagamento em `/pagamento`.
- Sem assinatura ativa, o painel fica restrito a Plano e cobrança. Regras em `PLANOS.md`.

#### Quando a cobrança falha (modo de contingência)
- Vale só para quem já pagou alguma vez. Quem nunca pagou segue o fim do teste.
- **Carência de 7 dias** (`past_due`, `unpaid` ou `pending`):
  - o painel continua abrindo, com uma faixa no topo avisando quantos dias restam;
  - leitura, atendimento de hoje, caixa, comanda e envios já combinados continuam (lembrete, confirmação, recibo Pix, sinal e clube);
  - o que cria compromisso novo responde "Disponível depois de regularizar a assinatura." e os botões ficam desabilitados;
  - a página pública de agendamento fica pausada, com o WhatsApp do negócio. A cliente final não vê nada sobre pagamento.
- **Conta bloqueada** (passou dos 7 dias): o painel leva para `/dashboard/assinatura`, só com o pagamento e o backup dos dados (clientes e agendamentos em CSV).
- **Tela de assinatura** (`/dashboard/assinatura`): quem paga no Pix gera o Pix da mensalidade ali mesmo; quem paga no cartão abre o portal da Stripe. "Já paguei" recarrega o estado, e a conta volta ao normal quando o pagamento é confirmado.
- A mensalidade `pending` com o período pago ainda no futuro (Pix do mês seguinte, gerado antes do vencimento) não é atraso: a conta segue ativa.

## Painel da dona

Barra lateral: Hoje · Agenda · Clientes · Caixa · Clube e pacotes · WhatsApp · Relatórios · Minha página · Ajustes. No celular, a barra inferior tem Hoje, Agenda, o botão "+" (novo agendamento), Clientes e "Mais". O painel tem modo claro e escuro.

Os arquivos ficam em `frontend/src/app/dashboard/`, mas o endereço no navegador aparece sem o `/dashboard` (por exemplo, `/agendamentos` e `/clientes`). Quem faz essa troca é o `frontend/src/middleware.ts`.

### Busca geral (todas as telas)
- A barra de cima funciona em todas as telas do painel e acha clientes (por nome, telefone ou e-mail), os agendamentos dessas clientes e as telas do sistema. `Ctrl K` (`Cmd K` no Mac) leva o foco para ela.
- A lista abre a partir de 2 letras ou 3 números. Setas, Enter e Esc funcionam, e cada grupo mostra poucos itens: até 5 clientes, 5 agendamentos e 4 telas.
- Abrir uma cliente leva à ficha. Abrir um agendamento leva ao dia certo na agenda, com o painel de detalhes aberto.
- Clientes inativas e agendamentos cancelados ficam de fora. Telas que o plano não libera aparecem e explicam o bloqueio ao abrir.
- No celular, a lupa ao lado do sino abre a busca em tela cheia.
- Na tela de Clientes, no computador, a barra filtra a lista dessa tela e não abre a busca geral.
- O termo vai no corpo do pedido e não é gravado em log, e a resposta não fica em cache. A busca tem limite próprio por negócio (600 pedidos a cada 15 minutos) e não gasta a cota do resto do painel.

### Hoje (`/dashboard`)
- Faturamento do dia e ocupação da grade (descontando o almoço, comparada à média das 4 semanas anteriores no mesmo dia da semana).
- Pendências: horários livres à tarde, retorno vencido, sinais Pix a confirmar e avaliação desfavorável.
- "Confirmados por lembrete" no mês.
- Cartão "Termine de configurar" do onboarding.

### Agenda (`/dashboard/agendamentos`)
- Linha do tempo diária por profissional no computador e lista com gesto de deslizar no celular.
- Status do agendamento: `aguardando_pagamento` → `confirmado` → `em_atendimento` → `concluido`, ou `faltou` e `cancelado`. As transições são validadas no backend, e `concluido` só vem do fechamento da comanda.
- Origem de cada agendamento: painel, página pública ou WhatsApp.
- **Painel de detalhes** (drawer) com cliente, serviço, sinal, selo do clube, histórico e ações.
- Intervalo de almoço por profissional, que bloqueia o horário no painel, na página pública e no bot.
- "Ocupado (Google)" quando a profissional tem compromisso no Google Agenda. A recepção pode encaixar mesmo assim, com aviso.
- Selo "Pronta para cobrar" quando a profissional mandou a comanda pela bancada.
- **Lista de espera:** inscrever a cliente, oferecer a vaga pelo WhatsApp e marcar como agendada.

### Comanda
- Abre a partir do agendamento: serviço, produtos, desconto, gorjeta e forma de pagamento.
- Comissão da profissional por item: o percentual próprio dela ou o padrão do negócio, separado para serviço e produto. Percentuais e preços ficam gravados no fechamento e nunca são recalculados.
- Faturamento = serviços + produtos − desconto. A gorjeta vai 100% para a profissional e não entra no faturamento.
- **Clube e pacotes:** a chave "Usar clube/pacote" cobre a sessão (sai a R$ 0,00), mostra "Sessão 4 de 10" e aplica o desconto de sócia nos extras.
- **Comprovante no WhatsApp** ao fechar, com o link de avaliação. O texto diz "comprovante", porque o sistema não emite nota fiscal.
- Atalhos de produtos e serviços mais usados.

### Clientes (`/dashboard/clientes`)
- Lista com busca e filtros, e **visão por fases**: Novo, Recorrente, Fiel/VIP, Em risco e Perdido.
- Ciclo médio, retorno previsto, LTV e ticket médio calculados no backend.
- Etiquetas automáticas (fase, aniversário do mês, primeira vez, resgatável) e etiquetas manuais.
- Taxa de retenção e clientes ativas.
- Exportação em CSV.

### Ficha da cliente (`/dashboard/clientes/[id]`)
- Dados, histórico de visitas e linha do tempo.
- **Ficha técnica** pelo modelo do segmento, com campos livres. "Alergias e restrições" está sempre presente.
- **Fotos dos procedimentos** num bucket privado, com links assinados de curta duração.
- **Consentimento LGPD** de WhatsApp com data e canal. Clientes antigas ficam como "não informado".
- Selo do contrato de clube ou pacote.

### Caixa (`/dashboard/financeiro`)
- Abertura com saldo inicial, sangria, suprimento e despesas.
- Entradas do dia por forma de pagamento, com a linha "Clube" para recebimentos de clube e pacote.
- Fechamento com o valor contado e a diferença. Também é possível reabrir.
- Despesas e resumo mensal. Exportação do financeiro em PDF no plano Equipe.

### Clube e pacotes (`/dashboard/clube`), plano Salão
- **Ofertas:**
  - clube por assinatura mensal, com sessões por mês (não acumulam), intervalo mínimo entre sessões e desconto de sócia;
  - pacote pré-pago, com total de sessões e validade contada a partir da primeira sessão.
- Cada oferta tem serviços inclusos, profissionais permitidas, benefícios em texto e status (ativa, pausada ou arquivada).
- **Assinantes e pacotes ativos** (`/dashboard/clube/assinantes`): saldo, próximo vencimento, forma de pagamento e status.
  - Venda no balcão, paga na hora ou como "Pix a receber", com o copia e cola enviado no WhatsApp.
  - Confirmar pagamento, reenviar cobrança, cancelar e exportar em CSV.
- A mensalidade é cobrada pela chave Pix do próprio salão, com confirmação manual da dona.
- Rotina de hora em hora:
  - gera o Pix do ciclo seguinte 3 dias antes;
  - marca o atraso, bloqueia o uso e avisa no sino;
  - encerra pacotes vencidos;
  - cancela adesões pendentes depois de 7 dias.

### WhatsApp (`/dashboard/whatsapp`)
Abas na ordem do Stitch: Hora de voltar · Automações · Campanhas · Conversas · Conexão. Detalhes técnicos em `WHATSAPP_BOT.md`.

- **Hora de voltar:**
  - lista as clientes com o retorno vencido, com atraso, último serviço, profissional e 2 encaixes sugeridos;
  - mostra a prévia da mensagem e a recuperação estimada;
  - envia o convite para uma cliente ou em lote, pela fila cadenciada.
- **Automações:** 7 regras com interruptor, texto editável com variáveis, "Testar envio" e o resultado do mês.
  - Confirmação 24 h antes: a cliente responde 1 para confirmar ou 2 para cancelar.
  - Cobrança de sinal Pix.
  - Radar de retorno.
  - Lista de espera automática.
  - Lembrete, 2 horas antes ou na véspera.
  - Aniversário.
  - Pedido de avaliação.
- **Campanhas:**
  - público por segmento (em risco, reativação, aniversariantes, VIPs ou todas), com filtro de profissional e de último serviço;
  - mensagem com variáveis e prévia no celular;
  - agendamento com cadência de 10, 25 ou 60 por hora;
  - situações: rascunho, agendada, enviando, concluída e cancelada.
- **Conversas:**
  - central com as conversas das clientes e dos números que falaram com o robô;
  - responder pelo painel, assumir a conversa e devolver ao robô;
  - respostas rápidas e fotos de perfil.
  - A conversa volta ao robô depois de 12 h sem atividade. As mensagens ficam guardadas por 180 dias.
- **Conexão:** QR code, saúde da conexão, limites e histórico de envios.
- **Robô de agendamento:** menu configurável, agenda pelo WhatsApp com os mesmos horários do painel e simulador.
- **Opt-out:** quem responde SAIR (ou PARAR, CANCELAR, STOP, DESCADASTRAR) para de receber mensagens automáticas. VOLTAR reativa.

### Relatórios (`/dashboard/relatorios`), planos Equipe e Salão
- Ticket médio, retorno no ciclo, faltas e faturamento do mês contra a meta, cada um comparado ao período anterior.
- Mapa de ocupação por turno, com o horário de pico e um insight escrito por regra fixa.
- Origem dos agendamentos e evolução de 6 meses com projeção.
- Bloco de avaliações das clientes.
- Exportação em PDF.

### Comissões (`/dashboard/relatorios/comissoes`), planos Equipe e Salão
- Apuração por profissional no período: quinzena (padrão), mês atual, mês anterior ou intervalo livre.
- Comissão de serviço e de produto, gorjetas, adiantamentos e o valor a pagar.
- "Marcar como pago" grava os valores do momento. Também é possível desfazer o pagamento e lançar adiantamentos.
- Comprovante do repasse em PDF e exportação para o contador em CSV e PDF.
- **Salão-parceiro** (só no plano Salão): cota-parte do salão e da profissional, CNPJ do MEI e o aviso da Lei 13.352/2016.

### Recebimentos (Ajustes, só administrador)
Aparece quando o Mercado Pago está configurado no backend (guia em `docs/mercado-pago-configuracao.md`).

- Lista de gateways com logo e situação. Só o Mercado Pago funciona; Asaas, InfinitePay e PagBank aparecem como "Em breve".
- Tela de passos: conta no Mercado Pago, chave Pix, conectar pela autorização, escolher Pix e cartão (o cartão pede aceite do aviso de contestação) e conferir a conta conectada.
- O dinheiro cai direto na conta do negócio. As taxas são do Mercado Pago e saem do sinal.
- Desconectar apaga os acessos e devolve as reservas pendentes à confirmação manual. Se a autorização vencer, a tela pede "Reconectar" e o sino avisa.
- Aguardando Pix: reservas com cobrança automática ganham o selo "Automático". O botão manual continua como plano B. O Caixa e a ficha mostram a forma do sinal.
- Pagamento depois do prazo, em dobro, devolvido ou contestado gera alerta no sino. O sistema não devolve nem cancela sozinho.
- Se o Mercado Pago falhar na reserva, a cliente cai na chave Pix de Minha página.

### Minha página (`/dashboard/minha-pagina`)
- Endereço público (`/agendar/[slug]`) com checagem de disponibilidade.
- Logo, cor de destaque, galeria de fotos, endereço e chave Pix.
- Seção do clube na página pública.

### Ajustes (`/dashboard/configuracoes`)
Abas: Negócio · Serviços e equipe · Plano e cobrança.

- **Negócio:**
  - perfil do negócio e da conta, senha e aparência (tema);
  - horários: dias abertos, abertura e fechamento, intervalo e encaixe;
  - CRM: segmento, ciclo de retorno e etiquetas;
  - comissão padrão e modelo de repasse;
  - app da profissional, com a chave "A profissional cobra no app";
  - **Integrações › Google Agenda**.
- **Serviços e equipe** (`/dashboard/servicos`):
  - serviços com preço, duração, sinal (%) e ícone escolhido pelo nome;
  - profissionais com intervalo de almoço, comissão própria, CNPJ (MEI) e especialidade;
  - convite para o app da profissional.
- **Plano e cobrança** (`/dashboard/planos`):
  - plano, status, próxima cobrança, recursos, forma de pagamento e faturas reais;
  - cancelar e reativar a assinatura.
- **Comparação e upgrade** (`/dashboard/planos/comparar`):
  - os 3 planos, a matriz de recursos e o FAQ;
  - upgrade na hora com a diferença proporcional e downgrade na renovação, que pode ser cancelado.

### Google Agenda (fase 7)
- **Conectar:** a dona conecta em Ajustes › Integrações (todos os planos). Cada profissional conecta no app (Equipe e Salão).
- O sistema cria uma agenda separada, "EasyAgenda+", na conta Google da pessoa.
- A dona vê os agendamentos de todas as profissionais, e cada profissional vê só os dela.
- **Ida:** criar, remarcar e cancelar um agendamento se reflete no Google. A rotina roda a cada minuto.
- **Volta:** compromissos pessoais do Google bloqueiam o horário daquela pessoa na página pública e no bot. A rotina roda a cada 5 minutos. O sistema lê só ocupado e livre, sem os títulos.
- O acesso guardado é cifrado com `GOOGLE_TOKEN_KEY`. É possível desconectar em Ajustes ou no app.

### Notificações
- Sino no painel com contador de não lidas e "marcar todas como lidas".
- **Push no navegador** (Web Push com VAPID), no painel e no app da profissional, com o botão "Ativar notificações".

## App da profissional (`/bancada`), planos Equipe e Salão

PWA instalável, com manifesto, ícones e service worker que guarda só a casca (sem dados offline). Barra inferior: Agenda · Clientes · Atendimento · Números.

- **Acesso por convite:**
  - a dona convida pelo cadastro da profissional. O e-mail sai pelo SMTP, e o link também fica disponível para copiar;
  - o link `/convite/[token]` vale 7 dias e só pode ser usado uma vez;
  - a profissional cria a senha e entra;
  - a dona pode reenviar ou revogar o convite e remover ou reativar o acesso.
- **Hoje na bancada:** agenda do dia (e de outros dias), destaque da próxima cliente com alergia, ficha e último trabalho, e "Iniciar atendimento".
- **Clientes:** as clientes dela, com ficha rápida, anotação e foto.
- **Atendimento:** comanda com extras, comissão estimada e "Enviar para a recepção". Com a chave "A profissional cobra no app", ela escolhe a forma de pagamento, desconto e gorjeta e fecha a comanda.
- **Reagendar e cancelar** os agendamentos dela, com aviso à cliente no WhatsApp.
- **Meus números:** período (quinzena), líquido a receber, composição, adiantamentos, extrato por comanda, avaliações e PDF do extrato. Não mostra o faturamento da casa.
- **Google Agenda** da própria profissional.
- Quem entra com papel `professional` vai direto para `/bancada`. O painel fica fechado para esse papel.

## Páginas públicas (sem login)

- **Landing** (`/`) com planos e preços, e landing por segmento (`/nail-designers`).
- **Agendamento público** (`/agendar/[slug]`):
  - a cliente escolhe o serviço, a profissional e o horário, e informa nome e WhatsApp;
  - a caixa de consentimento vem desmarcada;
  - o horário fica reservado por 15 minutos enquanto ela paga o **sinal Pix**, gerado pela chave do próprio negócio;
  - sem gateway conectado, a dona confirma o pagamento no painel (aba Aguardando Pix); com o Mercado Pago conectado, a reserva se confirma sozinha;
  - quando o negócio liberou mais de uma forma, a cliente escolhe Pix ou cartão; no cartão, ela paga no Checkout do Mercado Pago e volta para a reserva, que tem endereço próprio;
  - a reserva vencida é cancelada pela rotina de 5 minutos.
- **Adesão ao clube** (`/agendar/[slug]/clube/[ofertaId]`): a cliente escolhe o clube e recebe o Pix. A assinatura começa quando a dona confirma o primeiro pagamento.
- **Avaliação** (`/avaliar/[token]`): de 1 a 5 estrelas, com comentário opcional, pelo link do comprovante. Nota baixa gera aviso no sino.
- **Convite da profissional** (`/convite/[token]`).
- **Termos de uso** (`/termos`) e **Política de privacidade** (`/privacidade`). A política explica o uso dos dados do Google.

## SuperAdmin (`/admin`)

Para a equipe da plataforma (`platform_admin`):
- métricas da plataforma;
- negócios (tenants), com bloquear, desbloquear e excluir, e usuários, com bloquear e desbloquear;
- assinaturas: ressincronizar, trocar plano, mudar status e cancelar;
- logs de auditoria;
- cupons da assinatura do sistema.

A reformulação do SuperAdmin e da landing é o item H do roadmap e ainda não tem fase.

## Rotinas automáticas

Rodam dentro do processo do backend (`backend/src/services/cronService.ts`, node-cron). Em hospedagem que hiberna, mantenha o processo acordado.

| Frequência | Rotina |
|---|---|
| A cada minuto | Fila de envios do WhatsApp (cadência, janela das 08:00 às 20:00, SAIR e consentimento) |
| A cada minuto | Fotos de perfil do WhatsApp |
| A cada minuto | Agendamentos para o Google Agenda |
| A cada 5 min | Compromissos do Google que bloqueiam horário |
| A cada minuto | Confere cobranças do Mercado Pago em aberto, para cobrir aviso perdido |
| A cada 5 min | Cancela reservas públicas com o Pix vencido |
| Diária, 04:00 | Renova os acessos do Mercado Pago que vencem em menos de 30 dias |
| A cada 10 min | Lembretes de agendamento |
| A cada 10 min | Confirmação 24 h antes |
| A cada 15 min | Radar de retorno e aniversários |
| A cada 15 min | Central de conversas: volta ao robô depois de 12 h e finaliza conversas do robô |
| De hora em hora (:15) | Assinaturas avulsas vencidas viram inadimplentes |
| De hora em hora (:20) | Aplica downgrades Pix agendados |
| De hora em hora (:25) | Rotina do clube (cobrança, atraso, vencimento, adesões) |
| Diária, 03:00 | Expira testes grátis sem assinatura |
| Diária, 03:30 | Apaga mensagens com mais de 180 dias |
