'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { GATEWAYS } from '@/components/recebimentos/catalogo';
import { GatewayLogo } from '@/components/recebimentos/GatewayLogo';
import { PixManualCard } from '@/components/recebimentos/PixManualCard';
import { recebimentosApi, type EstadoRecebimentos } from '@/lib/recebimentos';

// Ajustes › Recebimentos: a chave Pix do sinal e, com a integração configurada, um cartão por gateway.
// Só a dona vê.
export function RecebimentosSection() {
  const { user } = useAuth();
  const ehDona = user?.role === 'tenant_admin';
  const [estado, setEstado] = useState<EstadoRecebimentos | null>(null);

  useEffect(() => {
    if (!ehDona) return;
    let ativo = true;
    recebimentosApi.conexoes()
      .then((e) => { if (ativo) setEstado(e); })
      .catch(() => { if (ativo) setEstado({ configurado: false, disponiveis: [], conexao: null }); });
    return () => { ativo = false; };
  }, [ehDona]);

  if (!ehDona) return null;

  return (
    <div className="space-y-4">
      <PixManualCard />
      {estado === null && <Skeleton className="h-28 w-full" label="Carregando recebimentos..." />}
      {estado?.configurado && <Gateways estado={estado} />}
    </div>
  );
}

function Gateways({ estado }: { estado: EstadoRecebimentos }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Confirmação automática</h2>
        <p className="mt-1 text-[15px] text-muted">Conecte uma conta para o sinal ser confirmado sozinho, sem você conferir o Pix.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {GATEWAYS.map((g) => {
          const conectado = estado.conexao?.gateway === g.id;
          const disponivel = g.situacao === 'disponivel' && estado.disponiveis.some((d) => d === g.id);
          const situacao = conectado
            ? estado.conexao?.situacao === 'precisa_reconectar' ? 'Precisa reconectar' : 'Conectado'
            : disponivel ? 'Disponível' : 'Em breve';
          // Um gateway por vez: com uma conexão, só o cartão dela abre.
          const abre = conectado || (disponivel && !estado.conexao);
          const conteudo = (
            <>
              <GatewayLogo nome={g.nome} logo={g.logo} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{g.nome}</span>
                <span className="block text-[13px] text-muted">{situacao}</span>
              </span>
            </>
          );
          const base = 'flex min-h-14 items-center gap-3 rounded-control border border-line bg-surface p-3';
          return (
            <li key={g.id}>
              {abre ? (
                <Link
                  href={`/dashboard/configuracoes/recebimentos/${g.id}`}
                  aria-label={`${g.nome}: ${situacao}`}
                  className={`${base} hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}
                >
                  {conteudo}
                </Link>
              ) : (
                <div className={`${base} opacity-70`}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
