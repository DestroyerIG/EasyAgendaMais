'use client';

/**
 * Detalhes do negócio no SuperAdmin (Stitch `easyagenda-superadmin-detalhes-do-negocio-sa-2041-ajustada--b916d3`).
 *
 * Tudo vem de GET /admin/tenants/:id e da auditoria do negócio. Do Stitch saem "Login como",
 * "Aplicar cupom", "Engine", "Cliente verificado", a latência do WhatsApp, a grade de
 * funcionamento e o bloco de LGPD.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Banner, Skeleton } from '@/components/ui';
import { AcoesSuperAdmin } from '@/components/admin/detalhe/AcoesSuperAdmin';
import { AuditoriaNegocio } from '@/components/admin/detalhe/AuditoriaNegocio';
import { CabecalhoNegocio, TrilhaNegocio } from '@/components/admin/detalhe/CabecalhoNegocio';
import { CartoesNegocio } from '@/components/admin/detalhe/CartoesNegocio';
import { LinhaDoTempoCobranca } from '@/components/admin/detalhe/LinhaDoTempoCobranca';
import { ProfissionaisNegocio } from '@/components/admin/detalhe/ProfissionaisNegocio';
import { UsoEmProducao } from '@/components/admin/detalhe/UsoEmProducao';
import { CAIXA } from '@/components/admin/formato';
import { adminApi } from '@/lib/adminApi';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { DetalheNegocio } from '@/types/admin';

export default function AdminNegocioDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [detalhe, setDetalhe] = useState<DetalheNegocio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!id) return;
    const meu = ++pedido.current;
    setErro(null);
    try {
      const resposta = await adminApi.getTenantDetails(id);
      if (meu === pedido.current) setDetalhe(resposta);
    } catch (e) {
      if (meu === pedido.current) setErro(getApiErrorMessage(e, 'Não foi possível carregar o negócio.'));
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Depois de uma ação: recarrega o detalhe e, pela versão, a auditoria.
  const aoConcluir = () => {
    void carregar();
    setVersao((v) => v + 1);
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <TrilhaNegocio nome={detalhe?.negocio.nome ?? 'Detalhes'} />

      {erro && (
        <Banner
          tone="danger"
          variant="inline"
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

      {!detalhe && !erro && <Skeleton className="h-64" label="Carregando o negócio" />}

      {detalhe && (
        <>
          <section aria-label="Resumo do negócio" className={cn(CAIXA, 'space-y-5 p-5 sm:p-6')}>
            <CabecalhoNegocio negocio={detalhe.negocio} />
            <CartoesNegocio detalhe={detalhe} />
            <AcoesSuperAdmin negocio={detalhe.negocio} onConcluido={aoConcluir} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <LinhaDoTempoCobranca proximaCobranca={detalhe.proximaCobranca} faturas={detalhe.faturas} />
              <UsoEmProducao uso={detalhe.uso} />
              <ProfissionaisNegocio tenantId={id} onAlterado={() => setVersao((v) => v + 1)} />
            </div>
            <div className="lg:col-span-5">
              <AuditoriaNegocio tenantId={id} versao={versao} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
