# Roteiro de troca de domínio

Roteiro da troca de domínio. **Executado em 09/11/2026:** o sistema passou de `easybarber.tech` para https://www.easyagendamais.com.br, com a API em `api.easyagendamais.com.br`. Serve de referência para uma nova troca. O item de cobrança foi atualizado: o Stripe não existe mais.

1. DNS: apontar o domínio para a Vercel e validar o certificado.
2. Vercel: adicionar o domínio ao projeto e definir `BACKEND_ORIGIN`, `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_APP_URL`.
   - `frontend/src/lib/appUrl.ts` usa `NEXT_PUBLIC_APP_URL` primeiro e, na ausência dela, cai de volta no endereço Vercel atual (`https://barberpro-saas-2-0.vercel.app`) hardcoded como último recurso em produção; por isso essa variável precisa apontar para o domínio novo, senão o app volta a cair nesse endereço antigo quando as demais não resolverem.
   - Backend (Render): atualizar também `VERCEL_PROJECT_PREFIX` (usado pelo CORS em `backend/src/server.ts` para aceitar a origem do frontend) e `APP_URL` (primeira variável lida por `resolveFrontendBaseUrl()` em `backend/src/services/supabaseAuthService.ts`, que monta os links de confirmação de e-mail e redefinição de senha; sem ela, em produção esse fallback também cai no endereço Vercel antigo hardcoded).
3. Redirecionamento permanente (301) do endereço antigo para o novo.
4. Supabase: atualizar Site URL e Redirect URLs (login, confirmação de e-mail, recuperação de senha).
5. Asaas: atualizar a URL do webhook e as URLs de retorno do checkout.
6. Mercado Pago e InfinitePay: atualizar `MERCADOPAGO_REDIRECT_URI` (e o cadastrado na aplicação do Mercado Pago) e `BACKEND_URL`. Google: atualizar `GOOGLE_AGENDA_REDIRECT_URI` no Google Cloud.
7. Evolution: rodar `/admin/sync-webhooks` para reapontar as instâncias, e conferir uma a uma.
8. E-mail: publicar SPF, DKIM e DMARC do domínio novo e trocar o remetente (`RESEND_FROM` ou `SMTP_FROM`).
9. Cookies: sessões do domínio antigo não valem no novo; avisar que será preciso entrar de novo.
10. Conferir: cadastro, login, agendamento, cobrança Pix e cartão, e recebimento de mensagem do bot.
