'use client';

import { Button, Icon, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { getInitials } from '@/components/ui/Avatar';
import {
  formatarTelefone,
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

function Selo({ children, tom }: { children: string; tom: 'brand' | 'aviso' | 'neutro' }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
        tom === 'brand' && 'bg-brand/15 text-brand-text',
        tom === 'aviso' && 'bg-warning/15 text-warning-text',
        tom === 'neutro' && 'bg-surface-2 text-muted',
      )}
    >
      {children}
    </span>
  );
}

function ItemConversa({ c, selecionada, onSelecionar }: { c: ConversaResumoDto; selecionada: boolean; onSelecionar: () => void }) {
  const telefone = formatarTelefone(c.telefone);
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-current={selecionada ? 'true' : undefined}
      className={cn(
        'relative flex w-full flex-col gap-2 rounded-xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
        selecionada ? 'bg-surface-2' : 'hover:bg-surface-2/60',
      )}
    >
      {selecionada ? <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r bg-brand" aria-hidden="true" /> : null}
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-brand-text">
            {c.nome ? getInitials(c.nome) : <Icon name="person" size={22} className="text-muted" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-bold text-ink">{c.nome ?? telefone}</span>
              {c.atendimento === 'humano' && c.responsavel ? <Selo tom="brand">Humano</Selo> : null}
              {c.status === 'aguardando' ? <Selo tom="aviso">Aguardando</Selo> : null}
              {c.atendimento === 'bot' ? <Selo tom="neutro">Bot</Selo> : null}
            </span>
            <span className="font-mono text-[12px] text-muted">{telefone}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[12px] font-bold text-brand-text">{horaCurta(c.ultimaMensagemEm)}</span>
          {c.naoLidas > 0 ? (
            <span
              aria-label={`${c.naoLidas} não lida${c.naoLidas > 1 ? 's' : ''}`}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-on-brand"
            >
              {c.naoLidas}
            </span>
          ) : null}
        </span>
      </span>
      <span className={cn('line-clamp-1 pl-1 text-[13px]', c.naoLidas > 0 ? 'font-semibold text-ink' : 'text-muted')}>{c.previa}</span>
      {c.responsavel || c.sinalPendente ? (
        <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
          {c.responsavel ? (
            <span className="flex items-center gap-1">
              <Icon name="face" size={14} />
              {`Atendente: ${c.responsavel.nome}`}
            </span>
          ) : <span />}
          {c.sinalPendente ? (
            <span className="flex items-center gap-0.5 font-bold text-brand-text">
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

/** Pílulas de filtro do cabeçalho da Central; no celular rolam na horizontal, numa linha só. */
export function FiltrosConversa({ filtro, onFiltro, contadores }: FiltrosConversaProps) {
  return (
    <div role="group" aria-label="Filtrar conversas" className="flex items-center gap-2 overflow-x-auto">
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
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
              ativo ? 'bg-brand/15 font-bold text-brand-text' : 'bg-surface-2 text-muted hover:text-ink',
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
    return (
      <>
        {dados.itens.map((c) => (
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
      <div className="flex min-h-40 flex-1 flex-col gap-1 overflow-y-auto pr-1">{corpo()}</div>
    </section>
  );
}
