# Robô de atendimento (aba Conexão): design

Data: 05/11/2026. O dono pediu a verificação da aba Conexão, aprovou a proposta na conversa e confirmou a divisão entre o que o cliente personaliza e o que fica fixo. Os itens marcados como **(decisão do Claude)** não foram discutidos com ele e estão abertos à revisão.

## Por quê

A aba Conexão mostra o menu do robô, as mensagens editáveis e o simulador. Hoje:

- O menu é uma lista fixa igual para todos os segmentos e tem tom masculino ("Bem-vindo", "Um atendente", 👨‍💼). Para quem não é barbearia, parece um produto feito para outro negócio.
- A tela de mensagens não tem todos os textos. Mais de 15 estão fixos no código, e as respostas das opções do sistema ficam longe da opção.
- A avaliação aparece em três lugares (menu, mensagens e automação), com escalas opostas.
- Há erros que afetam clientes reais: números do menu trocados, notas invertidas, descontos inventados e variáveis enviadas como texto cru.

O resultado esperado é que o dono entenda a conversa do robô olhando uma tela só, e que a cliente receba um atendimento correto e com a cara do negócio.

## Objetivos

1. O número que a cliente digita sempre leva à opção que ela leu.
2. Toda nota gravada usa a mesma escala: 1 a 5, sendo 5 a melhor.
3. Menu e textos padrão se adaptam ao segmento do negócio.
4. Todo texto que a cliente lê é editável, exceto os itens de listas que vêm do cadastro.
5. Cada opção do menu mostra, junto dela, as mensagens do seu caminho.
6. A avaliação é configurada em um lugar só: Automações.
7. Testar no simulador nunca cria dados reais.
8. Nenhum texto padrão promete desconto ou benefício que o negócio não definiu.

## Fora do escopo

- Mudar a sequência do agendamento (serviço, profissional, data, horário).
- Opções próprias com fluxo: uma opção personalizada só responde com texto.
- Inteligência artificial ou entendimento de texto livre.
- Botões interativos do WhatsApp: o robô continua por números.
- Apagar as colunas antigas de avaliação do banco.

## O que o dono personaliza e o que fica fixo

Aprovado pelo dono.

**Personalizável:** nome, emoji, ordem e estado (ligada ou desligada) das opções; criação de opções próprias com resposta em texto; todos os textos do robô; texto de promoções e perfil do Instagram; na avaliação, ligar ou desligar, texto do pedido, agradecimentos, tempo de envio e link do Google.

**Fixo:**

- Ordem do agendamento.
- Itens das listas: serviços, preços, profissionais e horários vêm do cadastro e da agenda. O dono edita o título da lista.
- Numeração do menu: é automática.
- Nota de 1 a 5.
- Avaliação como opção do menu: deixa de existir. Uma opção própria pode falar de avaliação, mas não registra nota.
- Promoções só aparece com texto preenchido, e Instagram só com perfil cadastrado.

Depois de editado, um texto fica como o dono escreveu, mesmo se o padrão ou o segmento mudar.

## Menu novo

Até 6 opções padrão, nesta ordem:

| Ordem | Opção | Regra |
|---|---|---|
| 1 | Agendar | Sempre |
| 2 | Serviços e preços | Sempre |
| 3 | Remarcar ou cancelar | Sempre |
| 4 | Promoções | Só com texto preenchido |
| 5 | Instagram | Só com perfil cadastrado |
| 6 | Falar com a equipe | Sempre |

"Encerrar atendimento" sai do padrão, porque a sessão expira sozinha. "Avaliação pós-atendimento" sai de todos os menus.

### Textos por segmento (decisão do Claude)

