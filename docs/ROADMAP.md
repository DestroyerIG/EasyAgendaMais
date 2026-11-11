# Roadmap do EasyAgenda+

As fases do relançamento e o estado de cada uma.

- Cada fase tem spec em `docs/superpowers/specs/` e plano em `docs/superpowers/plans/`.
- As pendências de cada fase entregue ficam em `docs/design/SEGUIMENTO.md`.
- O que o sistema faz hoje, tela por tela, está em `docs/FUNCIONALIDADES.md`.

Atualizado em 11/11/2026.

## Fases

| Fase | Escopo | Estado | Entrega |
|---|---|---|---|
| A | Fundação: marca EasyAgenda+, renomeação para `business`/`professional`, higiene e CI | ✅ Concluída | PR #2 |
| B | Design system e estrutura do painel | ✅ Concluída | PR #2 |
| B2 | Telas idênticas ao Stitch | ✅ Concluída | PR #2 |
| — | Agendamento público com sinal Pix | ✅ Concluída | PR #2 |
| 1 | Bloqueadores de venda (planos, WhatsApp no Solo, cadastro, horário) | ✅ Concluída | PR #3 |
| 2A | Agenda, drawer de detalhes, comanda, caixa, produtos, comissão e status | ✅ Concluída | PR #3 |
| 2B | Hoje, CRM de clientes (lista e fases) e ficha da cliente | ✅ Concluída | PR #4 |
| 2C-1 | WhatsApp: conexão e conversas | ✅ Concluída | PR #5 |
| 2C-2a | WhatsApp: Hora de voltar, fila cadenciada e fotos de perfil | ✅ Concluída | PR #6 |
| 2C-2b | WhatsApp: Automações | ✅ Concluída | PR #7 |
| 2C-2c | WhatsApp: Campanhas | ✅ Concluída | PR #8 |
| 2D | Ajustes › Plano e cobrança, comparação e upgrade | ✅ Concluída | PR #9 |
| 3 | Relatórios e Comissões (Salão-Parceiro) | ✅ Concluída | PR #10 |
| 4 | Clube e pacotes | ✅ Concluída | PR #11 |
| 5 | App da profissional (PWA) | ✅ Concluída | PR #12 |
| 6 | Onboarding guiado, segmentos e vocabulário | ✅ Concluída | PR #17 |
| 7 | Login com Google e Google Agenda | ✅ Concluída | PR #20 |
| H1 | Modo de contingência (carência de 7 dias e conta bloqueada) | ✅ Concluída (migrada e juntada em 28/10) | PR #22 |
| H2 | SuperAdmin nas três telas do Stitch | ✅ Concluída (juntada em 03/11, sem migração) | PR #23 |
| H3 | Textos de venda da landing e da página de nail designers | ✅ Concluída (juntada em 03/11, sem migração) | PR #24 |
| Asaas | Asaas como único meio de cobrança (sai o Stripe) e teste de 7 ou 14 dias | ✅ Concluída (juntada e migrada em 04/11) | PR #26 |
| Salão | Plano Salão sob consulta, com valor combinado por negócio no SuperAdmin | ✅ Concluída (sem migração) | PR #27 |
| Segurança | `/billing/status` deixa de expor o token do cartão | ✅ Concluída (sem migração) | PR #28 |
| Depoimentos | Depoimentos reais das donas (pedido, envio, moderação no SuperAdmin e landing) no lugar dos fictícios | ✅ Concluída (juntada em 04/11; migração `20261105120000_depoimentos`) | PR #33 a #38 |
| Segurança | RLS ligado nas 14 tabelas que ficaram sem ele | ✅ Concluída (juntada e migrada em 05/11, `20261106120000_rls_tabelas_restantes`) | PR #35, #37 |
| Busca | Busca geral do painel: clientes, agendamentos e telas, no computador e no celular | ✅ Concluída (juntada em 05/11, sem migração) | PR #41 |
| Página pública 1 | Página de agendamento fiel ao Stitch com os dados atuais: perfil, 3 etapas e cor do negócio | ✅ Concluída (juntada em 05/11, sem migração) | PR #43 |
| Página pública 2 | Capa, descrição, comodidades, nota, vagas por dia, horários ocupados e confirmação | ✅ Concluída (juntada e migrada em 05/11) | PR #45 |
| Robô 1 | Robô de atendimento: menu pela lista visível, promoções e Instagram, remarcar move o agendamento, simulador que não grava, avaliação só em Automações | ✅ Concluída (juntada em 06/11, sem migração) | PR #47 |
| Robô 2 | Robô de atendimento: menu por segmento (até 6 opções), fonte única `menuPadrao(segmento)`, reordenação com `MENU_DESATUALIZADO` | ✅ Concluída (juntada em 06/11, sem migração) | PR #48 |
| Robô 3 | Robô de atendimento: textos editáveis, respostas das Automações editáveis e tela única (Menu e mensagens + simulador) | ✅ Concluída (juntada em 07/11; migração `20261109120000_robo_textos` aplicada em produção em 07/11, antes do merge) | PR #50 |
| Recebimentos 1 | Mercado Pago: sinal confirmado sozinho no Pix e no cartão, com tela de conexão em Ajustes | ✅ Juntada em 07/11 e migrada. Aplicação do Mercado Pago configurada; falta o teste real com valor baixo (ver `SEGUIMENTO.md`). Guia: `docs/mercado-pago-configuracao.md` | PR #49 |
| Recebimentos 2 | InfinitePay: sinal por Pix ou cartão confirmado sozinho, com tela de conexão em Ajustes e disponibilidade por gateway | ✅ Juntada em 09/11 (sem migração). Exige `BACKEND_URL` no backend; falta o teste real. Guia: `docs/infinitepay-configuracao.md` | PR #58 |
| Ajustes | Hub de cartões em Ajustes, logo do negócio e menu da conta único | ✅ Concluída (juntada em 09/11) | PR #56 |
| Domínio | Domínio novo `easyagendamais.com.br`, `robots.txt` e `sitemap.xml`, Google publicado | ✅ Concluída (09/11) | PR #55, #57 |
| Onboarding 2 | Etapa Recebimentos no onboarding (6 etapas), sinal e chave Pix saem dos serviços, Google Agenda opcional em Horários | ✅ Concluída (juntada em 10/11; migração `20261110120000_onboarding_recebimentos`) | PR #62, #64, #66 |
| Robô 4 | Robô cobra o sinal do agendamento pelo WhatsApp (opcional, desligado por padrão), confirma o agendamento depois do pagamento e avisa quando a reserva expira | ✅ Concluída (juntada em 11/11; migração `20261110130000_bot_cobra_sinal`) | PR #68 |
| Comanda 1 | Cobrar o saldo por Pix com QR Code dentro da comanda, na chave Pix do negócio | ✅ Concluída (juntada em 10/11, sem migração) | PR #67 |
| Comanda 2 | Cobrança do saldo pelo gateway: Pix do Mercado Pago confirmado sozinho, comanda fecha sozinha (migração `20261111120000_cobranca_saldo`) | ✅ Concluída (juntada em 11/11) | PR #69 |
| Comanda 3 | Cobrança do saldo na maquininha Point do Mercado Pago (migração `20261111130000_cobranca_point`) | ✅ Concluída (juntada em 11/11) | PR #70 |
| Comanda 4 | Cobrança do saldo por link de pagamento da InfinitePay, com a página de retorno | ✅ Concluída (juntada em 11/11, sem migração) | PR #71 |
| Agenda | Aviso "Chegou a hora de atender" (faixa na Agenda, sino e push só para a profissional) | ✅ Concluída (juntada em 11/11; migração `20261111140000_aviso_hora_atendimento`) | PR #72 |
| Equipe | E-mail opcional do app no cadastro da profissional, envio pelo Resend (API HTTPS) e link do convite para copiar quando o e-mail não sai; foto da profissional enviada pelo backend | ✅ Concluída (juntada em 11/11, sem migração) | PR #73, #76, #77, #78 |
| Bancada | A profissional cria agendamento e cadastra cliente na própria agenda | ✅ Concluída (juntada em 11/11, sem migração) | PR #79 |
| SuperAdmin | O negócio da própria plataforma sai da lista, dos cartões e do MRR | ✅ Concluída (juntada em 11/11, sem migração) | PR #81 |
| Segurança | RLS na `_prisma_migrations` e fotos no storage só pelo backend (migrações `20261111150000` e `20261111150100`) | ✅ Concluída (juntada em 11/11) | PR #75 |

