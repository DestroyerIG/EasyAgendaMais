# Item H: SuperAdmin, modo de contingência e textos de venda

Data: 28/10/2026. Último item da lista original (A a I) da spec da Fundação (`2026-09-17-fundacao-easyagenda-design.md`) que ainda não tinha fase.

O dono pediu para pular as perguntas. Este documento traz só decisões do Claude, cada uma marcada como **(decisão do Claude)** quando não é uma consequência direta do código ou das referências. Elas podem ser revistas na leitura.

## Por que agora

Todas as telas do painel, do agendamento público, do app da profissional e do onboarding já seguem o Stitch. Faltam três coisas antes de vender para clientes reais:

1. **A cobrança que falha derruba o painel na hora.** Hoje, `past_due`, `unpaid` e `pending` liberam só `billing` e `subscription_status` (`backend/src/config/planPermissions.ts` e `frontend/src/lib/subscriptionAccess.ts`). Um cartão recusado tranca a agenda do dia no meio do expediente. Ao mesmo tempo, o link público, o robô e as rotinas do WhatsApp não olham a assinatura: continuam funcionando para sempre, até para conta cancelada. O sistema é duro onde machuca a cliente pagante e frouxo onde perde receita.
2. **O SuperAdmin está no visual antigo** (`frontend/src/app/admin/`: ícones `lucide`, cores cinza fixas, `ForcedDark`) e não responde às perguntas do dono da plataforma: quanto entra por mês, quem está para virar cliente pagante e quem está para ir embora.
3. **A landing promete coisas que o sistema não faz** ou não faz naquele plano.

## Divisão em três partes

As três partes são independentes e vão em PRs separados, nesta ordem **(decisão do Claude)**:

| Parte | O quê | Por que nessa ordem |
|---|---|---|
| H1 | Modo de contingência da assinatura vencida | Protege a receita e a cliente pagante; tem backend e migração |
| H2 | SuperAdmin nas três telas do Stitch | Usa o estado de contingência de H1 nos filtros e alertas |
| H3 | Textos de venda da landing e da página de nail designers | Pequena, só frontend; pode sair a qualquer momento |

Cada parte tem o próprio plano em `docs/superpowers/plans/`.

---

## H1. Modo de contingência

### Referências

- `docs/design/stitch/projeto/studio-aurora-assinatura-vencida-modo-de-contingencia-corrigida--2f4a56.html` (computador)
- `docs/design/stitch/projeto/studio-aurora-assinatura-vencida-modo-de-contingencia-mobile--702444.html` (celular)

### Intenção

Quando a cobrança de uma cliente que já pagou falha, o sistema não a constrange diante das clientes dela. Ela continua atendendo quem já está marcado, vê a agenda e as fichas, baixa os dados dela e paga com um toque. Enquanto isso, o que gera trabalho novo para a plataforma (agendamento novo, campanha) fica pausado. Depois da carência, o bloqueio é real em todos os canais, não só no painel.

### Quem entra em contingência

Entra em contingência o negócio que **já pagou alguma vez** (`last_payment_date` preenchido ou um `BillingPayment` confirmado) e está com status `past_due`, `unpaid` ou `pending`.

- `pending` entra porque gerar a cobrança Pix do mês seguinte marca a assinatura como `pending` (pendência registrada no `SEGUIMENTO.md`, sub-projeto 2D). Sem isso, a cliente do Pix seria bloqueada ao gerar a própria cobrança.
- **Fim do teste grátis sem pagamento** (`incomplete` sem pagamento anterior) e **`canceled`** não entram: continuam com o bloqueio de hoje, mais o backup de dados (abaixo).

### Linha do tempo

1. **Início:** a primeira vez que o negócio passa de `active`/`trialing` para um status de contingência. Grava `inadimplente_desde` (coluna nova em `businesses`, `timestamptz`, nula). Volta a nulo quando o status volta para `active`. Se o status mudar entre `past_due`, `unpaid` e `pending`, a data não muda.
2. **Carência de 7 dias** a partir de `inadimplente_desde` **(decisão do Claude;** o Stitch mostra "5 dias restantes" sem dizer o total). O prazo fica numa constante única no backend, como `TRIAL_DAYS` em `backend/src/config/trial.ts`.
3. **Depois da carência:** bloqueio total, igual ao de hoje no painel, e agora também no link público, no robô e nas rotinas.
4. **Pagamento confirmado** (webhook do Stripe ou do Asaas, ou ação do SuperAdmin): tudo volta na hora. Nada do que foi pausado é reenviado.

