'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Receipt, Star } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { bancadaApi, type Avaliacao, type MeusNumeros as Numeros } from '@/lib/bancada';
import { pdfExtrato } from '@/lib/bancadaPdf';
import { formatarMedia } from '@/lib/avaliacoes';
import { ROTULO_FORMA, dataBr, hojeLocal, quinzenaDe, quinzenaVizinha, rotuloPeriodo, type Periodo } from '@/lib/relatorios';
import { formatCurrency } from '@/lib/formatters';
import { ErroBancada } from './ErroBancada';
import { useVocabulario } from '@/hooks/useVocabulario';

// Meus números: só a parte dela (comissões, gorjetas, adiantamentos), extrato e avaliações.

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= nota ? 'h-3.5 w-3.5 fill-brand text-brand' : 'h-3.5 w-3.5 text-line'} aria-hidden="true" />
      ))}
    </span>
  );
}

function Linha({ rotulo, valor, sinal = '' }: { rotulo: string; valor: number; sinal?: string }) {
  return (
    <div className="flex items-center justify-between text-[14px]">
      <span className="text-muted">{rotulo}</span>
      <span className="tabular-nums text-ink">{valor ? `${sinal}${formatCurrency(valor)}` : '—'}</span>
    </div>
  );
}

export function MeusNumeros() {
  const { user } = useAuth();
  const { adaptar } = useVocabulario();
  const { showToast } = useToast();
  const [periodo, setPeriodo] = useState<Periodo>(() => quinzenaDe(hojeLocal()));
  const [dados, setDados] = useState<Numeros | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [erro, setErro] = useState<unknown>(null);

  const carregar = useCallback(() => {
    setErro(null);
    setDados(null);
    Promise.all([bancadaApi.numeros(periodo), bancadaApi.avaliacoes(periodo)])
      .then(([n, a]) => { setDados(n); setAvaliacoes(a.itens); })
      .catch(setErro);
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixarPdf = () => {
    if (!dados) return;
    try {
      pdfExtrato(dados, dados.profissional.nome, user?.businessName || 'Salão');
    } catch {
      showToast('Não foi possível gerar o PDF.', 'error');
    }
  };

  const r = dados?.resumo ?? null;
  const pago = r?.status === 'pago';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink">Meus números</h1>
          <p className="truncate text-[13px] text-muted">{rotuloPeriodo(periodo)}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Quinzena anterior" onClick={() => setPeriodo((p) => quinzenaVizinha(p, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface text-ink">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Próxima quinzena" onClick={() => setPeriodo((p) => quinzenaVizinha(p, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface text-ink">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {erro ? <ErroBancada erro={erro} onRetry={carregar} /> : !dados ? (
        <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-36 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <>
          <section className="rounded-card border border-line bg-surface p-4">
            <p className="text-[12px] font-semibold uppercase text-muted">{pago ? 'Recebido' : 'A receber'}</p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-ink">{formatCurrency(r?.aPagar ?? 0)}</p>
            <p className="mt-1 text-[13px] text-muted">
              {pago && r?.repasse
                ? `Pago em ${dataBr(r.repasse.pagoEm.slice(0, 10))} · ${ROTULO_FORMA[r.repasse.forma]}`
                : 'Próximo repasse: combine com o salão'}
            </p>
            <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
              <Linha rotulo={`Atendimentos (${r?.atendimentos ?? 0})`} valor={r?.comissaoServico ?? 0} />
              <Linha rotulo="Comissão de produtos" valor={r?.comissaoProduto ?? 0} />
              <Linha rotulo="Gorjetas" valor={r?.gorjetas ?? 0} />
              <Linha rotulo="Adiantamentos" valor={r?.adiantamentos ?? 0} sinal="− " />
            </div>
          </section>

          <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Avaliações</h2>
              {dados.avaliacoes.quantidade > 0 && (
                <span className="flex items-center gap-1 text-[14px] font-bold text-ink">
                  <Star className="h-4 w-4 fill-brand text-brand" aria-hidden="true" />
                  {formatarMedia(dados.avaliacoes.media)}
                  <span className="font-normal text-muted">({dados.avaliacoes.quantidade})</span>
                </span>
              )}
            </div>
            {avaliacoes.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">{adaptar('Nenhuma avaliação neste período. O link vai no comprovante da cliente.')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {avaliacoes.slice(0, 20).map((a) => (
                  <li key={a.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold text-ink">{a.cliente.split(' ')[0]}</span>
                      <Estrelas nota={a.nota} />
                    </div>
                    {a.comentario && <p className="mt-1 text-[13px] text-ink">“{a.comentario}”</p>}
                    <p className="mt-0.5 text-[12px] text-muted">{a.servico} · {dataBr(a.data)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Extrato</h2>
              <Button size="sm" variant="secondary" onClick={baixarPdf} disabled={dados.extrato.length === 0}>
                <FileDown className="h-4 w-4" aria-hidden="true" /> PDF
              </Button>
            </div>
            {dados.extrato.length === 0 ? (
              <EmptyState icon={Receipt} title="Sem atendimentos fechados" description="As comandas fechadas no período aparecem aqui." />
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {dados.extrato.map((k) => (
                  <li key={k.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">{k.cliente}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {dataBr(k.fechadaEm.slice(0, 10))} · {k.itens.map((i) => i.nome).join(', ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-bold tabular-nums text-success-text">{formatCurrency(k.parte.total)}</span>
                      <span className="block text-[11px] tabular-nums text-muted">de {formatCurrency(k.pago)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
