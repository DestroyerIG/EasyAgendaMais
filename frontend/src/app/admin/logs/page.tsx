'use client';

import { useEffect, useState } from 'react';
import { Icon, buttonVariants, controlClass } from '@/components/ui';
import { CAIXA } from '@/components/admin/formato';
import { adminApi } from '@/lib/adminApi';
import { rotuloAcao } from '@/lib/adminRotulos';
import { cn } from '@/lib/cn';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import type { AdminAuditLog, PaginationMeta } from '@/types/admin';

const inputClass = cn(controlClass, 'h-11');

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR');
};

export default function AdminLogsPage() {
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [searchActor, setSearchActor] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      try {
        const response = await adminApi.getAuditLogs({
          page,
          limit: 20,
          action,
          status,
          actor: searchActor,
        });

        setItems(response.data);
        setMeta(response.meta);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [action, page, searchActor, status]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-ink">Logs de auditoria</h1>
        <p className="mt-2 text-sm text-muted">Rastreabilidade completa das ações administrativas críticas da plataforma.</p>
      </section>

      <section className={cn(CAIXA, 'p-5 sm:p-6')}>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={action}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
            placeholder="Filtrar por código da ação (ex.: TENANT_BLOCKED)"
            className={inputClass}
          />

          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            className={inputClass}
          >
            <option value="">Status</option>
            <option value="success">Sucesso</option>
            <option value="failed">Falhou</option>
          </select>

          <label className="relative md:col-span-2">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchActor}
              onChange={(event) => {
                setPage(1);
                setSearchActor(event.target.value);
              }}
              placeholder="ID do usuário autor (uuid)"
              className={cn(inputClass, 'pl-9')}
            />
          </label>
        </div>
      </section>

      <section className={cn(CAIXA, 'overflow-x-auto p-5 sm:p-6')}>
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-3">Ação</th>
              <th className="px-3 py-3">Ator</th>
              <th className="px-3 py-3">Alvo</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Quando</th>
              <th className="px-3 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">Nenhum log encontrado.</td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="px-3 py-4">
                  <p className="font-semibold text-ink" title={item.action_type}>{rotuloAcao(item.action_type)}</p>
                  <p className="text-xs text-muted">{item.resource_type || '-'} · {item.resource_id || '-'}</p>
                </td>
                <td className="px-3 py-4 text-xs text-ink">
                  <p>{item.actor_user_email || '-'}</p>
                  <p className="text-muted">{item.actor_tenant_name || '-'}</p>
                </td>
                <td className="px-3 py-4 text-xs text-ink">
                  <p>{item.target_user_email || '-'}</p>
                  <p className="text-muted">{item.target_tenant_name || '-'}</p>
                </td>
                <td className="px-3 py-4">
                  <AdminStatusBadge value={item.status} variant="audit" />
                </td>
                <td className="px-3 py-4 text-xs text-ink">{formatDate(item.created_at)}</td>
                <td className="px-3 py-4 text-xs text-muted">
                  <pre className="max-w-[420px] whitespace-pre-wrap break-words rounded-control bg-surface-2 p-2 text-[11px]">{JSON.stringify(item.details || {}, null, 2)}</pre>
                  {item.error_message ? <p className="mt-1 text-danger">{item.error_message}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex items-center justify-between text-sm text-muted">
        <p>Total: {meta.total} registros</p>
        <div className="flex items-center gap-2">
          <button
            disabled={meta.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Anterior
          </button>
          <span>Página {meta.page} de {meta.totalPages}</span>
          <button
            disabled={meta.page >= meta.totalPages}
            onClick={() => setPage((current) => current + 1)}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Próxima
          </button>
        </div>
      </section>
    </div>
  );
}