### O que funciona em cada estado

| | Ativo / teste | Carência | Depois da carência, fim do teste, cancelada |
|---|---|---|---|
| Ver agenda, clientes e fichas | sim | sim, só leitura | não |
| Concluir atendimentos já marcados para hoje (status, comanda, caixa do dia) | sim | sim **(decisão do Claude)** | não |
| Criar, remarcar ou editar agendamento, cliente, serviço etc. | sim | não | não |
| Lembretes e confirmações de agendamentos já marcados | sim | sim | não |
| Novo agendamento pelo link público e pelo robô | sim | não | não |
| Campanhas, Hora de voltar, radar, aniversário, avaliação, lista de espera | sim | pausados | não |
| Conversas do WhatsApp (ler e responder à mão) | sim | sim **(decisão do Claude)** | não |
| App da profissional (`/bancada`) | sim | só leitura e concluir os atendimentos de hoje | não |
| Pagar (Pix, outro cartão) e ver faturas | sim | sim | sim |
| Baixar backup dos dados | sim | sim | sim |

"Concluir atendimentos de hoje" existe porque a promessa do Stitch é "sua operação de hoje continua preservada": uma cliente na cadeira precisa sair com a comanda fechada. Vale só para agendamentos com início no dia local do negócio que já existiam antes de `inadimplente_desde`.

### Backend

- **Estado único.** Uma função (em `featureAccessService` ou vizinha) devolve o estado da conta: `ativa`, `carencia` (com `diasRestantes`) ou `bloqueada`. Middleware, link público, robô, fila e rotinas usam essa mesma função. Nenhuma regra é repetida.
- **Permissões.** O `STATUS_FEATURE_ALLOWLIST` passa a depender do estado, não só do status. Na carência entram leituras e um conjunto pequeno de escritas liberadas (status do agendamento, comanda e caixa do dia, mensagem manual nas conversas). Toda escrita fora desse conjunto responde `402 SUBSCRIPTION_REQUIRED` com `details: { estado: 'carencia' }`, para o frontend mostrar o aviso certo.
- **Link público e robô** (`modules/publicBooking`, `bot`): sem permissão para agendamento novo, a página pública mostra "A agenda online está pausada no momento. Fale direto com {nome do negócio} pelo WhatsApp." com o botão do WhatsApp do negócio, sem citar pagamento **(decisão do Claude:** a cliente final não precisa saber da cobrança). O robô responde a mesma frase no lugar do menu de agendar.
- **Fila e rotinas** (`whatsappFila`, `whatsappAutomacoes/rotinas`, `whatsappCampanhas`, `whatsappRetorno`):
  - na carência, só saem as origens `lembrete` e `confirmacao` e o `pix_recibo`; o resto fica parado na fila;
  - depois da carência, nada sai;
  - os itens parados não vencem nem são apagados: voltam a sair se a conta for regularizada, e o filtro de "fora da véspera" que já existe descarta o que perdeu o sentido. Campanhas agendadas cujo início passou durante o bloqueio continuam de onde pararam.
- **Backup dos dados.** `GET /conta/backup` devolve um `.zip` com CSVs: clientes, agendamentos, serviços, profissionais, comandas com itens, movimentos de caixa e despesas. Mesmos separadores e codificação do CSV do contador da fase 3. Funciona em qualquer status de assinatura e em qualquer plano, inclusive no Solo **(decisão do Claude:** é o "direito incondicional" que a tela promete; não é o recurso `exports`, que continua no Equipe). Só a dona baixa, não a profissional. Fica registrado no `AuditLog`.
- **Migração:** só adição da coluna `inadimplente_desde`, com backfill. Os negócios que já estão em `past_due`/`unpaid`/`pending` com pagamento anterior recebem `subscription_updated_at` como início. Assim, quem já está vencido há mais de 7 dias entra direto no bloqueio total, que é o que acontece hoje no painel. Aplicar em produção só com autorização do dono (regra do projeto).

### Frontend

- **Tela `/dashboard/assinatura`** fiel ao Stitch (as duas versões), aberta como primeira tela do painel enquanto houver contingência. Mostra:
  - a carência com dias restantes;
  - o motivo, com data e plano reais vindos de `/billing`;
  - "O que continua liberado", com textos que batem com a tabela acima;
  - o Pix do valor da mensalidade (reaproveita "Gerar cobrança Pix" da tela de Plano) e "Pagar com outro cartão" (portal do Stripe, só para quem paga no cartão);
  - o backup e o suporte no WhatsApp (só com `NEXT_PUBLIC_SUPPORT_WHATSAPP` configurado, como já acontece em Plano).