## Fase 7 (concluída)

Spec: `docs/superpowers/specs/2026-10-26-google-login-agenda-design.md`. Guia de configuração: `docs/google-configuracao.md`.

- PR #20 juntado em 26/10, com a migração `20261029120000_google_agenda` aplicada em produção no mesmo dia.
- O login com Google e a conexão do Google Agenda funcionaram em produção.
- **Domínio novo (09/11):** o sistema passou para https://www.easyagendamais.com.br, com o backend em `api.easyagendamais.com.br`. O `easybarber.tech` foi abandonado.
- **Google em produção (09/11):** marca verificada (o login mostra "EasyAgenda+") e app publicado. Os escopos de agenda são não confidenciais, então não houve verificação de escopos. Testado: o agendamento aparece na agenda "EasyAgenda+" do Google Calendar.

## Próximos passos

- **Testes reais dos recebimentos:** Mercado Pago (Pix, cartão com PKCE e Point) e InfinitePay, com valor baixo. As perguntas em aberto de cada gateway estão em `docs/design/SEGUIMENTO.md`.
- **Fase 2b da cobrança do saldo:** Stone Connect (depende do cadastro de parceiro na Stone) e Pagar.me. Fora do escopo até agora: pagamento dividido, devolução pela nossa tela e escolha de parcelas na cobrança Point.
- **Gateways "em breve":** Asaas e PagBank aparecem em Recebimentos sem funcionar.
- **Landing:** a premissa da calculadora (o sinal e o lembrete evitam 9 em cada 10 faltas) é uma estimativa e deve ser trocada por números de clientes reais quando houver. A seção de depoimentos já mostra só os reais.
- **Várias unidades:** continua "em breve" no plano Salão.
- Conferência das telas com dado real e as demais pendências em `docs/design/SEGUIMENTO.md`.

