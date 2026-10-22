# Sub-projetos 2C-2b e 2C-2c — WhatsApp: Automações e Campanhas

Data: 2026-10-21. Branches: `feat/automacoes` (2C-2b) e depois `feat/campanhas` (2C-2c). Os dois saem da `main`, que já tem 2B, 2C-1 e 2C-2a.

## Intenção
A dona liga, numa tela só, as mensagens que o salão manda sozinho em cada etapa da cliente:
- confirmar presença;
- cobrar o sinal;
- chamar de volta quem sumiu;
- avisar a lista de espera;
- lembrar do horário;
- dar parabéns no aniversário;
- pedir avaliação.

Para cada regra ela vê quanto aquilo trouxe de volta em dinheiro e em faltas evitadas.

Nas Campanhas, ela manda uma mensagem para um grupo de clientes (por exemplo, quem sumiu há mais de 60 dias) sem risco de bloqueio do número, porque o envio passa pela mesma fila cadenciada da Hora de voltar.

O dono pediu para seguir o Stitch sem rodada de perguntas ("Pode decidir seguindo o Stitch, sem perguntas"). Todas as decisões marcadas **(decisão do Claude)** são minhas.

Referências visuais (versões novas):
- `docs/design/stitch/projeto/studio-aurora-whatsapp-automacoes-ajustada--07d4c8.html`
- `docs/design/stitch/projeto/studio-aurora-whatsapp-nova-campanha-ajustada--6aa34e.html`

O visual deve ser fiel ao Stitch, com dados reais e os tokens de `docs/design/DESIGN.md`, incluindo o modo escuro.

## Objetivos
1. **Aba Automações** fiel ao Stitch:
   - cabeçalho com "Histórico de disparos" e "Nova automação";
   - 3 cartões de resultado do mês;
   - grade das 7 regras, cada uma com interruptor, número do mês, descrição, prévia da mensagem, quando dispara e "Configurar regra";
   - cartão lateral com o "WhatsApp conectado", "Testar envio" e "Configurações de envio".
2. As 7 regras **funcionando de verdade** no servidor, com o texto editável por negócio.
3. **Aba Campanhas**:
   - lista das campanhas do negócio;
   - "Nova campanha" em 3 passos fiel ao Stitch: público, mensagem com variáveis e prévia realista, programação com cadência;
   - envio pela fila `whatsapp_envios`.
4. As abas do WhatsApp ficam na ordem do Stitch: Hora de voltar · Automações · Campanhas · Conversas · Conexão.

## Não objetivos
- Criar regras novas além das 7 do Stitch. "Nova automação" serve para religar uma das 7 que estiver desligada **(decisão do Claude)**.
- Motor de cupom para clientes. Hoje a tabela `coupons` é só da assinatura do sistema. O "presente" do aniversário é um texto que a equipe honra na comanda **(decisão do Claude)**.
- Página de avaliação por link. A nota é dada respondendo de 1 a 5 no próprio WhatsApp. O `{link_avaliacao}` aponta para o Google do negócio quando estiver configurado **(decisão do Claude)**.
- Anexar imagem nas campanhas e testes A/B.

## Anti-objetivos
- Ligar sozinha, para quem já usa o sistema, uma mensagem que o salão não mandava antes. Na primeira vez, só o **lembrete** fica ligado, porque já funciona hoje. As outras 6 começam desligadas. O "7 ativas" do Stitch é a contagem real **(decisão do Claude)**.
- Disparar em rajada. Tudo que é em massa passa pela fila cadenciada.
- Mandar mensagem de marketing para quem respondeu SAIR ou revogou o consentimento.
- Mostrar número inventado. Todo número vem do banco, e quando é estimativa o rótulo diz "estimado".
- Cancelar o agendamento de alguém por engano. O "2" da confirmação só vale como resposta a uma confirmação enviada nas últimas 24h.

## As 7 regras
Cada regra guarda: ligada ou desligada, texto (opcional; sem texto usa o padrão) e configurações próprias. A dona edita tudo em "Configurar regra". As variáveis entram com chips clicáveis, como no passo 2 da campanha do Stitch.