- **Faixa fixa no topo** de todas as telas do painel durante a carência: "Modo contingência · {n} dias para regularizar" com o botão "Regularizar". A dona navega normalmente; os botões de escrita bloqueados aparecem desabilitados com a dica "Disponível depois de regularizar".
- **Depois da carência:** a mesma tela, sem "O que continua liberado", com o texto do bloqueio e o backup. Fim do teste e cancelada usam a mesma tela com os textos de cada caso. O `SubscriptionBlockCard` continua só para recurso fora do plano.
- **Desvios do Stitch** (o sistema só afirma o que faz):
  - "Excel/CSV" vira "CSV (abre no Excel)";
  - "Código válido pelas próximas 24 horas" usa a validade real do Pix do Asaas;
  - "Sem juros ou encargos" fica, porque o sistema não cobra juros;
  - "Volte ao normal em 1 minuto" vira "assim que o pagamento for confirmado";
  - "Seus dados nunca são deletados" sai: a conta excluída pelo SuperAdmin é apagada de forma lógica e não há política escrita de retenção.

### Fora de H1

- Boleto, Pix Automático e cobrança recorrente no Pix.
- Avisos por e-mail ou WhatsApp para a dona antes do vencimento.
- Mudar a quantidade de tentativas de cobrança do Stripe (configuração no painel do Stripe; o roteiro de teste deve anotar o que está configurado).

---

## H2. SuperAdmin

### Referências (usar as versões "ajustada")

- `easyagenda-superadmin-visao-geral-de-operacoes-ajustada--5f2465.html`
- `easyagenda-superadmin-gestao-de-negocios-e-assinantes-ajustada--9e95f6.html`
- `easyagenda-superadmin-detalhes-do-negocio-sa-2041-ajustada--b916d3.html`

### Intenção

O dono da plataforma abre o SuperAdmin para responder três perguntas: quanto entra por mês, quem está perto de virar cliente pagante e quem está perto de ir embora. Em cada caso ele age na hora (avisar no WhatsApp, estender o teste, bloquear, sincronizar). Todo número na tela vem do banco. Nenhum número é inventado para preencher o layout.

### Navegação

| Hoje | Passa a ser |
|---|---|
| `/admin` (Resumo) e `/admin/metrics` | `/admin`: Visão geral (Stitch 1) |
| `/admin/tenants` e `/admin/subscriptions` | `/admin/negocios`: Gestão de negócios (Stitch 2) |
| detalhe em modal | `/admin/negocios/[id]`: Detalhes do negócio (Stitch 3) |
| `/admin/coupons`, `/admin/logs` | ficam, com o visual novo (tokens e Material Symbols), sem referência própria |

As rotas antigas redirecionam para as novas. O `ForcedDark` sai do admin, que passa a seguir o tema do aparelho como o painel **(decisão do Claude)**.

### Visão geral (`/admin`)

- **MRR:** soma do preço do catálogo (`planCatalog.ts`) dos negócios `active`, mais os que estão em carência. Variação contra o mês anterior, recalculada a partir de `BillingPayment`.
  - Os blocos do Stitch "Novos" e "Churn" entram: MRR de quem pagou pela primeira vez no período e de quem cancelou ou foi para o bloqueio total.
  - **"Expansão" sai**, porque não há histórico confiável de troca de plano para medi-la **(decisão do Claude)**. Volta se a 2D passar a gravar as trocas.
- **Testes grátis ativos** e "vencendo em 48 h".
- **Conversão do teste para pago:** negócios criados no período que têm pagamento confirmado, sobre os criados no período. Por segmento, com os 5 segmentos da fase 6 mais "outro" (`business_settings.segment`). A "Meta base (25%)" do Stitch vira uma constante no frontend.
- **Cancelamentos do mês** e retenção.
- **Negócios em risco:** tabela com o alerta, há quanto tempo, o MRR e a ação recomendada. Regras **(decisão do Claude)**:
  - em carência ou bloqueado por cobrança;
  - WhatsApp desconectado há mais de 2 dias (`whatsapp_connected_at` nulo e última conexão conhecida);
  - nenhum agendamento criado em 7 dias por um negócio pagante;
  - teste vencendo em 48 h sem onboarding concluído.
