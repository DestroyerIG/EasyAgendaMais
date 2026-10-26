'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { type Oferta, type StatusOferta, type TipoOferta, clubeApi, regraDeUso } from '@/lib/clube';
import { Banner, Button, Card, EmptyState, Icon, Skeleton } from '@/components/ui';
import { OfertaModal } from './OfertaModal';
import { useVocabulario } from '@/hooks/useVocabulario';

// Aba "Planos e pacotes": cartões das ofertas, com filtros e o modal de criar/editar.

type Filtro = 'todos' | TipoOferta;

export function PlanosModule() {
  const { adaptar } = useVocabulario();
  const { user } = useAuth();
  const { showToast } = useToast();
  const dona = user?.role === 'tenant_admin';
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState<Oferta | 'nova' | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setOfertas(await clubeApi.ofertas());
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível carregar os planos.'));
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const mudarStatus = async (o: Oferta, status: StatusOferta) => {
    if (status === 'arquivada' && !window.confirm(`Arquivar ${o.nome}? Ele some da venda; quem já comprou continua usando.`)) return;
    try {
      await clubeApi.mudarStatus(o.id, status);
      showToast(status === 'ativa' ? 'Plano reativado.' : status === 'pausada' ? 'Plano pausado para novas vendas.' : 'Plano arquivado.', 'success');
      await carregar();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível mudar o status.'), 'error');
    }
  };

  const lista = (ofertas ?? []).filter((o) => filtro === 'todos' || o.tipo === filtro);
  const conta = (t: Filtro) => (ofertas ?? []).filter((o) => t === 'todos' || o.tipo === t).length;
  const receitaClube = (ofertas ?? []).filter((o) => o.tipo === 'clube').reduce((t, o) => t + o.receitaMensal, 0);
  const pacotesVigentes = (ofertas ?? []).filter((o) => o.tipo === 'pacote').reduce((t, o) => t + o.contratosAtivos, 0);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Clube e pacotes</h1>
          <p className="mt-1 text-[14px] text-muted">Crie planos por assinatura mensal e pacotes pré-pagos de sessões.</p>
          {ofertas && ofertas.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-3 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1"><Icon name="payments" size={16} />Receita mensal do clube: <strong className="text-ink">{formatCurrency(receitaClube)}</strong></span>
              <span className="inline-flex items-center gap-1"><Icon name="inventory_2" size={16} />{pacotesVigentes} {pacotesVigentes === 1 ? 'pacote vigente' : 'pacotes vigentes'}</span>
            </p>
          )}
        </div>
        {dona && (
          <Button onClick={() => setEditando('nova')}>
            <Icon name="add" size={18} />
            Novo plano ou pacote
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Filtrar planos" className="flex flex-wrap gap-2">
        {([['todos', 'Todos'], ['clube', 'Clubes por assinatura'], ['pacote', 'Pacotes de sessões']] as const).map(([v, r]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={filtro === v}
            onClick={() => setFiltro(v)}
            className={cn('rounded-full border px-3 py-1.5 text-[13px] font-semibold',
              filtro === v ? 'border-brand bg-brand/8 text-ink' : 'border-line text-muted hover:text-ink')}
          >
            {r} ({conta(v)})
          </button>
        ))}
      </div>

      {erro && (
        <Banner tone="danger" variant="inline" action={<Button size="sm" variant="secondary" onClick={carregar}>Tentar de novo</Button>}>
          {erro}
        </Banner>
      )}

      {!ofertas && !erro ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => <Card key={i} className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-24" /><Skeleton className="h-16 w-full" /></Card>)}
        </div>
      ) : ofertas && lista.length === 0 ? (
        <EmptyState
          icon={Crown}
          title={ofertas.length === 0 ? 'Nenhum plano criado ainda' : 'Nada neste filtro'}
          description={adaptar('Clube: a cliente paga todo mês e usa as sessões do mês. Pacote: paga antes e vai usando até acabar.')}
          action={dona && ofertas.length === 0 ? { label: 'Criar o primeiro', onClick: () => setEditando('nova') } : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((o) => <CartaoOferta key={o.id} o={o} dona={dona} onEditar={() => setEditando(o)} onStatus={(s) => mudarStatus(o, s)} />)}
        </div>
      )}

      {editando && (
        <OfertaModal
          oferta={editando === 'nova' ? null : editando}
          onClose={() => setEditando(null)}
          onSalva={() => { setEditando(null); showToast('Plano salvo.', 'success'); void carregar(); }}
        />
      )}
    </div>
  );
}