| Regra (`regra`) | Quando dispara | Como sai | Configuração | Número do cartão |
|---|---|---|---|---|
| `confirmacao`: Confirmação 24h antes | véspera do agendamento confirmado, a partir da hora escolhida (padrão 09:00) | fila, prioridade alta | hora (07:00–12:00) | "N faltas evitadas este mês" |
| `sinal_pix`: Cobrança de sinal Pix | quando a página pública cria reserva `aguardando_pagamento` com sinal | envio direto (transacional) | tolerância 15, 30 ou 60 min (padrão 15) | "R$ X recebidos em sinais" |
| `retorno`: Radar de Retorno | todo dia às 09:00 no fuso do negócio, para as oportunidades da Hora de voltar | fila, prioridade normal | dias: "ciclo da cliente" (padrão) ou personalizado (N dias) | "R$ X recuperados" |
| `lista_espera`: Lista de espera automática | quando um agendamento é cancelado | envio direto | quantas clientes avisar: 1, 3 ou 5 (padrão 3) | "N vagas preenchidas" |
| `lembrete`: Lembrete | "2 horas antes" (padrão, como hoje) ou "véspera às HH:MM" (padrão 18:00) | envio direto (como hoje) | quando | "N lembretes (P% lidos)" |
| `aniversario`: Aniversário da cliente | no dia do aniversário, a partir das 08:00 | fila, prioridade normal | texto do presente (padrão "R$ 20 OFF em qualquer serviço") | "N aniversariantes · M agendamentos" |
| `avaliacao`: Pedido de avaliação | X horas depois de a comanda ser fechada (padrão 2h; opções 1, 2 ou 4h) | fila, prioridade normal | horas; link do Google (opcional) | "Nota média X · N novas avaliações" |

Detalhes por regra:

**Confirmação.**
- A cliente responde "1", "sim" ou "confirmo": o agendamento ganha `client_confirmed_at`, ela recebe "Obrigada! Seu horário está confirmado ✨" e a Agenda mostra o selo "Confirmou pelo WhatsApp".
- Ela responde "2", "não" ou "reagendar":
  - o agendamento é cancelado pelo caminho normal de cancelamento, e isso dispara a lista de espera;
  - a conversa vai para "Aguardando" no atendimento humano, com o aviso do sistema "Pediu para reagendar pelo WhatsApp";
  - ela recebe "Tudo bem! Liberamos seu horário e a equipe já vai falar com você para remarcar."
- Qualquer outra resposta segue o fluxo normal: robô ou humano.
- Só agendamentos `confirmado`, sem confirmação enviada antes, recebem a mensagem. Agendamentos criados já dentro das 24h não recebem.
- Um item que sair da fila depois do horário do atendimento é pulado com o motivo "Horário já passou".

**Sinal Pix.**
- A mensagem leva o valor do sinal, o Pix copia e cola (o mesmo `pixPayload` da página) e o prazo.
- A tolerância configurada passa a ser o tempo de reserva (`HOLD_MINUTES`) da página pública, com a regra ligada ou desligada. O padrão de 15 min mantém o comportamento de hoje **(decisão do Claude)**.
- A mensagem é transacional: a própria cliente pediu a vaga. Por isso não é bloqueada por SAIR, como já acontece com o `pix_recibo`.
- Sem WhatsApp conectado, nada é enviado e a página segue como hoje.

**Radar de Retorno.**
- Usa a mesma lista, o mesmo texto de convite e os mesmos encaixes da Hora de voltar (`retornoService`).
- Só entra quem não recebeu convite (`enviado`) nos últimos 30 dias.
- No modo personalizado, entra quem está há pelo menos N dias sem vir, em vez de quem venceu o ciclo.
- No máximo 30 por dia por negócio. O resto fica para os dias seguintes.
- A Hora de voltar continua manual e convive com a regra. O índice único da fila evita convite duplicado.

**Lista de espera.**
- Quando um agendamento muda para `cancelado`, por qualquer caminho (painel, robô, confirmação "2", PIX vencido não conta), a vaga é oferecida às entradas `aguardando` compatíveis, por ordem de chegada:
  - mesmo serviço, ou serviço com duração igual ou menor à da vaga;
  - profissional igual ou "qualquer";
  - data desejada igual à da vaga ou vazia;
  - período compatível: manhã antes de 12h, tarde das 12h às 18h, noite das 18h em diante, ou "qualquer".