| Segmento | Opção 1 | Opção 2 |
|---|---|---|
| Barbearia | 📅 Agendar horário | ✂️ Serviços e preços |
| Unhas | 📅 Agendar horário | 💅 Serviços e preços |
| Cílios e sobrancelhas | 📅 Agendar horário | ✨ Serviços e preços |
| Cabelo | 📅 Agendar horário | 💇 Serviços e preços |
| Estética | 📅 Agendar procedimento | ✨ Procedimentos e preços |
| Outro | 📅 Agendar horário | 📋 Serviços e preços |

As demais opções são iguais em todos: 🔄 Remarcar ou cancelar, 🎉 Promoções, 📱 Instagram, 💬 Falar com a equipe.

As variações ficam junto do vocabulário, em uma fonte única. Hoje a lista padrão está duplicada em `whatsappConstants.ts` e `routes/whatsapp.ts`, e a mensagem de reserva repete tudo em `whatsappFlowService.ts`.

### Remarcar ou cancelar

Uma opção nova junta os dois caminhos. A cliente escolhe o agendamento e depois responde 1 para remarcar ou 2 para cancelar. Com um único agendamento, a lista é pulada **(decisão do Claude)**.

As opções separadas de cancelar e de reagendar continuam funcionando em menus personalizados.

### Quem já usa o sistema

- **Menu nunca personalizado:** recebe o menu novo. Conta como não personalizado o menu com as 9 opções padrão, na ordem, nomes e emojis originais, todas ativas e sem opção própria. Os emojis originais incluem a versão legada, com 💈 em Agendar.
- **Menu personalizado:** mantém tudo, menos a opção de avaliação, que é removida. A numeração é refeita.
- **Sem menu gravado:** o menu é criado na primeira leitura, já pelo segmento.
- **Restaurar padrão:** usa o menu novo do segmento atual e continua excluindo opções próprias, depois de confirmar.
- **Troca de segmento:** o menu não personalizado acompanha; o personalizado não muda.

## Correções

1. **Numeração:** a escolha da cliente passa a ser resolvida pela posição na lista de opções ativas e visíveis, a mesma usada para montar a mensagem. Essa lista é calculada em um único lugar. Promoções e Instagram sem conteúdo ficam fora dela.
2. **Textos que citam número:** "escolha a opção 1️⃣" nas mensagens padrão sai, porque Agendar pode mudar de posição. O texto de erro da avaliação que promete "9️⃣ para encerrar" deixa de existir com a avaliação pelo menu.
3. **Variáveis:** todas as mensagens passam pelo mesmo `formatMessage`, com os dados que aquela mensagem oferece. `{nome_negocio}` passa a funcionar em Promoções e Instagram. `{lista_agendamentos}` sai das dicas, porque a lista é sempre anexada depois do título.
4. **Instagram:** `@seunegocio` deixa de ser enviado. Hoje nenhuma tela grava `Business.instagramHandle`, então a etapa 1 cria o campo "Perfil do Instagram" dentro da própria opção, na aba Conexão, e a rota para salvar **(decisão do Claude)**. A opção aparece se houver perfil cadastrado ou se o dono tiver escrito um texto próprio sem `{instagram_handle}`, para não sumir para quem digitou o @ direto na mensagem **(decisão do Claude)**.
5. **Promoções:** o texto padrão passa a ser vazio. Texto salvo idêntico ao padrão atual conta como vazio, então os descontos inventados param de sair. Nenhum negócio em produção tem a versão legada com R$ 49,90.
6. **Saudação dupla:** a primeira mensagem passa a ter um cumprimento só. O horário de hoje e o aviso de encaixe entram depois dele, em uma linha editável.
7. **Remarcar:** pela leitura do código, remarcar pelo robô hoje não funciona. O caminho cai na criação de agendamento sem `clientId` e nunca usa o `appointmentId` da sessão. Remarcar passa a mover o agendamento existente com `appointmentsService.update`, mantendo o registro e o sinal pago e avisando a profissional **(decisão do Claude)**. O sucesso tem mensagem própria, com serviço, profissional, data e horário.
8. **Tom neutro:** os textos padrão deixam de depender de gênero. Exemplos: "Olá 👋 Que bom ter você aqui!" e "Nossa equipe vai falar com você em breve! 💬". "Dicas de estilo" e "dicas de beleza" saem do texto do Instagram **(decisão do Claude)**.

