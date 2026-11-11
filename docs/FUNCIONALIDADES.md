# Funcionalidades do EasyAgenda+

Guia do que o sistema faz hoje, tela por tela, depois do redesign e das entregas seguintes (fases A a 7, itens H, Asaas, busca, página pública, robô e recebimentos do `docs/ROADMAP.md`).

- As decisões de cada fase estão nas specs em `docs/superpowers/specs/`.
- O visual segue `docs/design/DESIGN.md` e as telas do Google Stitch em `docs/design/stitch/projeto/`.
- O que ficou pendente em cada fase está em `docs/design/SEGUIMENTO.md`.

Atualizado em 11/11/2026.

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
- **Teste grátis em dois níveis** (`backend/src/config/trial.ts`): **7 dias sem cartão** (`TESTE_SEM_CARTAO_DIAS`) ou **14 dias com o cartão cadastrado** (`TESTE_COM_CARTAO_DIAS`), contados do cadastro. O cartão só é cobrado no fim do teste, e cancelar antes não cobra nada. Quem começa sem cartão pode cadastrá-lo depois e ganhar os outros 7 dias (aviso no painel, dispensável, e em Ajustes › Plano). O teste roda no plano que a pessoa escolheu.

### Login com Google (fase 7)
- Botão **"Continuar com Google"** no login e no cadastro, só para a dona. Aparece quando `NEXT_PUBLIC_GOOGLE_LOGIN_ATIVO=1`.
- Na volta do Google (`/auth/callback`), o backend procura a conta pelo `supabase_user_id` ou pelo e-mail:
  - se a conta existe, liga a identidade Google e abre a sessão, com as mesmas regras do login por senha;
  - se não existe, leva a **Completar cadastro** (`/cadastro/completar`): nome do negócio, WhatsApp, CPF/CNPJ e plano, sem senha.
- Uma conta criada pelo Google pode definir senha em "Esqueci minha senha" e entrar das duas formas.
- Configuração do Google Cloud e do Supabase: `docs/google-configuracao.md`.

### Onboarding guiado (fase 6)
Abre sozinho no primeiro acesso de uma conta nova (`/onboarding`). São 6 etapas, e quem fecha o navegador volta para a etapa em que parou:

1. **Seu negócio:** segmento em cartões e "Atendo sozinha" ou "Tenho equipe". "Atendo sozinha" já cria o cadastro de profissional com o nome da responsável.
2. **Horários:** dias abertos, abertura e fechamento, intervalo da agenda e pausa de almoço. Traz o card opcional "Já usa o Google Agenda?" (só a dona, em qualquer plano).
3. **Serviços:** lista sugerida do segmento, com nome, duração, preço e sinal (%) editáveis. O sinal dos serviços é definido na etapa Recebimentos.
4. **Recebimentos:** explica o sinal e a dona escolhe como recebe: Mercado Pago, InfinitePay (conexão de verdade), Asaas ou PagBank ("Em breve"), chave Pix manual ou "Não vou cobrar sinal agora". Depois escolhe quais serviços pedem sinal e a porcentagem de cada um (padrão 30%). O sinal sempre exige a chave Pix: com Mercado Pago ou InfinitePay conectado, ela fica como reserva e para o cliente que prefere pagar direto. Pode ser pulada com "Configurar depois". A volta da autorização do Mercado Pago cai de novo em `/onboarding`.
5. **Sua página:** endereço (slug), logo, cor e até 6 fotos.
6. **WhatsApp e link:** QR da conexão e o link da página para compartilhar.

- As etapas 1 a 3 são obrigatórias. O painel só abre depois delas.
- As etapas 4 a 6 podem ser puladas. O que ficou pulado aparece no cartão **"Termine de configurar"** da tela Hoje, que pode ser dispensado.
- Contas que já existiam antes da fase 6 não passam pelo onboarding.

### Assinatura do sistema
- A assinatura é cobrada **só pelo Asaas** (o Stripe saiu do código e do banco): **cartão** (assinatura recorrente no Checkout do Asaas; o número do cartão nunca passa pelo EasyAgenda+) ou **Pix** (cobrança mensal avulsa). Tela de pagamento em `/pagamento`, que pede CPF/CNPJ quando o Pix exige.
- **Salão sob consulta:** o plano Salão mostra "Sob consulta" e "Falar com a gente" (WhatsApp). O SuperAdmin define o valor mensal combinado do negócio, e só então a dona assina ou faz o upgrade no checkout normal. Quem já estava no Salão continua em R$ 199,90 até ter valor combinado.
- O cupom vale só na primeira mensalidade.
- Sem assinatura ativa, o painel fica restrito a Plano e cobrança. Regras em `PLANOS.md`.

