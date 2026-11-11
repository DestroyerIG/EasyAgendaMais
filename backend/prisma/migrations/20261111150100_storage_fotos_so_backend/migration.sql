-- O upload das fotos de profissional agora passa pelo backend (chave de serviço,
-- que ignora RLS). As policies de escrita para authenticated só checavam o
-- bucket, sem separar por negócio: qualquer usuário logado podia sobrescrever ou
-- apagar a foto de outro. Ficam só a leitura pública (bucket público, URLs das fotos).
-- Só roda onde o Storage do Supabase existe.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_insert_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_update_professional_photos" ON storage.objects$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "authenticated_delete_professional_photos" ON storage.objects$p$;
  END IF;
END $$;
