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
| **3** | **Relatórios e Comissões (Salão-Parceiro)** | 🔄 Em andamento | branch `feat/relatorios-comissoes` |
| 4 | Clube e pacotes | ⏳ A fazer | — |
| 5 | App da profissional (PWA) | ⏳ A fazer | — |

## Próxima fase: 3

Spec: `docs/superpowers/specs/2026-10-24-relatorios-comissoes-design.md`. Decisões do dono em 24/10:
- O salão-parceiro entra só no plano Salão.
- O repasse tem "Marcar como pago" e adiantamentos, e o Pix é feito por fora.
- O período padrão é a quinzena.
- A tela de Relatórios entra completa.

Referências do Stitch em `docs/design/stitch/projeto/`:

- `studio-aurora-comissoes-e-salao-parceiro-ajustada--f4df6a.html` (a `bd2b20` traz adiantamentos e CNPJ do MEI)
- `studio-aurora-relatorios-e-indicadores-operacionais--a56db8.html`

A 2D (PR #9) foi entregue em 24/10. Os testes de troca de plano no Stripe e no Asaas em modo de teste continuam pendentes em `SEGUIMENTO.md`.

## Itens da lista original (A a I) ainda em aberto

A spec da Fundação (`2026-09-17-fundacao-easyagenda-design.md`) dividiu o relançamento em sub-projetos de A a I. Depois a numeração passou a ser 1, 2A a 2D, 3, 4 e 5. Itens daquela lista que ainda não têm fase própria:

- **C:** segmentos, vocabulário por segmento e onboarding guiado.
- **H:** landing e SuperAdmin. Os planos entram na 2D.