#### Quando a cobrança falha (modo de contingência)
- Vale só para quem já pagou alguma vez. Quem nunca pagou segue o fim do teste.
- **Carência de 7 dias** (`past_due`, `unpaid` ou `pending`):
  - o painel continua abrindo, com uma faixa no topo avisando quantos dias restam;
  - leitura, atendimento de hoje, caixa, comanda e envios já combinados continuam (lembrete, confirmação, recibo Pix, sinal e clube);
  - o que cria compromisso novo responde "Disponível depois de regularizar a assinatura." e os botões ficam desabilitados;
  - a página pública de agendamento fica pausada, com o WhatsApp do negócio. A cliente final não vê nada sobre pagamento.
- **Conta bloqueada** (passou dos 7 dias): o painel leva para `/dashboard/assinatura`, só com o pagamento e o backup dos dados (clientes e agendamentos em CSV).
- **Tela de assinatura** (`/dashboard/assinatura`): quem paga no Pix gera o Pix da mensalidade ali mesmo; quem paga no cartão paga a fatura pela página do Asaas. "Já paguei" recarrega o estado, e a conta volta ao normal quando o pagamento é confirmado.
- A mensalidade `pending` com o período pago ainda no futuro (Pix do mês seguinte, gerado antes do vencimento) não é atraso: a conta segue ativa.

## Painel da dona

Barra lateral: Hoje · Agenda · Clientes · Caixa · Clube e pacotes · WhatsApp · Relatórios · Minha página · Ajustes. No celular, a barra inferior tem Hoje, Agenda, o botão "+" (novo agendamento), Clientes e "Mais". O painel tem modo claro e escuro. O "+" do celular abre os balões de novo agendamento e de novo cliente. A logo do negócio (Ajustes › Perfil do negócio) aparece no menu da conta, que é um só para o painel inteiro. Entre o login e o painel há uma tela de carregamento.

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
- **Hora de atender:** quando chega o horário de um agendamento confirmado, aparece a faixa "Chegou a hora de atender" com o botão Iniciar à vista. Uma rotina a cada minuto avisa no sino (sem push) e manda push só para a profissional daquele agendamento, uma vez por agendamento (`appointments.hora_avisada_em`).
- **Lista de espera:** inscrever a cliente, oferecer a vaga pelo WhatsApp e marcar como agendada.

### Comanda
- Abre a partir do agendamento: serviço, produtos, desconto, gorjeta e forma de pagamento.
- Comissão da profissional por item: o percentual próprio dela ou o padrão do negócio, separado para serviço e produto. Percentuais e preços ficam gravados no fechamento e nunca são recalculados.
- Faturamento = serviços + produtos − desconto. A gorjeta vai 100% para a profissional e não entra no faturamento.
- **Clube e pacotes:** a chave "Usar clube/pacote" cobre a sessão (sai a R$ 0,00), mostra "Sessão 4 de 10" e aplica o desconto de sócia nos extras.
- **Cobrança do saldo no balcão** (painel e app da profissional, esta só com "A profissional cobra no app"): o painel de cobrança calcula o saldo (já descontados sinal, desconto e clube) e o dinheiro vai sempre para a conta do negócio. O que aparece depende da forma escolhida e do que está conectado em Recebimentos:
  - **Pix com Mercado Pago:** Pix do gateway com QR, confirmado sozinho.
  - **Débito ou crédito com Mercado Pago e uma maquininha Point escolhida:** a cobrança vai para a maquininha e é confirmada sozinha (o terminal pergunta as parcelas).
  - **InfinitePay (Pix, débito ou crédito):** link de pagamento com QR, pago no celular da cliente (prazo de 1 hora) e confirmado por webhook.
  - **Sem integração, ou "usar minha chave Pix" / "digitar manualmente":** QR na chave Pix do negócio com confirmação manual, ou o guia do valor para digitar em qualquer maquininha.
  - Com a cobrança pendente a comanda fica travada na tela. **Quando o pagamento é confirmado a comanda fecha sozinha**, com a mesma transação do fechamento manual (caixa, comissão, comprovante e avaliação). Se não puder fechar, o sino avisa e o pagamento continua registrado. Cobranças do saldo e do sinal ficam separadas (`cobrancas_sinal.tipo`).
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
- **Robô de agendamento** (aba Robô, tela única "Menu e mensagens" com o simulador ao lado):
  - menu por segmento, de até 6 opções, com "Remarcar ou cancelar" (remarcar move o agendamento e mantém o sinal), promoções e Instagram; a numeração segue a lista visível;
  - todos os textos que a cliente lê são editáveis, com variáveis e vocabulário do segmento, e voltam ao padrão por campo;
  - agenda pelo WhatsApp com os mesmos horários do painel;
  - **simulador** que não grava nada e avisa "Teste: nada foi agendado";
  - **cobrança de sinal pelo robô (opcional, desligada por padrão):** a dona liga em Ajustes › Recebimentos, no cartão "Sinal no robô", e só com a chave Pix salva. Com ela ligada e um serviço com sinal, o robô cria a reserva `aguardando_pagamento` e manda o Pix (ou o link) pela forma padrão do negócio. Pago o sinal, a cliente recebe a confirmação do agendamento; vencido o prazo, ela é avisada e o horário volta para a agenda. Detalhes em `WHATSAPP_BOT.md`.
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