- Só para vagas no futuro e pelo menos 1h à frente.
- A mensagem leva o link da página pública. A primeira que agendar fica com o horário.
- As entradas avisadas ganham `offeredAt` e o status que a lista já usa para "ofertado".

**Lembrete.**
- Mantém o lembrete atual (`runReminderJob`) e acrescenta o modo "véspera às HH:MM".
- O antigo `whatsappReminders` das configurações passa a ser lido como o valor inicial da regra. Depois, a regra vale sozinha.
- O texto antigo `reminderMessage` do robô vira o texto inicial da regra.

**Aniversário.**
- Clientes com dia e mês de nascimento iguais a hoje. Quem nasceu em 29/02 recebe em 28/02 nos anos não bissextos.
- No máximo 1 envio por cliente por ano.

**Avaliação.**
- Disparada pelo fechamento da comanda (`closedAt`), se o agendamento ainda não tem avaliação.
- Resposta de 1 a 5 nas 24h seguintes:
  - grava `WhatsappRating`;
  - responde "Obrigada pela nota!";
  - se a nota for 5 e houver link do Google, manda o link;
  - se a nota for 1 ou 2, a conversa vai para "Aguardando" com o aviso "Avaliação baixa (N) — vale falar com ela" **(decisão do Claude)**.

**Respostas pendentes.**
- A confirmação e a avaliação gravam uma "espera de resposta" (telefone, tipo, agendamento, válida por 24h).
- No processamento de mensagens recebidas, depois do SAIR/VOLTAR e antes do atendimento humano e do robô, uma resposta que bate com a espera é tratada e não segue adiante.
- A espera mais recente vale. Depois de usada, é apagada.

**Bloqueio por SAIR e consentimento.** Valem para `confirmacao`, `retorno`, `lista_espera`, `lembrete`, `aniversario`, `avaliacao` e `campanha`, e não valem para `sinal_pix`. São origens novas no `Origem` da central: `sinal_pix`, `aniversario`, `avaliacao` e `campanha`.

**Prioridade na fila (decisão do Claude).**
- A `whatsapp_envios` ganha `prioridade`: confirmação = 1, regras normais = 5, campanha = 9.
- A fila escolhe por prioridade e depois por `agendadoPara`.
- Cadência, janela 08:00–20:00 e limite por hora continuam valendo.

## Tela de Automações
Fiel ao Stitch. Os pontos de dados:

- **Receita recuperada no mês:**
  - soma do preço dos agendamentos criados no mês e não cancelados, de clientes que receberam `retorno`, `lista_espera`, `aniversario` ou `campanha` nos 7 dias anteriores;
  - mais os sinais pagos no mês de reservas que receberam `sinal_pix`;
  - a variação % compara com o mês anterior;
  - o rótulo do Stitch fica.
- **Faltas e no-shows evitados:** respostas da confirmação no mês, "1" e "2" (o "2" libera a vaga para repasse).
- **Taxa de resposta dos clientes:**
  - % das mensagens automáticas do mês com origem confirmação, avaliação, retorno, aniversário ou lista de espera que receberam resposta da cliente em até 24h;
  - "Média de N minutos" até a resposta;
  - selo: "Excelente" a partir de 80%, "Boa" a partir de 50%, abaixo disso "Baixa".
- **"Regras em Execução · N ativas"** e a nota "Os envios respeitam o limite recomendado por hora".
- **Cartão de regra:**
  - o interruptor liga e desliga na hora (otimista, volta atrás se der erro);
  - o selo mostra "Ativo" ou "Pausado";
  - a prévia mostra o texto da regra com as variáveis em `{chaves}`, como no Stitch.
- **Configurar regra (modal):**
  - texto com chips de variável e contagem de caracteres;
  - campos da regra;
  - prévia com dados de exemplo;
  - "Restaurar texto padrão".
- **Histórico de disparos (modal):** as últimas mensagens automáticas, reaproveitando `historicoEnvios` da central.
- **Nova automação (modal):** lista as regras desligadas, cada uma com "Ativar".
- **Cartão lateral:** número conectado; "Testar envio" manda a prévia da regra escolhida para o número do próprio negócio; "Configurações de envio" abre a aba Conexão.
- **Painéis antigos do robô:** Menu, Mensagens e Simulador saem de Automações e vão para a aba Conexão, na seção "Robô de atendimento" **(decisão do Claude)**. Os textos do robô que viraram regra (lembrete) deixam de aparecer lá.
- Celular: os cartões em coluna e os modais em tela cheia.

