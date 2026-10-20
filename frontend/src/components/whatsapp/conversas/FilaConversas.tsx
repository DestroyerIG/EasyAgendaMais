'use client';

import { useState } from 'react';
import { Button, Icon, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { getInitials } from '@/components/ui/Avatar';
import {
  formatarTelefoneLocal,
  horaCurta,
  type ConversaResumoDto,
  type FiltroConversa,
  type ListaConversasDto,
} from '@/lib/whatsappInbox';

const FILTROS: Array<{ id: FiltroConversa; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'aguardando', rotulo: 'Aguardando você' },
  { id: 'bot', rotulo: 'Pelo Bot' },
  { id: 'finalizadas', rotulo: 'Finalizadas' },
];

interface FilaConversasProps {
  filtro: FiltroConversa;
  dados: ListaConversasDto | null;
  selecionadaId: string | null;
  onSelecionar: (conversa: ConversaResumoDto) => void;
  onMarcarLidas: () => void;
  onCarregarMais: () => void;
  erro?: boolean;
  carregandoMais?: boolean;
  onTentarNovamente?: () => void;
}

type Tom = 'brand' | 'aviso' | 'neutro';

function Selo({ children, tom }: { children: string; tom: Tom }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tom === 'brand' && 'bg-brand/15 text-brand-text',
        tom === 'aviso' && 'bg-warning/15 text-warning-text',
        tom === 'neutro' && 'bg-surface-2 text-muted',
      )}
    >
      {children}
    </span>
  );
}

