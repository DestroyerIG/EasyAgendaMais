# Ligar o RLS nas tabelas restantes

Roteiro para fazer em qualquer máquina. Levantamento feito em 04/11/2026, direto no banco de produção, só com leitura.

## Por que fazer

RLS (Row Level Security) é a regra do Postgres que bloqueia o acesso às linhas de uma tabela. O sistema segue a política da migração `20260608000000_enable_rls_policies`: toda tabela tem RLS ligado, e o acesso passa pelo backend.

Das 56 tabelas do schema `public`, 41 têm RLS e 15 não têm. As migrações de 25/10 a 29/10 criaram 14 delas sem a linha que liga o RLS. A 15ª é a `_prisma_migrations`, do próprio Prisma.

**Não é urgente.** Os papéis públicos do Supabase (`anon` e `authenticated`) não têm nenhuma permissão de leitura ou escrita nessas tabelas, então hoje a chave pública do site não alcança esses dados. O RLS é uma segunda barreira: se alguém der uma permissão por engano, ou se um padrão do Supabase mudar, as tabelas continuam fechadas.

**Sem efeito no sistema.** O backend conecta como `postgres`, que tem `rolbypassrls = true`, e o código não acessa essas tabelas pelo cliente do Supabase. Nenhuma tela ou rota muda, e não há deploy de código.

## Tabelas

| Origem | Tabelas |
|---|---|
| `20261025120000_relatorios_comissoes` | `repasses`, `adiantamentos`, `repasse_adiantamentos` |
| `20261026120000_clube_pacotes` | `clube_ofertas`, `clube_oferta_servicos`, `clube_oferta_profissionais`, `clube_contratos`, `clube_cobrancas`, `clube_usos` |
| `20261027120000_app_profissional` | `profissional_convites`, `push_inscricoes` |
| `20261029120000_google_agenda` | `google_agenda_conexoes`, `google_agenda_eventos`, `google_agenda_ocupado` |

A `_prisma_migrations` fica de fora: é do Prisma, não guarda dado de negócio e os papéis públicos também não têm acesso a ela.

## O que precisa ter na máquina

- O repositório clonado, com a `main` atualizada.
- Node e `npm install` rodado em `backend/`, seguido de `npx prisma generate`.
- O `backend/.env` com o `DATABASE_URL` de produção. Ele não está no Git: copie de um lugar seguro e nunca faça commit dele.
- Acesso ao GitHub para abrir o PR.

## Passo a passo

### 1. Conferir se a lista continua igual

Novas tabelas podem ter surgido depois de 04/11. Rode no SQL Editor do Supabase:

```sql
SELECT c.relname AS tabela,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_le,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_le
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY 1;
```

O esperado é ver as 14 tabelas e a `_prisma_migrations`, com `false` nas duas colunas. Se aparecer `true` em alguma, trate como prioridade: essa tabela está mesmo aberta.

### 2. Criar a migração

Crie uma branch a partir da `main` e o arquivo `backend/prisma/migrations/<AAAAMMDDHHMMSS>_rls_tabelas_restantes/migration.sql`. A data precisa ser mais nova que a da última pasta em `backend/prisma/migrations`.

```sql
ALTER TABLE public.repasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repasse_adiantamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_oferta_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_oferta_profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_usos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_agenda_conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_agenda_ocupado ENABLE ROW LEVEL SECURITY;
```

Não crie policies: RLS ligado sem policy nega tudo aos papéis públicos, que é o que se quer. O `schema.prisma` não muda.

Para o teste, siga `backend/src/__tests__/depoimentosMigracao.test.ts`, que lê o arquivo da migração e confere as linhas. Depois rode em `backend/`:

```bash
npx tsc --noEmit
npx vitest run
```

Abra o PR para a `main`.

### 3. Aplicar em produção

Só com a autorização do dono. A conexão direta do Supabase não responde, então use o pooler no modo sessão. `DIRECT_URL` é o `DATABASE_URL` com `:6543` trocado por `:5432` e sem a query string (tudo depois do `?`).

Bash:

```bash
cd backend
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"\r')"
export DIRECT_URL="$(printf '%s' "$DATABASE_URL" | sed 's/:6543/:5432/; s/?.*$//')"
```

PowerShell:

```powershell
cd backend
$env:DATABASE_URL = ((Select-String -Path .env -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=', '').Trim('"')
$env:DIRECT_URL = ($env:DATABASE_URL -replace ':6543', ':5432') -replace '\?.*$', ''
```

Depois, nos dois casos:

```bash
npx prisma migrate status   # só esta migração pode estar pendente
npx prisma migrate deploy
npx prisma migrate status   # precisa dizer "Database schema is up to date!"
```

Se o primeiro `status` mostrar outra migração pendente, pare e descubra de onde ela veio: o `deploy` aplica todas.

Cada `ALTER TABLE` pega um bloqueio muito curto na tabela. Prefira um horário de pouco movimento.

### 4. Conferir

1. Rode de novo a consulta do passo 1. Só a `_prisma_migrations` deve aparecer.
2. Abra o sistema e confira uma tela de cada área: comissões em Relatórios, Clube e pacotes, Google Agenda em Ajustes e o botão de notificações.
3. Veja o log do Render por alguns minutos, procurando erros de permissão.

### Como desfazer

Se algo quebrar, rode no SQL Editor do Supabase, trocando pelo nome da tabela afetada:

```sql
ALTER TABLE public.nome_da_tabela DISABLE ROW LEVEL SECURITY;
```

Isso não apaga dado nenhum. Depois abra uma correção, porque o histórico de migrações continuará dizendo que o RLS está ligado.

## Regra daqui para frente

Toda migração que cria tabela termina com `ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;`. Foi a falta dessa linha que deixou essas 14 tabelas para trás. A migração `20261105120000_depoimentos` já segue a regra.
