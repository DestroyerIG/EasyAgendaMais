# Relatórios e Comissões (3) Implementation Plan

**Goal:** Comissões com apuração por profissional, repasse marcado como pago, adiantamentos e modo salão-parceiro (plano Salão); Relatórios com indicadores, mapa de ocupação, origem dos agendamentos e evolução de 6 meses. Tudo com dado real.

**Spec:** `docs/superpowers/specs/2026-10-24-relatorios-comissoes-design.md`.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest; Next.js 15, React, Tailwind com tokens, jsPDF, Vitest e Testing Library.

## Global Constraints
- Branch `feat/relatorios-comissoes`; PR para a `main`, que o dono junta.
- `backend/.env` aponta para **produção**. Nunca rodar `prisma migrate dev/deploy/db push/reset`; só `validate`, `migrate diff --script` e `generate`. A migração `20261025120000_relatorios_comissoes` só é aplicada com autorização do dono.
- Testes nunca tocam o banco: repositório mockado com `vi.mock`.
- Valores em centavos nas regras; nada de recalcular comissão de comanda fechada.

## Tasks
1. Schema e migração: `business_settings.modelo_repasse`, `professionals.cnpj` e `especialidade`, tabelas `repasses`, `adiantamentos` e `repasse_adiantamentos`.
2. Regras puras em `backend/src/modules/reports/`:
   - `periodo.ts`: quinzenas, mês, 30 dias, período anterior e intervalo UTC no fuso do negócio.
   - `comissoes.rules.ts`: apuração, consumo dos adiantamentos, totais, status e diferença desde o pagamento.
   - `indicadores.rules.ts`: ticket, faltas, retorno no ciclo, meta mensal, projeção, origem, mapa de ocupação, insight e pico.
3. Repositório e serviços:
   - `reports.repository.ts`.
   - `comissoes.service.ts`: apuração, pagar com a chave única e a transação, desfazer, adiantamentos e modelo.
   - `relatorios.service.ts`: visão geral, ocupação e evolução.
4. Rotas `/api/v1/reports/*`:
   - leitura com `requireFeature('reports')`;
   - ações com `requireRole(['tenant_admin'])`;
   - CSV para o contador (`comissoes.csv.ts`).
5. Plano e catálogo:
   - recurso `salao_parceiro: 'premium'` (backend e frontend);
   - salão-parceiro deixa de ser "Em breve";
   - `?recurso=salao_parceiro` na comparação.
6. Profissional: CNPJ (MEI) validado e guardado só com os dígitos, e especialidade. Os dois entram no schema, no serviço, no repositório e no modal.
7. Frontend:
   - `lib/relatorios.ts` e `lib/relatoriosPdf.ts`;
   - proxies em `app/api/reports/*`;
   - `components/relatorios/*`: abas, seletor de período, Comissões, modais de pagamento e de adiantamento, e Relatórios;
   - páginas `/relatorios` e `/relatorios/comissoes`.
8. Testes:
   - Backend: regras, serviço de comissões, serviço de relatórios e rotas.
   - Frontend: Comissões, Relatórios, modal da profissional e themeCompliance.
9. Docs: ROADMAP, SEGUIMENTO e os ajustes na spec.
