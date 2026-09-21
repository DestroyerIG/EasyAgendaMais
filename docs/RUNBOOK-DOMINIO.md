# Roteiro de troca de domínio

Executar quando o domínio novo for comprado. Nada aqui foi feito na Fundação.

1. DNS: apontar o domínio para a Vercel e validar o certificado.
2. Vercel: adicionar o domínio ao projeto e definir `BACKEND_ORIGIN`, `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL`.
3. Redirecionamento permanente (301) do endereço antigo para o novo.
4. Supabase: atualizar Site URL e Redirect URLs (login, confirmação de e-mail, recuperação de senha).
5. Stripe: atualizar a URL do webhook e as URLs de sucesso e cancelamento do checkout.
6. Asaas: atualizar a URL do webhook.
7. Evolution: rodar `/admin/sync-webhooks` para reapontar as instâncias, e conferir uma a uma.
8. E-mail: publicar SPF, DKIM e DMARC do domínio novo e trocar o remetente (`SMTP_FROM`).
9. Cookies: sessões do domínio antigo não valem no novo; avisar que será preciso entrar de novo.
10. Conferir: cadastro, login, agendamento, cobrança Pix e cartão, e recebimento de mensagem do bot.
