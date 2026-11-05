-- Liga o RLS nas 14 tabelas criadas sem ele entre 25/10 e 29/10.
-- Sem policies: RLS ligado sem policy nega tudo aos papéis públicos.
-- O backend conecta como postgres (rolbypassrls), então nada muda para o sistema.
-- Roteiro: docs/design/rls-tabelas-restantes.md

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
