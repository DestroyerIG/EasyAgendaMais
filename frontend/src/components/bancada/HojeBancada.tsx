'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clock, Play, Scissors, UserRound, XCircle } from 'lucide-react';
import { Button, EmptyState, Skeleton, StatusChip } from '@/components/ui';
import { AtivarNotificacoes } from '@/components/push/AtivarNotificacoes';
import { useToast } from '@/components/Toast';
import {
  bancadaApi, horaAgora, podeCancelar, podeReagendar, rotuloEmMinutos,
  type Hoje, type ItemAgenda,
} from '@/lib/bancada';
import { somarDias } from '@/lib/relatorios';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { ReagendarModal, CancelarModal } from './AlterarAgendamento';
import { ErroBancada } from './ErroBancada';

// "Hoje na bancada": a próxima cliente em destaque e o cronograma do dia.

const rotuloDia = (d: string, hoje: string) => {
  if (d === hoje) return 'Hoje';
  if (d === somarDias(hoje, 1)) return 'Amanhã';
  if (d === somarDias(hoje, -1)) return 'Ontem';
  return new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
};

export function HojeBancada() {
  const router = useRouter();
  const { showToast } = useToast();
  const [dia, setDia] = useState<string | undefined>(undefined);
  const [dados, setDados] = useState<Hoje | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [iniciando, setIniciando] = useState<string | null>(null);
  const [alterando, setAlterando] = useState<{ tipo: 'reagendar' | 'cancelar'; a: ItemAgenda } | null>(null);

  const carregar = useCallback(() => {
    setErro(null);
    bancadaApi.hoje(dia).then(setDados).catch(setErro);
  }, [dia]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <ErroBancada erro={erro} onRetry={carregar} />;
  if (!dados) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const { hoje, data } = dados;
  const agora = horaAgora();
  const destaque = dados.destaque;
  const proxima = destaque ? dados.agenda.find((a) => a.id === destaque.agendamentoId) ?? null : null;

  const iniciar = async (a: ItemAgenda) => {
    setIniciando(a.id);
    try {
      const comanda = await bancadaApi.iniciar(a.id);
      router.push(`/bancada/atendimento?comanda=${comanda.id}`);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível iniciar o atendimento.'), 'error');
      setIniciando(null);
    }
  };

  const acaoPrincipal = (a: ItemAgenda) => {
    if (a.status === 'em_atendimento' && a.comanda) {
      return (
        <Button size="sm" onClick={() => router.push(`/bancada/atendimento?comanda=${a.comanda!.id}`)}>
          <Scissors className="h-4 w-4" aria-hidden="true" /> Continuar
        </Button>
      );
    }
    if (a.status === 'confirmado' && data === hoje) {
      return (
        <Button size="sm" onClick={() => iniciar(a)} loading={iniciando === a.id}>
          <Play className="h-4 w-4" aria-hidden="true" /> Iniciar
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold capitalize text-ink">{rotuloDia(data, hoje)}</h1>
          <p className="text-[13px] text-muted">
            {dados.resumo.total} {dados.resumo.total === 1 ? 'atendimento' : 'atendimentos'}
            {dados.resumo.concluidos > 0 && ` · ${dados.resumo.concluidos} concluído${dados.resumo.concluidos > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Dia anterior" onClick={() => setDia(somarDias(data, -1))}
            className="flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface text-ink">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {data !== hoje && (
            <button type="button" onClick={() => setDia(undefined)}
              className="h-11 rounded-control border border-line bg-surface px-3 text-[13px] font-semibold text-ink">
              Hoje
            </button>
          )}
          <button type="button" aria-label="Próximo dia" onClick={() => setDia(somarDias(data, 1))}
            className="flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface text-ink">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {data === hoje && <AtivarNotificacoes />}

      {destaque && proxima && (
        <section aria-label="Próxima cliente" className="rounded-card border border-brand/40 bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text">
                {proxima.status === 'em_atendimento' ? 'Em atendimento' : rotuloEmMinutos(destaque.emMinutos) ?? 'Próxima'}
              </p>
              <h2 className="mt-0.5 truncate text-lg font-bold text-ink">{proxima.cliente.name}</h2>
              <p className="text-[13px] text-muted">
                {proxima.time} · {proxima.servico.nome} · {destaque.visitas} {destaque.visitas === 1 ? 'visita' : 'visitas'}
              </p>
            </div>
            <Link href={`/bancada/clientes/${proxima.cliente.id}`} aria-label={`Ficha de ${proxima.cliente.name}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>

          {destaque.alergias && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-control border border-danger/30 bg-danger/12 p-2.5 text-[13px] font-semibold text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Alergia: {destaque.alergias}
            </p>
          )}

          {destaque.ficha.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
              {destaque.ficha.slice(0, 6).map((f) => (
                <div key={f.rotulo} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase text-muted">{f.rotulo}</dt>
                  <dd className="truncate text-ink">{f.valor}</dd>
                </div>
              ))}
            </dl>
          )}

          {destaque.ultimoTrabalho && (
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
              Último com você: <span className="text-ink">{destaque.ultimoTrabalho.servicos}</span>
              {' '}em {destaque.ultimoTrabalho.data.slice(8, 10)}/{destaque.ultimoTrabalho.data.slice(5, 7)}
            </p>
          )}

          <div className="mt-4">{acaoPrincipal(proxima)}</div>
        </section>
      )}

      {dados.agenda.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Agenda livre" description="Nenhum atendimento marcado com você neste dia." />
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Cronograma do dia">
          {dados.agenda.map((a) => (
            <li key={a.id} className="rounded-card border border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                <p className="flex w-12 shrink-0 items-center gap-1 pt-0.5 text-[14px] font-bold tabular-nums text-ink">
                  <Clock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />{a.time}
                </p>
                <div className="min-w-0 flex-1">
                  <Link href={`/bancada/clientes/${a.cliente.id}`} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                    {a.cliente.name}
                  </Link>
                  <p className="truncate text-[13px] text-muted">{a.servico.nome} · {a.servico.duracao} min</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StatusChip status={a.status} />
                    {a.deposito > 0 && a.status !== 'aguardando_pagamento' && (
                      <span className="text-[12px] text-muted">Sinal {formatCurrency(a.deposito)}</span>
                    )}
                    {a.comanda?.enviadaRecepcaoEm && a.comanda.status === 'rascunho' && (
                      <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[12px] font-semibold text-warning-text">Com a recepção</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">{acaoPrincipal(a)}</div>
              </div>
              {(podeReagendar(a, data, hoje, agora) || podeCancelar(a, data, hoje)) && (
                <div className="mt-2 flex gap-2 border-t border-line pt-2">
                  {podeReagendar(a, data, hoje, agora) && (
                    <button type="button" onClick={() => setAlterando({ tipo: 'reagendar', a })}
                      className="flex h-11 items-center gap-1.5 rounded-control px-2 text-[13px] font-semibold text-ink hover:bg-surface-2">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" /> Reagendar
                    </button>
                  )}
                  {podeCancelar(a, data, hoje) && (
                    <button type="button" onClick={() => setAlterando({ tipo: 'cancelar', a })}
                      className="flex h-11 items-center gap-1.5 rounded-control px-2 text-[13px] font-semibold text-danger hover:bg-danger/12">
                      <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {alterando?.tipo === 'reagendar' && (
        <ReagendarModal agendamento={alterando.a} data={data} hoje={hoje}
          onClose={() => setAlterando(null)} onDone={() => { setAlterando(null); carregar(); }} />
      )}
      {alterando?.tipo === 'cancelar' && (
        <CancelarModal agendamento={alterando.a} data={data} hoje={hoje}
          onClose={() => setAlterando(null)} onDone={() => { setAlterando(null); carregar(); }} />
      )}
    </div>
  );
}
