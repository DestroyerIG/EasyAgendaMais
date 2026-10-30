'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Skeleton, buttonVariants } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { adminApi } from '@/lib/adminApi';
import { cn } from '@/lib/cn';
import { formatDataHoraNegocio, formatNumber } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { CategoriaAuditoria, PaginatedAdminResponse, RegistroAuditoria } from '@/types/admin';
import { CAIXA, SEM_DADO, salvarArquivo } from '../formato';

const LIMITE = 10;

const ABAS: Array<{ valor: CategoriaAuditoria; rotulo: string }> = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'sistema', rotulo: 'Sistema' },
  { valor: 'operador', rotulo: 'Operador' },
];

const sucesso = (status: string) => status.toLowerCase() === 'success';

interface Props {
  tenantId: string;
  /** Muda depois de cada ação do SuperAdmin: a lista recarrega. */
  versao: number;
}

export function AuditoriaNegocio({ tenantId, versao }: Props) {
  const { showToast } = useToast();
  const [categoria, setCategoria] = useState<CategoriaAuditoria>('todos');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<PaginatedAdminResponse<RegistroAuditoria> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await adminApi.getTenantAudit(tenantId, { categoria, page: pagina, limit: LIMITE });
      if (meu === pedido.current) setDados(resposta);
    } catch (e) {
      if (meu === pedido.current) setErro(getApiErrorMessage(e, 'Não foi possível carregar a auditoria.'));
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [tenantId, categoria, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const exportar = async () => {
    setExportando(true);
    try {
      salvarArquivo(await adminApi.exportTenantAuditCsv(tenantId, categoria), `auditoria-${tenantId.slice(0, 8)}.csv`);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível exportar o CSV.'), 'error');
    } finally {
      setExportando(false);
    }
  };

  const meta = dados?.meta;
  const totalPaginas = Math.max(1, meta?.totalPages ?? 1);

  return (
    <section aria-labelledby="dn-auditoria" aria-busy={carregando} className={cn(CAIXA, 'flex flex-col p-5 sm:p-6')}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-muted">Rastreio</p>
          <h2 id="dn-auditoria" className="text-[17px] font-bold text-ink">
            Auditoria
          </h2>
        </div>
        <Icon name="history" size={20} className="text-muted" />
      </div>

      <div role="group" aria-label="Categoria" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((aba) => (
          <button
            key={aba.valor}
            type="button"
            aria-pressed={categoria === aba.valor}
            onClick={() => {
              setCategoria(aba.valor);
              setPagina(1);
            }}
            className={cn(
              'min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors',
              categoria === aba.valor
                ? 'border-brand bg-brand/12 text-brand-text'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p className="text-[13px] text-danger">
          {erro}{' '}
          <button type="button" onClick={() => void carregar()} className="font-bold text-ink underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      ) : !dados ? (
        <Skeleton className="h-48" label="Carregando a auditoria" />
      ) : dados.data.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhum registro nesta categoria.</p>
      ) : (
        <ul className={cn('divide-y divide-line transition-opacity', carregando && 'opacity-60')}>
          {dados.data.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-muted">
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 rounded-full', sucesso(r.status) ? 'bg-success' : 'bg-danger')}
                  />
                  {formatDataHoraNegocio(r.criadoEm)}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[12px] font-bold',
                    sucesso(r.status) ? 'bg-success/12 text-success-text' : 'bg-danger/12 text-danger',
                  )}
                >
                  {sucesso(r.status) ? 'Sucesso' : 'Falhou'}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-[13px] text-ink">{r.acao}</p>
              <p className="text-[12px] text-muted">{r.ator ?? SEM_DADO}</p>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.total > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-[13px] text-muted">
          <span>
            {formatNumber(meta.total)} {meta.total === 1 ? 'registro' : 'registros'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Página anterior da auditoria"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-11 px-0 lg:w-9')}
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <span className="px-2 text-ink">
              {formatNumber(pagina)} de {formatNumber(totalPaginas)}
            </span>
            <button
              type="button"
              aria-label="Próxima página da auditoria"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-11 px-0 lg:w-9')}
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void exportar()}
        disabled={exportando}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4 gap-1.5')}
      >
        <Icon name={exportando ? 'sync' : 'download'} size={18} className={cn(exportando && 'animate-spin')} />
        {exportando ? 'Gerando CSV…' : 'Exportar CSV'}
      </button>
    </section>
  );
}
