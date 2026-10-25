# App da profissional (5) Implementation Plan

**Goal:** A profissional entra por convite, usa o app `/bancada` no celular (agenda do dia, ficha rápida, fechar atendimento, meus números), reagenda e cancela os agendamentos dela e recebe push. As clientes avaliam o atendimento por um link no comprovante.

**Spec:** `docs/superpowers/specs/2026-10-25-app-profissional-design.md`.

**Tech Stack:** Express, Prisma 5 (PostgreSQL), Zod, Vitest, web-push; Next.js 15, React, Tailwind com tokens, jsPDF, Vitest e Testing Library.

## Global Constraints
- Branch `feat/app-profissional`; PR para a `main`, que o dono junta.
- `backend/.env` aponta para **produção**. Nunca rodar `prisma migrate dev/deploy/db push/reset`; só `validate`, `migrate diff --script` e `generate`. A migração `20261027120000_app_profissional` só é aplicada com autorização do dono.
- Testes nunca tocam o banco: repositórios, Supabase e web-push mockados com `vi.mock`.
- O papel `professional` nunca passa por `requireTenantRoles`. Toda rota `/bancada` pega a profissional do login, nunca do corpo ou da URL.

## Tasks
1. Schema e migração: `users.professional_id`, `profissional_convites`, `business_settings.profissional_cobra`, `comandas.enviada_recepcao_em` e `avaliacao_token_hash`, `whatsapp_ratings.origem`, `push_inscricoes`.
2. Papel e plano: `UserRole` ganha `professional`; recurso `app_profissional: 'profissional'` (backend e frontend).
3. Convite (`modules/equipe`): criar, reenviar, revogar, remover acesso, estado por profissional; aceite público que cria o usuário no Supabase já confirmado e abre a sessão; e-mail do convite.
4. Push (`modules/push`): chave pública, inscrições, envio para a equipe junto do `notify` e para a profissional; inscrição apagada no 404/410.
5. Bancada (`modules/bancada`): middleware da profissional, hoje, ficha rápida, nota, foto, iniciar, horários, reagendar, cancelar, comanda (ler, salvar, enviar para a recepção, fechar com a chave), números e avaliações.
6. Avaliações: token no fechamento, link no comprovante, página pública, gravação em `whatsapp_ratings`, nota baixa no sino, bloco em Relatórios.
7. Painel: chave "A profissional cobra no app" em Ajustes, bloco "Acesso ao app" na profissional, selo "Pronta para cobrar", "Ativar notificações", push nos eventos de agendamento.
8. Frontend: PWA (manifest, ícones, service worker), `/convite/[token]`, `/avaliar/[token]`, `/bancada/*`, redirecionamento por papel.
9. Testes: backend (regras, serviços, rotas com a amostra de isolamento) e frontend (telas e themeCompliance).
10. Docs: ROADMAP, SEGUIMENTO e os ajustes na spec.