## Tela nova

A seção "Robô de atendimento" passa a ter duas áreas, com o simulador sempre ao lado no computador e atrás de um botão "Testar" no celular **(decisão do Claude)**.

### Menu e mensagens

- Lista das opções com número real, nome, emoji e interruptor. O número mostrado é o que a cliente verá.
- Mover para cima e para baixo, como hoje.
- `Sistema • view_services` é trocado por uma descrição simples, como "Mostra seus serviços e preços".
- Opção desligada ou escondida por falta de conteúdo fica sem número, com o motivo e o atalho para resolver. Exemplo: "Não aparece: cadastre seu Instagram".
- Ao abrir uma opção, aparecem nome, emoji e as mensagens daquele caminho, na ordem da conversa.

### Mensagens gerais

Textos que não pertencem a uma opção: boas-vindas, pergunta de nome, nome inválido, opção inválida, fora do horário, agenda pausada e erros.

`session_expired_message` sai da tela: o robô não envia esse texto em nenhum ponto, e passar a enviá-lo mudaria o comportamento com quem hoje é ignorado **(decisão do Claude)**.

A política de cancelamento e sinal fica aqui, com o nome "Resposta rápida: Política", porque é usada na central de conversas e não pelo robô.

### Cada campo de mensagem

- Mostra só as variáveis que funcionam nele, como botões que inserem no cursor.
- Tem "Restaurar padrão" individual e o selo "Personalizada" quando foi editado.
- Tem prévia com dados de exemplo.
- Não salva vazio. A exceção são Promoções e a Política, que podem ficar em branco.
- Avisa, sem impedir, quando uma variável importante é apagada ou quando há uma variável desconhecida. Variáveis importantes: `{horario}` e `{data}` na confirmação de agendamento **(decisão do Claude)**.

Só o que o dono mudou de fato é gravado. Campo igual ao padrão do segmento é salvo como vazio no banco.

## Textos novos editáveis

Hoje fixos no código, passam a ser editáveis. Os padrões mantêm o sentido atual, com acentuação corrigida e tom neutro.

| Caminho | Mensagens |
|---|---|
| Serviços | Título da lista, sem serviços cadastrados |
| Agendar | Saudação após o nome, título de serviços, título de profissionais, sem profissionais, título de datas, título de horários, dia fechado, horário recém-reservado, aviso de encaixe, falha ao confirmar |
| Remarcar ou cancelar | Instrução da lista, escolha entre remarcar e cancelar, título da nova data, remarcado com sucesso, erro ao listar |
| Gerais | Fora do horário, horário de hoje, agenda pausada, número inválido em lista |
| Automações | Resposta à confirmação ("confirmado" e "cancelado"), agradecimento da nota, convite ao Google |

O construtor deve fazer uma varredura final dos textos enviados pelo fluxo e incluir os que faltarem nesta lista. A exceção são erros técnicos genéricos, a seu critério.

## Avaliação

Fica só em Automações → Pedido de avaliação, em nota de 1 a 5.

- Saem do menu e da tela de mensagens a opção e os textos `rating_question_message`, `rating_confirmation_message` e `no_previous_appointments_message`. As colunas ficam no banco, sem uso.
- Mensagem de quem ainda tem a sessão antiga em `send_rating`: o robô volta ao menu, sem gravar nota.
- O link da avaliação no comprovante continua igual.
- Agradecimento e convite ao Google ficam no modal da regra, gravados em `config` da automação, sem migração.
- Uma nota gravada nunca é sobrescrita por outro canal. O índice único por agendamento já existe.

Notas antigas: ver "Notas antigas" em Pendências.