### Recebimentos (Ajustes › Recebimentos, só administrador)
Mostra os gateways que estão configurados no backend (guias em `docs/mercado-pago-configuracao.md` e `docs/infinitepay-configuracao.md`). O dinheiro cai direto na conta do negócio, e as taxas são do gateway. Cada negócio conecta **um** gateway por vez.

- **Lista de gateways** com logo e situação. Mercado Pago e InfinitePay funcionam; Asaas e PagBank aparecem como "Em breve".
- **Mercado Pago:** passos na tela (conta, chave Pix, **Conectar** pela autorização, escolher Pix e cartão e conferir a conta). O cartão pede o aceite do aviso de contestação. Desconectar apaga os acessos e devolve as reservas pendentes à confirmação manual. Se a autorização vencer, a tela pede "Reconectar" e o sino avisa. Uma rotina diária renova os acessos que vencem em menos de 30 dias.
- **Maquininha Point (Mercado Pago):** o cartão "Maquininhas" lista os terminais da conta, ativa o modo PDV e escolhe o padrão, que cobra o débito e o crédito da comanda.
- **InfinitePay:** o negócio cola a chave (a conexão é conferida na hora) e escolhe Pix e cartão. A cobrança é um link de pagamento com QR. Exige `BACKEND_URL` no backend, porque a InfinitePay avisa os pagamentos nele.
- **Pix manual:** cartão com a chave Pix do negócio, a reserva de quem prefere pagar direto. O sinal sempre exige a chave Pix, mesmo com gateway conectado.
- **Sinal no robô:** interruptor que liga a cobrança de sinal pelo robô do WhatsApp.
- **Sinal da reserva:** reservas com cobrança automática ganham o selo "Automático" em Aguardando Pix, e o botão manual continua como plano B. O Caixa e a ficha mostram a forma do sinal. Se o gateway falhar na reserva, a cliente cai na chave Pix de Minha página.
- **Alertas no sino:** pagamento depois do prazo, em dobro, devolvido ou contestado. O sistema não devolve nem cancela sozinho (a devolução é feita no app do gateway).
- **Conferência:** webhook do gateway mais uma rotina a cada minuto que confirma cobranças em aberto, para cobrir avisos perdidos.

### Minha página (`/dashboard/minha-pagina`)
- Endereço público (`/agendar/[slug]`) com checagem de disponibilidade.
- Logo, cor de destaque, capa, descrição, comodidades, galeria de fotos e endereço. A chave Pix do sinal passou para Ajustes › Recebimentos.
- Seção do clube na página pública.

### Ajustes (`/dashboard/configuracoes`)
Hub de cartões em três grupos, cada cartão abre a sua tela:
- **Sua empresa:** Perfil do negócio (com a logo), Horários de funcionamento, Serviços e equipe e Comissão padrão.
- **Conta e acesso:** Senha e acesso, App da profissional e Plano e cobrança.
- **Clientes e integrações:** Google Agenda, Recebimentos e CRM e etiquetas.

