# Clube e pacotes (4) Implementation Plan

**Goal:** Clube por assinatura mensal e pacote pré-pago de sessões, só no plano Salão. Venda no balcão e pela página pública, cobrança pela chave Pix do salão com confirmação manual, débito da sessão na comanda e desconto de sócia.

**Spec:** `docs/superpowers/specs/2026-10-24-clube-pacotes-design.md`.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest; Next.js 15, React, Tailwind com tokens, Vitest e Testing Library.

## Global Constraints
- Branch `feat/clube-pacotes`; PR para a `main`, que o dono junta.
- `backend/.env` aponta para **produção**. Nunca rodar `prisma migrate dev/deploy/db push/reset`; só `validate`, `migrate diff --script` e `generate`. A migração `20261026120000_clube_pacotes` só é aplicada com autorização do dono.
- Testes nunca tocam o banco: repositório e serviço do clube mockados com `vi.mock` em todo teste que passa por eles.
- `calcularComanda` sem item coberto dá o mesmo resultado de antes, nas duas cópias.

## Tasks
1. Schema e migração: `clube_ofertas` (com serviços e profissionais), `clube_contratos`, `clube_cobrancas`, `clube_usos`; `comandas.desconto_clube`; `comanda_itens.cobertura_contrato_id` e `valor_coberto`.
2. Regras puras em `backend/src/modules/clube/clube.rules.ts`: valor por sessão, ciclos com dia âncora, validade do pacote, `avaliarCobertura`, `escolherCobertura`, saldo e desconto de sócia.
3. Repositório e serviço:
   - ofertas, contratos, vincular (pago ou Pix a receber), confirmar e reenviar cobrança, cancelar e CSV;
   - rotina de hora em hora: cobrança do próximo ciclo 3 dias antes, atraso, pacote vencido e adesão pendente há 7 dias;
   - `gravarUso` dentro do fechamento da comanda, com trava do contrato; falta que debita.
4. Rotas `/api/v1/clube/*` com `requireFeature('clube')` e papéis; rotas públicas `/public/:slug/clube` com limite de requisições.
5. Comanda: cobertura no DTO, `usarCobertura`, item coberto fora do subtotal, comissão sobre o valor por sessão e recibo.
6. Caixa e relatórios: recebimentos do clube no Caixa, no faturamento, na evolução e nas comissões.
7. Plano e catálogo: recurso `clube: 'premium'` (backend e frontend), sai o "Em breve", `?recurso=clube` na comparação.
8. Frontend:
   - `lib/clube.ts` e proxies em `app/api/clube/*` e `app/api/public/[slug]/clube/*`;
   - `components/clube/*`: abas, Planos e pacotes, modal da oferta, Assinantes, vincular, confirmar cobrança, adesão pública, vitrine e selo;
   - páginas `/clube`, `/clube/assinantes` e `/agendar/[slug]/clube/[ofertaId]`;
   - comanda com selo, chave "Usar clube/pacote", motivo de bloqueio e desconto de sócia;
   - linha "Clube" no Caixa; selo na ficha da cliente e no detalhe do agendamento; notificações e origem "Cobrança do clube" no WhatsApp.
9. Testes:
   - Backend: regras, serviço, rotas, comanda (cálculo, serviço e fechamento), Caixa, relatórios, comissões e status do agendamento.
   - Frontend: telas do clube, adesão, vitrine, selo, comanda com cobertura e themeCompliance.
10. Docs: ROADMAP, SEGUIMENTO e os ajustes na spec.