## Simulador

- Mostra todas as respostas do robô, não só a última (`botResponses` já chega ao frontend).
- Em modo de simulação, nada é gravado: nem cliente, nem agendamento, nem cancelamento, e nenhum gatilho de automação é disparado. Só a sessão temporária existe, com os dados da conversa.
- Ao terminar um agendamento simulado, mostra a confirmação com o aviso "Teste: nada foi agendado".
- Para testar remarcar ou cancelar, usa um agendamento de exemplo fictício **(decisão do Claude)**.
- Com alterações não salvas, avisa: "O teste usa as mensagens salvas".
- Ao limpar a conversa, reinicia também a sessão do simulador.

## Como os dados ficam

- Textos novos: uma coluna JSON nova em `whatsapp_bot_config`, com chave por mensagem, em vez de dezenas de colunas **(decisão do Claude)**. Exige migração, que só roda em produção com autorização do dono.
- `getBotConfig` continua devolvendo o texto final, mas a tela também recebe, para cada campo, o padrão do segmento e se ele foi personalizado.
- **Textos congelados:** o botão Salvar atual grava todos os campos, então texto igual ao padrão antigo não indica edição real. Ao ler ou migrar, um valor igual ao padrão atual, inclusive na versão adaptada ao segmento, conta como não personalizado. A consulta em produção não achou textos legados, então não é preciso comparar com versões mais antigas.
- Os textos padrão do segmento ficam ao lado de `mensagensPadrao` em `whatsappVocabulario.ts`, que hoje só cobre 3 mensagens e deixa o segmento `outro` de fora.

## Ordem de entrega (decisão do Claude)

Cada etapa é um PR para a `main`, a partir de uma branch nova, separada de `feat/pagina-publica-stitch`.

1. **Correções sem migração:** numeração, variáveis, campo do Instagram, promoções, remarcar, simulador sem gravar, avaliação fora do menu e nota única.
2. **Menu por segmento:** menu novo, Remarcar ou cancelar, tratamento de quem já usa.
3. **Textos e tela:** migração, textos novos e tela reorganizada.

## Testes e conferência

- Backend: numeração com opções desligadas e escondidas; escala de notas; remarcar sem duplicar agendamento; substituição das variáveis em toda mensagem; simulação sem nenhuma escrita em clientes, agendamentos e avaliações; detecção de menu e textos não personalizados.
- Frontend: lista com números reais, editor por opção, restaurar padrão, aviso de não salvo e simulador com várias respostas.
- Conferência visual local no fim das etapas com tela, a 320 px e no computador, nos segmentos barbearia e estética.
- Atualizar `docs/ROADMAP.md`, `docs/design/SEGUIMENTO.md` e `WHATSAPP_BOT.md`.

## Situação em produção

Consulta somente leitura feita em 05/11/2026, com autorização do dono, usando um papel que ignora o RLS:

| Item | Resultado |
|---|---|
| Negócios | 8, com 9 clientes e 14 agendamentos no total |
| Notas gravadas | 0, então não há nota invertida para corrigir |
| Pedidos de avaliação enviados | 0 |
| Instagram cadastrado | 0 negócios |
| Menus gravados | 1, no formato padrão, com 💈 e opção de avaliação ativa |
| Configurações de mensagens | 1, sem textos legados |
| Configurações do negócio | 1 de 8; os demais caem no segmento `outro` |
| Número do simulador | 1 cliente e 1 agendamento concluído |

Como quase nada está gravado, a transição de quem já usa tem baixo risco, mas as regras acima continuam valendo para os negócios que entrarem até a entrega.

## Pendências

- **Dados do simulador:** o cliente e o agendamento do número `5511999999999` só saem de produção com autorização do dono, fora dos PRs.
- **Nota baixa:** a automação alerta em nota até 2, e o link em nota até 3. Unificar fica fora deste trabalho.
