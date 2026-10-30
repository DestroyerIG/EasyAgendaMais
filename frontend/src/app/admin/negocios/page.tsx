'use client';

/**
 * Gestão de negócios do SuperAdmin (Stitch `easyagenda-superadmin-gestao-de-negocios-e-assinantes-ajustada--9e95f6`).
 *
 * Todo número vem de GET /admin/tenants. Filtros e página ficam na URL, então o redirecionamento
 * de /admin/subscriptions (`?status=carencia`) já abre filtrado. Do Stitch saem o "+ Novo negócio
 * manual", o filtro "Saúde WhatsApp", o volume em reais por negócio e o rodapé técnico.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banner, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { CartoesGestao } from '@/components/admin/negocios/CartoesGestao';
import { FiltrosNegocios } from '@/components/admin/negocios/FiltrosNegocios';
import { LIMITES, TabelaNegocios } from '@/components/admin/negocios/TabelaNegocios';
import { adminApi } from '@/lib/adminApi';
import { PLANOS_ADMIN, SEGMENTOS_ADMIN, STATUS_ADMIN } from '@/lib/adminRotulos';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { FiltrosNegocios as Filtros, LimitePagina, ListaNegocios, StatusAdmin } from '@/types/admin';

const ESPERA_BUSCA_MS = 300;
const LIMITE_PADRAO: LimitePagina = 20;

interface Estado extends Filtros {
  page: number;
  limit: LimitePagina;
}

const contem = <T extends string>(lista: readonly T[], valor: string | null): valor is T =>
  valor !== null && (lista as readonly string[]).includes(valor);

/** Lê filtros e página da URL; valor desconhecido é ignorado (o backend rejeitaria). */
function lerUrl(params: URLSearchParams): Estado {
  const busca = params.get('busca')?.trim() || undefined;
  const segmento = params.get('segmento');
  const status = params.get('status');
  const plano = params.get('plano');
  const page = Number(params.get('page'));
  const limit = Number(params.get('limit'));
  return {
    busca,
    segmento: contem(SEGMENTOS_ADMIN, segmento) ? segmento : undefined,
    status: contem(STATUS_ADMIN, status) ? (status as StatusAdmin) : undefined,
    plano: contem(PLANOS_ADMIN, plano) ? plano : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: (LIMITES as number[]).includes(limit) ? (limit as LimitePagina) : LIMITE_PADRAO,
  };
}

/** Só os campos preenchidos, na ordem da consulta. Serve para a API e para a URL. */
function compactar(e: Estado): Filtros & { page: number; limit: LimitePagina } {
  return {
    ...(e.busca ? { busca: e.busca } : {}),
    ...(e.segmento ? { segmento: e.segmento } : {}),
    ...(e.status ? { status: e.status } : {}),
    ...(e.plano ? { plano: e.plano } : {}),
    page: e.page,
    limit: e.limit,
  };
}

function paraUrl(e: Estado): string {
  const params = new URLSearchParams();
  Object.entries(compactar(e)).forEach(([chave, valor]) => {
    if (chave === 'page' && valor === 1) return;
    if (chave === 'limit' && valor === LIMITE_PADRAO) return;
    params.set(chave, String(valor));
  });
  const qs = params.toString();
  return qs ? `/admin/negocios?${qs}` : '/admin/negocios';
}

const chave = (e: Estado) => JSON.stringify(compactar(e));

function baixarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function GestaoNegocios() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  const [estado, setEstado] = useState<Estado>(() => lerUrl(new URLSearchParams(qs)));
  const [texto, setTexto] = useState(estado.busca ?? '');
  const [dados, setDados] = useState<ListaNegocios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  const pedido = useRef(0);
  const estadoRef = useRef(estado);

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  // Voltar/avançar no navegador muda a URL: o estado acompanha. A URL que a própria tela
  // escreveu já bate com o estado e não muda nada.
  useEffect(() => {
    const lido = lerUrl(new URLSearchParams(qs));
    if (chave(lido) === chave(estadoRef.current)) return;
    setEstado(lido);
    setTexto(lido.busca ?? '');
  }, [qs]);

  const mudar = useCallback(
    (proximo: Estado) => {
      setEstado(proximo);
      router.replace(paraUrl(proximo), { scroll: false });
    },
    [router],
  );

  const aplicarFiltro = (mudanca: Partial<Filtros>) => mudar({ ...estado, ...mudanca, page: 1 });

  // A busca espera o usuário parar de digitar.
  useEffect(() => {
    const busca = texto.trim() || undefined;
    if (busca === estado.busca) return;
    const id = setTimeout(() => mudar({ ...estado, busca, page: 1 }), ESPERA_BUSCA_MS);
    return () => clearTimeout(id);
  }, [texto, estado, mudar]);

  const consulta = chave(estado);
  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await adminApi.getTenants(JSON.parse(consulta));
      if (meu === pedido.current) setDados(resposta);
    } catch (e) {
      if (meu === pedido.current) setErro(getApiErrorMessage(e, 'Não foi possível carregar os negócios.'));
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [consulta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const exportar = async () => {
    setExportando(true);
    setErroCsv(null);
    try {
      const { busca, segmento, status, plano } = compactar(estado);
      const filtros: Filtros = {
        ...(busca ? { busca } : {}),
        ...(segmento ? { segmento } : {}),
        ...(status ? { status } : {}),
        ...(plano ? { plano } : {}),
      };
      baixarArquivo(await adminApi.exportTenantsCsv(filtros), 'negocios.csv');
    } catch (e) {
      setErroCsv(getApiErrorMessage(e, 'Não foi possível exportar o CSV.'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted">SuperAdmin</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Gestão de negócios</h1>
          <p className="mt-1 text-[14px] text-muted">
            {dados
              ? `${formatNumber(dados.meta.total)} ${dados.meta.total === 1 ? 'negócio' : 'negócios'} com os filtros atuais`
              : 'Negócios, planos, status da conta e uso.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportar()}
          disabled={exportando}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-1.5 self-start md:self-auto')}
        >
          <Icon name={exportando ? 'sync' : 'download'} size={18} className={cn(exportando && 'animate-spin')} />
          {exportando ? 'Gerando CSV…' : 'Exportar CSV'}
        </button>
      </header>

      {erroCsv && (
        <Banner tone="danger" variant="inline">
          {erroCsv}
        </Banner>
      )}

      {dados?.cartoes && <CartoesGestao cartoes={dados.cartoes} />}

      <FiltrosNegocios
        filtros={estado}
        segmentos={dados?.segmentos ?? []}
        texto={texto}
        onTexto={setTexto}
        onFiltro={aplicarFiltro}
      />

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

      {!dados && carregando && <Skeleton className="h-96" label="Carregando os negócios" />}

      {dados && (
        <TabelaNegocios
          negocios={dados.data}
          meta={dados.meta}
          limite={estado.limit}
          carregando={carregando}
          onPagina={(page) => mudar({ ...estado, page })}
          onLimite={(limit) => mudar({ ...estado, limit, page: 1 })}
        />
      )}
    </div>
  );
}

export default function AdminNegociosPage() {
  return (
    <Suspense fallback={null}>
      <GestaoNegocios />
    </Suspense>
  );
}