interface CartaoProps { o: Oferta; dona: boolean; onEditar: () => void; onStatus: (s: StatusOferta) => void }

function CartaoOferta({ o, dona, onEditar, onStatus }: CartaoProps) {
  const { prof, adaptar } = useVocabulario();
  const clube = o.tipo === 'clube';
  return (
    <Card className={cn('flex flex-col gap-4', o.status !== 'ativa' && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-brand-text">{clube ? 'Clube mensal (recorrente)' : 'Pacote de sessões (pré-pago)'}</span>
        {clube && o.publica && o.status === 'ativa' && <span className="rounded-full bg-success/12 px-2.5 py-1 text-success-text">Ativo na página pública</span>}
        {o.status === 'pausada' && <span className="rounded-full bg-warning/12 px-2.5 py-1 text-warning-text">Pausado</span>}
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink">{o.nome}</h2>
        <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
          {formatCurrency(o.preco)}
          {clube && <span className="text-[14px] font-medium text-muted">/mês</span>}
        </p>
        <p className="text-[13px] text-muted">{formatCurrency(o.valorSessao)} por sessão</p>
      </div>
      <ul className="space-y-1.5 text-[14px] text-ink">
        <li className="flex gap-2"><Icon name={clube ? 'event_repeat' : 'check_circle'} size={18} className="shrink-0 text-muted" />{regraDeUso(o)}</li>
        <li className="flex gap-2"><Icon name="spa" size={18} className="shrink-0 text-muted" />{o.servicos.map((s) => s.nome).join(', ')}</li>
        {o.faltaDebita && <li className="flex gap-2"><Icon name="warning" size={18} className="shrink-0 text-warning-text" />Falta debita sessão</li>}
        {o.descontoExtrasPct > 0 && <li className="flex gap-2"><Icon name="sell" size={18} className="shrink-0 text-muted" />{String(o.descontoExtrasPct).replace('.', ',')}% de desconto nos outros itens</li>}
        {o.beneficios.map((b) => <li key={b} className="flex gap-2"><Icon name="star" size={18} className="shrink-0 text-muted" />{b}</li>)}
        <li className="flex gap-2"><Icon name="badge" size={18} className="shrink-0 text-muted" />
          {o.profissionais.length ? `${prof.P}: ${o.profissionais.map((p) => p.nome).join(', ')}` : adaptar('Todas as profissionais')}
        </li>
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
        <span className="text-muted">
          {o.contratosAtivos} {clube ? (o.contratosAtivos === 1 ? 'assinante ativa' : 'assinantes ativas') : (o.contratosAtivos === 1 ? 'pacote em andamento' : 'pacotes em andamento')}
          {' · '}{clube ? 'Mensal' : 'Vendas em 30 dias'}: <strong className="text-ink">{formatCurrency(o.receitaMensal)}</strong>
        </span>
        {dona && (
          <div className="flex gap-2">
            {o.status === 'ativa'
              ? <Button size="sm" variant="ghost" onClick={() => onStatus('pausada')}>Pausar</Button>
              : <Button size="sm" variant="ghost" onClick={() => onStatus('ativa')}>Reativar</Button>}
            <Button size="sm" variant="ghost" onClick={() => onStatus('arquivada')}>Arquivar</Button>
            <Button size="sm" variant="secondary" onClick={onEditar}>Editar</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