- **Ação "Avisar no WhatsApp":** abre o `wa.me` do WhatsApp do dono do negócio com um texto pronto por tipo de alerta. Não usa a instância do WhatsApp da plataforma.
- **Saem do Stitch:** "Disparar resgate em lote", "Exportar BI" e "Tempo real · atualizado há 2 min". O último vira "Atualizado às HH:MM" com um botão de recarregar.

### Gestão de negócios (`/admin/negocios`)

- **Cartões:** base total, assinaturas ativas (com MRR e ticket médio), testes em andamento e alerta de inadimplência (contagem, valor pendente, quantos já em bloqueio total).
- **Filtros:**
  - segmento (pílulas com contagem);
  - busca por nome, e-mail, WhatsApp ou CPF/CNPJ;
  - status: Ativo, Teste, Em carência, Bloqueado por cobrança, Bloqueado pelo admin, Cancelado;
  - plano.
- **Colunas:**
  - negócio e cidade (cidade só se `address` existir; não há campo de cidade);
  - segmento;
  - plano e valor real do catálogo (não há plano anual: o "Solo Anual" do Stitch sai);
  - status;
  - saúde do WhatsApp, pelo dado gravado (`whatsapp_connected_at`), sem consultar a Evolution linha a linha;
  - agendamentos em 30 dias;
  - última atividade;
  - ações.
- **Paginação no servidor** (6, 20, 50, 100) e **Exportar CSV** do filtro atual.
- **"+ Novo negócio manual" sai** **(decisão do Claude):** criar conta sem passar pelo cadastro e pelo onboarding pula a criação do usuário no Supabase e as regras da fase 6.

### Detalhes do negócio (`/admin/negocios/[id]`)

- **Cabeçalho:** nome, dono, e-mail, WhatsApp, endereço e status. O id curto aparece como os 8 primeiros caracteres do UUID, e não "#SA-2041". "Engine v2.8.4 · Gateway sincronizado" sai.
- **Cartões:**
  - plano atual;
  - LTV (soma dos `BillingPayment` confirmados e quantidade de ciclos);
  - WhatsApp (conectado ou não e desde quando; a latência sai, como já foi decidido no 2C-1).
- **Ações de SuperAdmin:**
  - **Estender teste grátis:** nova rota; só para `trialing` ou `incomplete` sem pagamento; de 1 a 30 dias, com motivo obrigatório.
  - **Bloquear/desbloquear acesso:** rotas existentes.
  - **Sincronizar com o gateway:** `resync` existente.
  - **Mudar plano e status à mão:** rotas existentes.
  - **Cancelar:** rota existente.
  - Toda ação pede motivo e grava no `AuditLog`, como hoje.
- **Saem do Stitch:**
  - **"Login como negócio":** acessar a conta de outra pessoa exige consentimento, trilha e expiração próprios; fica fora **(decisão do Claude)**.
  - **"Aplicar cupom/desconto" numa assinatura já existente:** os cupons de hoje valem no checkout; aplicar em assinatura do Stripe e em cobrança do Asaas é outro trabalho. O modal sai. A página `/admin/coupons` continua.
- **Linha do tempo de cobrança:** faturas reais (o mesmo serviço de `/billing/invoices`, consultado pelo id do negócio) e a próxima cobrança. "2ª via da fatura" abre o link da fatura (Stripe) ou o Pix (Asaas) quando houver.
- **Uso em produção:**
  - profissionais ativas e o limite do plano;
  - adesão ao sinal Pix (agendamentos com sinal sobre o total do mês);
  - clientes na base e novas no mês;
  - lembretes ligados ou não;
  - endereço da página pública (`/agendar/{slug}`, com o domínio de `FRONTEND_URL`).

  A "taxa de entrega 99,4%" vira a contagem de enviados contra falhos da fila no mês.
- **Auditoria:** os registros do `AuditLog` daquele negócio, com os filtros Todos, Financeiro, Sistema e Operador, e exportação em CSV.
  - O bloco "Segurança de dados e LGPD" do Stitch sai: afirma anonimização por nível de agente e região da AWS, e nada disso existe.

### Backend

