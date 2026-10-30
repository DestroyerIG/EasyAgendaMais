'use client';

/**
 * Visão geral do SuperAdmin (Stitch `easyagenda-superadmin-visao-geral-de-operacoes-ajustada--5f2465`).
 *
 * Todo número vem de GET /admin/metrics. Do Stitch saem o "Tempo real", o seletor de período,
 * o "Exportar BI", o bloco "Expansão" do MRR, os selos inventados dos segmentos, as ações em lote
 * da tabela de risco e os cartões de GMV e infraestrutura, que não têm dado por trás.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banner, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { CartaoCancelamentos } from '@/components/admin/visaoGeral/CartaoCancelamentos';
import { CartaoConversao } from '@/components/admin/visaoGeral/CartaoConversao';
import { CartaoMrr } from '@/components/admin/visaoGeral/CartaoMrr';
import { CartaoTestes } from '@/components/admin/visaoGeral/CartaoTestes';
import { ConversaoPorSegmento } from '@/components/admin/visaoGeral/ConversaoPorSegmento';
import { DisparosWhatsapp } from '@/components/admin/visaoGeral/DisparosWhatsapp';
import { TabelaEmRisco } from '@/components/admin/visaoGeral/TabelaEmRisco';
import { horaMinuto } from '@/components/admin/formato';
import { adminApi } from '@/lib/adminApi';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { AdminVisaoGeral } from '@/types/admin';

export default function AdminHomePage() {
  const [dados, setDados] = useState<AdminVisaoGeral | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await adminApi.getMetrics());
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível carregar a visão geral.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted">SuperAdmin</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Visão geral</h1>
        </div>
        <div className="flex items-center gap-2">
          {dados && (
            <span className="rounded-control border border-line bg-surface px-3 py-1.5 text-[13px] text-muted shadow-sm">
              Atualizado às {horaMinuto(dados.atualizadoEm)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            aria-label="Recarregar"
            title="Recarregar"
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-11 px-0 lg:w-9')}
          >
            <Icon name="refresh" size={18} className={cn(carregando && 'animate-spin')} />
          </button>
        </div>
      </header>

      {erro && (
        <Banner
          tone="danger"
          variant="inline"
          className="mb-6"
          action={
            <button
              type="button"
              onClick={() => void carregar()}
              className="ml-auto font-bold text-ink underline underline-offset-2"
            >
              Tentar de novo
            </button>
          }
        >
          {erro}
        </Banner>
      )}

      {!dados && carregando && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-44" label="Carregando a visão geral" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      )}

      {dados && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoMrr mrr={dados.mrr} />
            <CartaoTestes testes={dados.testes} />
            <CartaoConversao geral={dados.conversao.geral} />
            <CartaoCancelamentos cancelamentos={dados.cancelamentos} />
          </div>
          <ConversaoPorSegmento segmentos={dados.conversao.segmentos} />
          <TabelaEmRisco negocios={dados.emRisco} agora={new Date(dados.atualizadoEm)} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <DisparosWhatsapp disparos={dados.disparos24h} />
          </div>
        </div>
      )}
    </div>
  );
}