Conteúdo de cada uma:

- **Negócio:**
  - perfil do negócio e da conta, senha e aparência (tema);
  - horários: dias abertos, abertura e fechamento, intervalo e encaixe;
  - CRM: segmento, ciclo de retorno e etiquetas;
  - comissão padrão e modelo de repasse;
  - app da profissional, com a chave "A profissional cobra no app";
  - **Integrações › Google Agenda**.
- **Serviços e equipe** (`/dashboard/servicos`):
  - serviços com preço, duração, sinal (%) e ícone escolhido pelo nome;
  - profissionais com intervalo de almoço, comissão própria, CNPJ (MEI), especialidade e foto (enviada pelo backend);
  - convite para o app da profissional, que já pode ser feito no cadastro de um profissional novo (e-mail do app opcional). Se o e-mail não sair, a dona copia o link do convite.
- **Plano e cobrança** (`/dashboard/planos`):
  - plano, status, próxima cobrança, recursos, forma de pagamento e faturas reais;
  - cancelar e reativar a assinatura;
  - o convite para cadastrar o cartão e ganhar mais 7 dias de teste.
- **Comparação e upgrade** (`/dashboard/planos/comparar`):
  - os 3 planos, a matriz de recursos e o FAQ;
  - upgrade na hora com a diferença proporcional e downgrade na renovação, que pode ser cancelado.

### Google Agenda (fase 7)
- **Conectar:** a dona conecta em Ajustes › Integrações ou no card opcional da etapa Horários do onboarding (todos os planos; a volta da autorização cai em `/onboarding`). Cada profissional conecta no app (Equipe e Salão).
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
  - a dona convida pelo cadastro da profissional. O e-mail sai pelo Resend (API HTTPS) ou por SMTP, e o link também fica disponível para copiar;
  - o link `/convite/[token]` vale 7 dias e só pode ser usado uma vez;
  - a profissional cria a senha e entra;
  - a dona pode reenviar ou revogar o convite e remover ou reativar o acesso.
- **Hoje na bancada:** agenda do dia (e de outros dias), destaque da próxima cliente com alergia, ficha e último trabalho, e "Iniciar atendimento".
- **Hora de atender:** quem passou da hora (até 1 h) fica em destaque, com "Atrasado há X min", e a profissional recebe o push do horário.
- **Novo na bancada:** ela cria um agendamento na própria agenda (serviço, horário livre dela e cliente) e cadastra uma cliente nova na hora.
- **Clientes:** as clientes dela, com ficha rápida, anotação e foto.
- **Atendimento:** comanda com extras, comissão estimada e "Enviar para a recepção". Com a chave "A profissional cobra no app", ela escolhe a forma de pagamento, desconto e gorjeta e fecha a comanda, ou cobra o saldo pelo mesmo painel de cobrança do painel da dona (Pix, Point ou link) e a comanda fecha sozinha.
- **Reagendar e cancelar** os agendamentos dela, com aviso à cliente no WhatsApp.
- **Meus números:** período (quinzena), líquido a receber, composição, adiantamentos, extrato por comanda, avaliações e PDF do extrato. Não mostra o faturamento da casa.
- **Google Agenda** da própria profissional.
- Quem entra com papel `professional` vai direto para `/bancada`. O painel fica fechado para esse papel.

## Páginas públicas (sem login)

- **Landing** (`/`) com planos e preços (Salão "sob consulta"), depoimentos reais e landing por segmento (`/nail-designers`). Há `robots.txt` e `sitemap.xml`.
- **Agendamento público** (`/agendar/[slug]`):
  - a página mostra capa, descrição, comodidades, nota das avaliações, galeria e a cor do negócio; as vagas aparecem por dia e os horários ocupados ficam visíveis;
  - a cliente escolhe o serviço, a profissional e o horário, e informa nome e WhatsApp, em 3 etapas;
  - a caixa de consentimento vem desmarcada;
  - o horário fica reservado por 15 minutos enquanto ela paga o **sinal Pix**, gerado pela chave do próprio negócio;
  - sem gateway conectado, a dona confirma o pagamento no painel (aba Aguardando Pix); com o Mercado Pago ou a InfinitePay conectado, a reserva se confirma sozinha;
  - quando o negócio liberou mais de uma forma, a cliente escolhe Pix ou cartão; no cartão, ela paga no Checkout do Mercado Pago ou no link da InfinitePay e volta para a reserva, que tem endereço próprio;
  - a reserva vencida é cancelada pela rotina de 5 minutos.