- As consultas novas entram em `adminRepository.ts` com SQL do Prisma, como as que já existem. Lembrar que o banco guarda `created_at` sem fuso (pendência já registrada).
- A rota nova é `PATCH /admin/tenants/:id/trial` (estender teste). Ampliar `GET /admin/tenants` (filtros, paginação, colunas novas), `GET /admin/tenants/:id` (LTV, uso, faturas, auditoria) e `GET /admin/metrics` (MRR, conversão por segmento, em risco). Não há migração.
- `routes/admin.ts` continua protegido por `authMiddleware` e `requireAdmin`, e o frontend por `useRequireRole(['platform_admin'])`.

---

## H3. Textos de venda

### Intenção

Ninguém assina por causa de algo que o sistema não faz. É a mesma regra aplicada às boas práticas do WhatsApp no 2C-1: só afirmar o que existe, no plano em que existe.

### Escopo

`frontend/src/app/page.tsx`, `frontend/src/components/marketing/` (landing, `PricingPlansSection`, rodapé e barra) e `frontend/src/app/nail-designers/page.tsx`.

### Correções já identificadas

| Onde | Hoje | Passa a ser |
|---|---|---|
| Plano Salão | "Várias unidades" | "Várias unidades (em breve)", igual ao `planCatalog.ts` |
| Plano Salão | "Suporte prioritário" | sai: não há fila nem canal diferente **(decisão do Claude)** |
| Plano Equipe | "Lista de espera", "Campanhas" | vão para a lista do Solo, porque funcionam em todos os planos. Tirar do Solo seria decisão de venda, já registrada no `SEGUIMENTO.md` |
| Rodapé | "100% em Conformidade LGPD" | "Dados tratados conforme a LGPD", com link para `/privacidade` |
| Lista de espera (dor 03) | "Disparo de aviso simultâneo" | descrever o comportamento real da automação da lista de espera |

As listas de recursos dos cards devem sair do `planCatalog.ts`, por `GET /billing/plans` ou por uma cópia tipada no frontend com teste de igualdade, e não de `PLAN_DISPLAY` escrito à mão. Assim a landing e a comparação de planos não divergem de novo.

### Revisão completa

Quem implementar relê cada frase das duas páginas contra o sistema e a corrige quando não bater. Os pontos mínimos:

- a calculadora de retorno (`RoiCalculator`): as premissas precisam aparecer na tela;
- o simulador do WhatsApp: a mensagem "Te avisamos 24h antes" depende da confirmação, que começa desligada;
- os números da página de nail designers;
- "Sem cartão de crédito · Cancele quando quiser".

Cada mudança entra numa tabela "antes e depois" no PR para o dono aprovar. A troca dos ícones `lucide` da landing por Material Symbols entra junto.

### Fora de H3

- Passada geral nos textos dos botões do painel (item 1 das decisões do `SEGUIMENTO.md`): ela pede aprovação própria.
- Página por segmento além de nail designers.

---

## Anti-objetivos

- Mostrar número inventado em qualquer tela do SuperAdmin ou da contingência para preencher o layout do Stitch.
- Constranger a cliente final: nada sobre pagamento atrasado aparece no link público nem no robô.
- Prender os dados da dona: o backup nunca depende do status nem do plano.
- Bloquear no meio de um atendimento: a carência existe para a dona terminar o dia.

## Riscos

| Risco | Cuidado |
|---|---|
| Negócios hoje em `past_due` há semanas perdem também o link público quando H1 entrar | Antes do deploy, listar no SuperAdmin quantos estão nessa situação e avisar o dono |
| Webhook atrasado deixa uma conta paga em contingência | O botão "Já paguei" da tela chama a consulta do gateway existente (`resync`) antes de exibir o bloqueio |
| A regra de escrita liberada na carência vaza para outras rotas | Teste por rota: toda rota de escrita sob `subscriptionGuard` responde 402 em carência, exceto a lista liberada |
| SQL das métricas nunca rodou num banco real (mesmo caso do 2C-2b) | Conferir os números do SuperAdmin contra contagens manuais na primeira semana |

## Como conferir

- **H1:**
  - testes do estado da conta (datas na borda dos 7 dias, volta para ativo, `pending` com e sem pagamento anterior);
  - testes do 402 por rota;
  - testes do bloqueio no link público, no robô e na fila;
  - conferência visual da tela e da faixa nos três estados;
  - em produção, um negócio de teste com o status trocado pelo SuperAdmin.
- **H2:** testes das consultas novas com o repositório mockado, como o projeto já faz, e conferência visual com dados do mock local.
- **H3:** a tabela "antes e depois" aprovada pelo dono e o teste de igualdade com o `planCatalog.ts`.