/** Um selo só por conversa: quem está com ela agora. */
function seloDa(c: ConversaResumoDto): { rotulo: string; tom: Tom } {
  if (c.status === 'aguardando') return { rotulo: 'Aguardando', tom: 'aviso' };
  if (c.atendimento === 'humano') return c.responsavel ? { rotulo: 'Humano', tom: 'brand' } : { rotulo: 'Aguardando', tom: 'aviso' };
  return { rotulo: 'Bot', tom: 'neutro' };
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca local nos itens já carregados: nome, prévia e, quando o termo é um número, o telefone. */
export function filtrarPorBusca(itens: ConversaResumoDto[], busca: string): ConversaResumoDto[] {
  const termo = semAcento(busca.trim());
  if (!termo) return itens;
  const digitos = /^[\d\s()+-]+$/.test(termo) ? termo.replace(/\D/g, '') : '';
  return itens.filter((c) => (
    semAcento(c.nome ?? '').includes(termo)
    || semAcento(c.previa).includes(termo)
    || (digitos !== '' && c.telefone.replace(/\D/g, '').includes(digitos))
  ));
}

function ItemConversa({ c, selecionada, onSelecionar }: { c: ConversaResumoDto; selecionada: boolean; onSelecionar: () => void }) {
  const telefone = formatarTelefoneLocal(c.telefone);
  const selo = seloDa(c);
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-current={selecionada ? 'true' : undefined}
      className={cn(
        'relative flex w-full shrink-0 flex-col gap-2 rounded-xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
        selecionada ? 'bg-surface-m3-low' : 'hover:bg-surface-m3-low/60',
      )}
    >
      {selecionada ? <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r bg-brand" aria-hidden="true" /> : null}
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-muted">
            {c.nome ? getInitials(c.nome) : <Icon name="person" size={22} className="text-muted" />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="break-words text-[15px] font-bold leading-5 text-ink">{c.nome ?? telefone}</span>
              <Selo tom={selo.tom}>{selo.rotulo}</Selo>
            </span>
            <span className="font-mono text-[11px] text-muted">{telefone}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[11px] font-bold text-brand-text">{horaCurta(c.ultimaMensagemEm)}</span>
          {c.naoLidas > 0 ? (
            <span
              aria-label={`${c.naoLidas} não lida${c.naoLidas > 1 ? 's' : ''}`}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-on-brand shadow-sm"
            >
              {c.naoLidas}
            </span>
          ) : null}
        </span>
      </span>
      <span className={cn('line-clamp-2 pl-1 text-[14px] leading-5', c.naoLidas > 0 ? 'font-semibold text-ink' : 'text-muted')}>{c.previa}</span>
      {c.responsavel || c.sinalPendente ? (
        <span className="flex items-center justify-between gap-2 pt-0.5 text-[11px] font-semibold text-muted">
          {c.responsavel ? (
            <span className="flex min-w-0 items-center gap-1">
              <Icon name="face" size={14} />
              {`Atendente: ${c.responsavel.nome}`}
            </span>
          ) : <span />}
          {c.sinalPendente ? (
            <span className="flex shrink-0 items-center gap-0.5 font-bold text-brand-text">
              Sinal pendente
              <Icon name="payments" size={13} />
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

interface FiltrosConversaProps {
  filtro: FiltroConversa;
  onFiltro: (filtro: FiltroConversa) => void;
  contadores?: ListaConversasDto['contadores'];
}

/** Filtros segmentados do cabeçalho da Central; no celular rolam na horizontal, numa linha só. */
export function FiltrosConversa({ filtro, onFiltro, contadores }: FiltrosConversaProps) {
  return (
    <div role="group" aria-label="Filtrar conversas" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-sm">
      {FILTROS.map((f) => {
        const ativo = f.id === filtro;
        const n = contadores?.[f.id];
        const mostrarN = n !== undefined && !(f.id === 'finalizadas' && n === 0);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={ativo}
            onClick={() => onFiltro(f.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
              ativo ? 'bg-surface-2 font-bold text-brand-text' : 'text-muted hover:bg-surface-m3-low hover:text-ink',
            )}
          >
            {f.rotulo}
            {mostrarN ? (
              <span className={cn(f.id === 'aguardando' && n > 0 ? 'rounded-full bg-warning/15 px-1.5 font-bold text-warning-text' : 'opacity-70')}>{n}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function FilaConversas({
  filtro, dados, selecionadaId, onSelecionar, onMarcarLidas, onCarregarMais, erro = false, carregandoMais = false, onTentarNovamente,
}: FilaConversasProps) {
  const [busca, setBusca] = useState('');
  const corpo = () => {
    if (!dados) {
      if (erro) {
        return (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-[14px] text-muted">Não foi possível carregar as conversas.</p>
            <Button variant="secondary" size="sm" onClick={onTentarNovamente}>Tentar de novo</Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-20 w-full" label="Carregando conversas" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      );
    }
    if (dados.itens.length === 0) {
      const semNenhuma = dados.contadores.todas === 0 && filtro === 'todas';
      return (
        <p className="px-4 py-10 text-center text-[14px] text-muted">
          {semNenhuma ? 'Nenhuma conversa ainda. As mensagens das clientes aparecem aqui.' : 'Nenhuma conversa neste filtro.'}
        </p>
      );
    }
    const itens = filtrarPorBusca(dados.itens, busca);
    if (itens.length === 0) {
      return <p className="px-4 py-10 text-center text-[14px] text-muted">Nenhuma conversa encontrada.</p>;
    }
    return (
      <>
        {itens.map((c) => (
          <ItemConversa key={c.id} c={c} selecionada={c.id === selecionadaId} onSelecionar={() => onSelecionar(c)} />
        ))}
        {dados.proximoCursor ? (
          <Button variant="ghost" size="sm" onClick={onCarregarMais} loading={carregandoMais} className="self-center">
            Carregar mais
          </Button>
        ) : null}
      </>
    );
  };

  return (
    <section aria-label="Fila de atendimento" className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-surface p-3 shadow-sm">
      <label className="flex items-center gap-2 rounded-lg bg-surface-m3-low px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-brand">
        <Icon name="search" size={18} className="text-muted" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou mensagem..."
          aria-label="Buscar cliente ou mensagem"
          className="w-full bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none"
        />
      </label>
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Fila de atendimento</span>
        <button
          type="button"
          onClick={onMarcarLidas}
          className="text-[12px] font-bold text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          Marcar lidas
        </button>
      </div>
      <div className="flex min-h-40 flex-1 flex-col gap-1 overflow-y-auto pr-1 lg:min-h-0">{corpo()}</div>
    </section>
  );
}
