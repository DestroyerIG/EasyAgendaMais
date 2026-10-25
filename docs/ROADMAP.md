# Roadmap do EasyAgenda+

As fases do relançamento e o estado de cada uma.

- Cada fase tem spec em `docs/superpowers/specs/` e plano em `docs/superpowers/plans/`.
- As pendências de cada fase entregue ficam em `docs/design/SEGUIMENTO.md`.

Atualizado em 24/10/2026.

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
| **6** | **Onboarding guiado, segmentos e vocabulário** | 🔄 Implementada, aguardando migração e PR | branch `feat/onboarding` |

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

A fase 4 (PR #11) foi entregue em 25/10, com a migração já aplicada. A fase 5 (PR #12) também, com a migração `20261027120000_app_profissional` aplicada em 25/10; faltam as chaves VAPID para o push. A conferência das telas com dados reais continua pendente em `SEGUIMENTO.md`.

## Itens da lista original (A a I) ainda em aberto

A spec da Fundação (`2026-09-17-fundacao-easyagenda-design.md`) dividiu o relançamento em sub-projetos de A a I. Depois a numeração passou a ser 1, 2A a 2D, 3, 4 e 5. Itens daquela lista que ainda não têm fase própria:

- **C:** segmentos, vocabulário por segmento e onboarding guiado. Entra na fase 6 (`docs/superpowers/specs/2026-10-25-onboarding-design.md`).
- **H:** landing e SuperAdmin. Os planos entram na 2D.
