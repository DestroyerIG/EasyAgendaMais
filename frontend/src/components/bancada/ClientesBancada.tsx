'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Users } from 'lucide-react';
import { Avatar, EmptyState, Skeleton } from '@/components/ui';
import { bancadaApi, type ClienteDela } from '@/lib/bancada';
import { formatPhone } from '@/lib/formatters';
import { ErroBancada } from './ErroBancada';
import { useVocabulario } from '@/hooks/useVocabulario';

// Clientes dela: quem tem (ou teve) agendamento com a profissional do login.

export function ClientesBancada() {
  const { cli, adaptar } = useVocabulario();
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<ClienteDela[] | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      bancadaApi.clientes(busca.trim() || undefined)
        .then((r) => { if (vivo) { setLista(r); setErro(null); } })
        .catch((e) => { if (vivo) setErro(e); });
    }, busca ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">{adaptar('Suas clientes')}</h1>
      <label className="relative block">
        <span className="sr-only">Buscar por nome ou telefone</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="h-11 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-[15px] text-ink"
        />
      </label>

      {erro ? <ErroBancada erro={erro} /> : lista === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
        </div>
      ) : lista.length === 0 ? (
        <EmptyState icon={Users} title={busca ? `${cli.g('Nenhuma', 'Nenhum')} ${cli.s} ${cli.g('encontrada', 'encontrado')}` : adaptar('Nenhuma cliente ainda')}
          description={adaptar('Aparecem aqui as clientes que já marcaram com você.')} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/bancada/clientes/${c.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-2">
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="block text-[13px] text-muted">{formatPhone(c.phone)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