## Campanhas
**Lista (decisão do Claude; o Stitch só desenha a criação):**
- cartões com nome, público, status (Rascunho, Agendada, Enviando, Concluída, Cancelada), progresso "enviadas/total" e data;
- ações: "Continuar editando" (rascunho), "Cancelar envio" (agendada ou enviando; cancela os itens ainda na fila) e "Ver detalhes" (enviadas, puladas com motivo, falhas);
- vazio: convite para criar a primeira.

**Nova campanha:** igual ao Stitch.
1. **Público:**
   - segmento: "Não vêm há mais de 30 dias (Em risco)" = última visita entre 31 e 60 dias; "Inativas há mais de 60 dias (Reativação)"; "Aniversariantes do mês"; "Top 10% mais frequentes (VIPs)" = visitas nos últimos 12 meses, no mínimo 1; e "Todas as clientes";
   - filtros "Profissional de preferência" (a que mais atendeu a cliente) e "Último serviço realizado";
   - mostra "N selecionadas" e "✓ M com consentimento ativo receberão (K resguardadas por opt-out)".
2. **Mensagem:**
   - chips `{primeiro_nome}`, `{profissional}`, `{servico}`, `{horarios_livres}` (2 encaixes da semana, como na Hora de voltar) e `{link}`;
   - contagem de caracteres;
   - prévia realista com uma cliente real do público;
   - rodapé automático "Responda SAIR para não receber novidades." (fixo, não editável).
3. **Programação:**
   - data e horário (dentro de 08:00–20:00);
   - cadência 10, 25 ou 60 por hora (padrão 25), com os textos do Stitch;
   - "Salvar como rascunho" ou "Agendar disparo para M clientes".

O nome é gerado automaticamente ("Reativação · 21/10") e editável no topo **(decisão do Claude)**.

Ao agendar:
- o público é recalculado;
- cada mensagem é montada para a sua cliente;
- tudo entra na fila com `lote_id` = id da campanha, `origin` = `campanha`, prioridade 9 e `agendadoPara` = início.

A campanha fica:
- "Enviando" do início até não sobrar item na fila;
- "Concluída" depois disso;
- "Cancelada" pelo botão.

A cadência limita os itens daquele lote por hora. O limite geral do negócio passa a ser o maior entre 25 e a cadência da campanha em envio.

## Dados (migrações; aplicar em produção só com autorização do dono)
**2C-2b:**
- `whatsapp_automacoes`: `id`, `business_id`, `regra` varchar(20), `ativa` bool, `texto` text null, `config` jsonb default '{}', `updated_at`; único (`business_id`, `regra`); RLS como as outras.
- `whatsapp_respostas_pendentes`: `id`, `business_id`, `phone_key`, `tipo` ('confirmacao' | 'avaliacao'), `appointment_id`, `expira_em`, `created_at`; índice (`business_id`, `phone_key`).
- `appointments.client_confirmed_at` timestamptz null e `appointments.confirmation_sent_at` timestamptz null.
- `whatsapp_envios.prioridade` smallint default 5.
- `business_settings.google_review_url` varchar(500) null.

**2C-2c:**
- `whatsapp_campanhas`: `id`, `business_id`, `nome`, `segmento`, `professional_id` null, `service_id` null, `texto`, `inicio_em`, `cadencia`, `status`, `total`, `created_by`, `created_at`, `updated_at`; índice (`business_id`, `created_at` desc); RLS.

## Restrições
- Testes nunca tocam o banco: repositórios e `avatares` mockados, como no 2C-2a.
- Nada de `prisma migrate dev/deploy/db push`. Só `validate`, `migrate diff --script` e `generate`.
- Fuso do negócio em todos os horários (`getBusinessScheduleSettings`/`todayInTimezone`).
- Plano: as mesmas permissões do WhatsApp (`whatsapp_automation`).
- Cores só por token (`themeCompliance.test.ts`).

## Fica com quem constrói
Nomes internos de funções e componentes; o texto padrão exato de cada regra, partindo da prévia do Stitch e trocando valores fixos ("Rua das Flores", "R$ 20") por variáveis ou configuração; a disposição no celular; e a ordem das tarefas.