- **Adesão ao clube** (`/agendar/[slug]/clube/[ofertaId]`): a cliente escolhe o clube e recebe o Pix. A assinatura começa quando a dona confirma o primeiro pagamento.
- **Retorno do pagamento** (`/pagamento-recebido`): para onde o link de pagamento da InfinitePay devolve a cliente depois de pagar o saldo ou o sinal.
- **Depoimentos da dona sobre o sistema:** a dona recebe um pedido (pop-up que ela pode adiar ou dispensar) e envia o depoimento com autorização de publicação. O SuperAdmin publica, recusa ou corrige, e o publicado aparece na landing (a retirada pode levar até cerca de 10 minutos para sair, por causa do cache). A dona pode retirar o dela.
- **Avaliação** (`/avaliar/[token]`): de 1 a 5 estrelas, com comentário opcional, pelo link do comprovante. Nota baixa gera aviso no sino.
- **Convite da profissional** (`/convite/[token]`).
- **Termos de uso** (`/termos`) e **Política de privacidade** (`/privacidade`). A política explica o uso dos dados do Google.

## SuperAdmin (`/admin`)

Para a equipe da plataforma (`platform_admin`), em três telas do Stitch:
- **Painel de negócios:** métricas da plataforma (MRR, conversão, retenção, negócios em risco), lista com filtros e exportação em CSV, e o detalhe de cada negócio (LTV, uso, sinal Pix, auditoria própria também em CSV). Bloquear, desbloquear e excluir negócio; bloquear e desbloquear usuário.
- **Assinaturas:** ressincronizar com o Asaas, trocar plano, mudar status, cancelar e **definir o valor mensal combinado do Salão**. **Estender o teste** de um negócio (pede o motivo; no teste com cartão, o vencimento da assinatura no Asaas é movido junto).
- **Depoimentos:** fila de moderação (publicar, recusar, corrigir).
- **Logs de auditoria** e **cupons** da assinatura do sistema.

O negócio da própria plataforma fica fora da lista, dos cartões e do MRR. O MRR usa o preço do plano atual e a paginação é em memória (ver `docs/design/SEGUIMENTO.md`).

## Rotinas automáticas

Rodam dentro do processo do backend (`backend/src/services/cronService.ts`, node-cron). Em hospedagem que hiberna, mantenha o processo acordado.

| Frequência | Rotina |
|---|---|
| A cada minuto | Fila de envios do WhatsApp (cadência, janela das 08:00 às 20:00, SAIR e consentimento) |
| A cada minuto | Fotos de perfil do WhatsApp |
| A cada minuto | Agendamentos para o Google Agenda |
| A cada 5 min | Compromissos do Google que bloqueiam horário |
| A cada minuto | Hora de atender: avisa no sino e faz push para a profissional do agendamento |
| A cada minuto | Confere cobranças em aberto (sinal e saldo, Mercado Pago e InfinitePay), para cobrir aviso perdido |
| A cada 5 min | Cancela reservas com o sinal vencido (página pública e robô) e avisa a cliente do robô |
| Diária, 04:00 | Renova os acessos do Mercado Pago que vencem em menos de 30 dias |
| A cada 10 min | Lembretes de agendamento |
| A cada 10 min | Confirmação 24 h antes |
| A cada 15 min | Radar de retorno e aniversários |
| A cada 15 min | Central de conversas: volta ao robô depois de 12 h e finaliza conversas do robô |
| De hora em hora (:15) | Assinaturas avulsas vencidas viram inadimplentes |
| De hora em hora (:20) | Aplica downgrades Pix agendados |
| De hora em hora (:25) | Rotina do clube (cobrança, atraso, vencimento, adesões) |
| Diária, 03:00 | Expira testes grátis sem assinatura (quem cadastrou cartão segue para o Asaas cobrar) |
| Diária, 03:30 | Apaga mensagens com mais de 180 dias |
