'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { Button, Skeleton } from '@/components/ui';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  esquecerSegmentoDoCadastro, onboardingApi, segmentoDoCadastro,
  type Horarios, type ModoEquipe, type Onboarding, type ServicoOnboarding, type TipoChavePix,
} from '@/lib/onboarding';
import type { Segmento } from '@/lib/technicalSheetTemplates';
import { EtapaNegocio } from './EtapaNegocio';
import { EtapaHorarios } from './EtapaHorarios';
import { EtapaServicos } from './EtapaServicos';
import { EtapaPagina } from './EtapaPagina';
import { EtapaWhatsapp } from './EtapaWhatsapp';

// Onboarding guiado (fase 6): cada etapa salva ao avançar; quem volta depois cai na etapa em que parou.

export function OnboardingFlow() {
  const router = useRouter();
  const { user, loading, refreshMe } = useAuth();
  const { showToast } = useToast();
  const [dados, setDados] = useState<Onboarding | null>(null);
  const [erro, setErro] = useState(false);
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [slugPublicado, setSlugPublicado] = useState<string | null>(null);

  const ehDona = user?.role === 'tenant_admin';

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!ehDona) { router.replace('/dashboard'); return; }
    let vivo = true;
    onboardingApi.ver()
      .then((d) => {
        if (!vivo) return;
        if (!d.estado.pendente) { router.replace('/dashboard'); return; }
        setDados(d);
        setEtapa(d.estado.etapa);
        setSlugPublicado(d.pagina.slug);
      })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [loading, user, ehDona, router]);

  const executar = useCallback(async (acao: () => Promise<Onboarding>, proxima: number, atualizarSessao = false) => {
    setSalvando(true);
    try {
      const d = await acao();
      setDados(d);
      setEtapa(proxima);
      // O vocabulário muda com o segmento e o painel abre depois da etapa 3: a sessão precisa saber.
      if (atualizarSessao) await refreshMe();
      window.scrollTo({ top: 0 });
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar. Tente de novo.'), 'error');
    } finally {
      setSalvando(false);
    }
  }, [refreshMe, showToast]);

  const segmentoInicial = useMemo<Segmento | null>(() => dados?.negocio.segmento ?? segmentoDoCadastro(), [dados?.negocio.segmento]);
  const jaSalvos = useMemo<ServicoOnboarding[]>(() => dados?.servicos ?? [], [dados?.servicos]);

  const concluir = async () => {
    setSalvando(true);
    try {
      await onboardingApi.concluir();
      esquecerSegmentoDoCadastro();
      await refreshMe();
      router.replace('/dashboard');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível concluir. Tente de novo.'), 'error');
      setSalvando(false);
    }
  };

  if (erro) {
    return (
      <div className="app-theme flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[15px] text-muted">Não foi possível carregar a configuração inicial.</p>
        <Button onClick={() => window.location.reload()}>Tentar de novo</Button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="app-theme min-h-screen p-6">
        <Skeleton className="mx-auto h-96 w-full max-w-3xl" />
      </div>
    );
  }

  if (etapa === 1) {
    return (
      <EtapaNegocio
        segmentoInicial={segmentoInicial}
        modoInicial={dados.negocio.modoEquipe}
        salvando={salvando}
        onSalvar={(s: Segmento, m: ModoEquipe) => void executar(() => onboardingApi.salvarNegocio(s, m), 2, true)}
      />
    );
  }
  if (etapa === 2) {
    return (
      <EtapaHorarios
        inicial={dados.horarios}
        modoEquipe={dados.negocio.modoEquipe}
        salvando={salvando}
        onVoltar={() => setEtapa(1)}
        onSalvar={(h: Horarios) => void executar(() => onboardingApi.salvarHorarios(h), 3)}
      />
    );
  }
  if (etapa === 3) {
    return (
      <EtapaServicos
        segmento={dados.negocio.segmento ?? 'outro'}
        jaSalvos={jaSalvos}
        temChavePix={dados.temChavePix}
        salvando={salvando}
        onVoltar={() => setEtapa(2)}
        onSalvar={(servicos: ServicoOnboarding[], pix?: { chave: string; tipo: TipoChavePix }) =>
          void executar(() => onboardingApi.salvarServicos(servicos, pix), 4, true)}
      />
    );
  }
  if (etapa === 4) {
    return (
      <EtapaPagina
        slugInicial={dados.pagina.slug ?? dados.pagina.slugSugerido}
        onVoltar={() => setEtapa(3)}
        onContinuar={(publicada) => {
          if (publicada) void onboardingApi.ver().then((d) => { setDados(d); setSlugPublicado(d.pagina.slug); }).catch(() => undefined);
          setEtapa(5);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }
  return (
    <EtapaWhatsapp
      jaConectado={dados.whatsappConectado}
      slug={slugPublicado}
      concluindo={salvando}
      onVoltar={() => setEtapa(4)}
      onConcluir={() => void concluir()}
    />
  );
}
