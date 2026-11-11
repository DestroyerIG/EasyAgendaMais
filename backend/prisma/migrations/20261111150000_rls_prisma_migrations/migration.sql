-- Liga o RLS na tabela interna do Prisma. Sem policy, anon e authenticated não
-- enxergam nada pela API pública do Supabase. O Prisma conecta como dono da
-- tabela (sem FORCE), então o migrate continua funcionando.
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;