## Fase 5 (concluída)

Spec: `docs/superpowers/specs/2026-10-25-app-profissional-design.md`. Decisões do dono em 25/10:
- A profissional entra por convite por e-mail, com senha própria ligada ao cadastro dela.
- No fechar atendimento, a dona decide em Ajustes se a profissional cobra no app ou só prepara a comanda (padrão).
- Meus números mostra só a parte dela, sem faturamento da casa.
- O app fica nos planos Equipe e Salão.
- Entram também avaliações das clientes, push de notificação e reagendar ou cancelar pelo app.

Referências do Stitch em `docs/design/stitch/projeto/`:

- `minha-agenda-do-dia-pwa-profissional--2c03bd.html`
- `ficha-rapida-da-cliente-pwa-profissional--4faec7.html`
- `fechar-atendimento-pwa-profissional--29883f.html`
- `meus-numeros-e-comissoes-pwa-profissional--6e6598.html` e `studio-aurora-meus-ganhos-visao-profissional--98d611.html`

A fase 4 (PR #11) foi entregue em 25/10, com a migração já aplicada. A fase 5 (PR #12) também, com a migração `20261027120000_app_profissional` aplicada em 25/10. O dono informou em 26/10 que as chaves VAPID do push já estão em produção, mas isso ainda não foi conferido: basta ver se o botão "Ativar notificações" aparece. A conferência das telas com dados reais continua pendente em `SEGUIMENTO.md`.

## Itens da lista original (A a I) ainda em aberto

A spec da Fundação (`2026-09-17-fundacao-easyagenda-design.md`) dividiu o relançamento em sub-projetos de A a I. Depois a numeração passou a ser 1, 2A a 2D, 3, 4 e 5. Itens daquela lista que ainda não têm fase própria:

- **C:** segmentos, vocabulário por segmento e onboarding guiado. Entregue na fase 6 (`docs/superpowers/specs/2026-10-25-onboarding-design.md`).
- **H:** SuperAdmin, modo de contingência e textos de venda. Entregue nas fases H1, H2 e H3 (PR #22, #23 e #24).
