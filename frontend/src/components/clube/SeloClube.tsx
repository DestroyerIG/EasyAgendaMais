'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { type Contrato, clubeApi, rotuloSaldo } from '@/lib/clube';

// Selo da ficha da cliente: um por clube ou pacote vigente, com o saldo. Some quando não há nenhum.

export function SeloClube({ clientId, className = 'contents' }: { clientId: string; className?: string }) {
  const [contratos, setContratos] = useState<(Contrato & { vigente: boolean })[]>([]);

  useEffect(() => {
    let ativo = true;
    clubeApi
      .doCliente(clientId)
      .then((c) => { if (ativo) setContratos(Array.isArray(c) ? c.filter((x) => x.vigente) : []); })
      .catch(() => { if (ativo) setContratos([]); });
    return () => { ativo = false; };
  }, [clientId]);

  if (contratos.length === 0) return null;
  return (
    <span className={className}>
      {contratos.map((c) => {
        const atraso = c.status === 'em_atraso';
        const saldo = rotuloSaldo(c);
        return (
          <Link
            key={c.id}
            href="/clube/assinantes"
            title={atraso ? 'Mensalidade em atraso' : `${saldo.principal} · ${saldo.detalhe}`}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${
              atraso ? 'bg-danger/12 text-danger' : 'bg-brand/12 text-brand'
            }`}
          >
            <Icon name="loyalty" size={14} />
            {c.oferta.nome}
            <span className="font-semibold opacity-80">· {atraso ? 'em atraso' : saldo.detalhe}</span>
          </Link>
        );
      })}
    </span>
  );
}
