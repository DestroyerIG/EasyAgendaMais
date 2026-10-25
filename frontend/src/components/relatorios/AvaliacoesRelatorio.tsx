'use client';

import { useEffect, useState } from 'react';
import { Card, Icon, Skeleton } from '@/components/ui';
import { avaliacoesRelatorioApi, formatarMedia, ROTULO_ORIGEM, type AvaliacoesPorProfissional } from '@/lib/avaliacoes';
import { dataBr, type Periodo } from '@/lib/relatorios';
import { cn } from '@/lib/cn';

// Avaliações das clientes por profissional (fase 5): pelo link do comprovante e pela resposta no WhatsApp.

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="flex shrink-0 items-center" aria-label={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={14} filled={i <= nota} className={i <= nota ? 'text-brand' : 'text-line'} />
      ))}
    </span>
  );
}

export function AvaliacoesRelatorio({ periodo }: { periodo: Periodo }) {
  const [dados, setDados] = useState<AvaliacoesPorProfissional | null>(null);
  const [erro, setErro] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro(false);
    avaliacoesRelatorioApi.porProfissional(periodo)
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [periodo]);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink">Avaliações</h2>
          <p className="text-[13px] text-muted">O que as clientes acharam de cada profissional no período.</p>
        </div>
        {dados && dados.quantidade > 0 && (
          <p className="flex items-center gap-1 text-[15px] font-bold text-ink">
            <Icon name="star" size={18} filled className="text-brand" />
            {formatarMedia(dados.media)} <span className="text-[13px] font-normal text-muted">· {dados.quantidade} avaliações</span>
          </p>
        )}
      </div>

      {erro ? <p className="text-[14px] text-muted">Não foi possível carregar as avaliações.</p> : !dados ? (
        <Skeleton className="h-24 w-full" />
      ) : dados.quantidade === 0 ? (
        <p className="text-[14px] text-muted">Nenhuma avaliação no período. O link vai junto do comprovante da comanda no WhatsApp.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {dados.profissionais.map((p) => {
            const expandida = aberta === p.professional.id;
            return (
              <li key={p.professional.id}>
                <button
                  type="button"
                  aria-expanded={expandida}
                  onClick={() => setAberta(expandida ? null : p.professional.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span className="font-semibold text-ink">{p.professional.nome}</span>
                  <span className="flex items-center gap-2 text-[14px]">
                    <span className={cn('font-bold tabular-nums', p.media <= 3 ? 'text-danger' : 'text-ink')}>{formatarMedia(p.media)}</span>
                    <span className="text-muted">({p.quantidade})</span>
                    <Icon name={expandida ? 'expand_less' : 'expand_more'} size={18} className="text-muted" />
                  </span>
                </button>
                {expandida && (
                  <ul className="space-y-3 px-4 pb-4">
                    {p.itens.map((a) => (
                      <li key={a.id} className="rounded-control bg-surface-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{a.cliente}</span>
                          <Estrelas nota={a.nota} />
                        </div>
                        {a.comentario && <p className="mt-1 text-[14px] text-ink">“{a.comentario}”</p>}
                        <p className="mt-1 text-[12px] text-muted">
                          {a.servico} · {dataBr(a.data)} · {ROTULO_ORIGEM[a.origem] ?? a.origem}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
