'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import {
  type Contrato, type FiltroContratos, type ListaContratos, type StatusContrato, type TipoOferta,
  ROTULO_FORMA_CLUBE, STATUS_CONTRATO, clubeApi, dataCurta, rotuloSaldo,
} from '@/lib/clube';
import { Avatar, Banner, Button, Card, Icon, Input, Select, Skeleton } from '@/components/ui';
import { VincularModal } from './VincularModal';
import { ConfirmarCobrancaModal } from './ConfirmarCobrancaModal';

// Aba "Assinantes e pacotes ativos": indicadores, contratos com saldo, cobrança e ações.

interface AssinantesModuleProps { statusInicial?: StatusContrato }

export function AssinantesModule({ statusInicial }: AssinantesModuleProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const dona = user?.role === 'tenant_admin';
  const [filtro, setFiltro] = useState<FiltroContratos>({ status: statusInicial, pagina: 1 });
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState<ListaContratos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [confirmando, setConfirmando] = useState<Contrato | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async (f: FiltroContratos) => {
    setErro(null);
    try {
      setDados(await clubeApi.contratos(f));
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível carregar os contratos.'));
    }
  }, []);

  useEffect(() => { void carregar(filtro); }, [carregar, filtro]);
  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f.busca === busca ? f : { ...f, busca, pagina: 1 })), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const cobrar = async (c: Contrato) => {
    if (!c.cobrancaPendente) return;
    setOcupado(c.id);
    try {
      const r = await clubeApi.reenviar(c.cobrancaPendente.id);
      if (r.enviada) showToast('Cobrança colocada na fila do WhatsApp.', 'success');
      else if (r.pixCopiaCola) {
        await navigator.clipboard?.writeText(r.pixCopiaCola).catch(() => undefined);
        showToast('WhatsApp indisponível: o Pix copia e cola foi copiado para você enviar.', 'info');
      }
      await carregar(filtro);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível reenviar a cobrança.'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const cancelar = async (c: Contrato) => {
    const aviso = c.tipo === 'clube' && c.status === 'ativo' && c.cicloFim
      ? `Cancelar o clube de ${c.cliente.nome}? Ela pode usar até ${dataCurta(c.cicloFim)} e não recebe mais cobranças.`
      : `Cancelar ${c.oferta.nome} de ${c.cliente.nome}? O saldo deixa de valer hoje e nada é devolvido pelo sistema.`;
    if (!window.confirm(aviso)) return;
    setOcupado(c.id);
    try {
      await clubeApi.cancelar(c.id);
      showToast('Contrato cancelado.', 'success');
      await carregar(filtro);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível cancelar.'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      await clubeApi.exportarCsv();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível exportar.'), 'error');
    } finally {
      setExportando(false);
    }
  };

  const ind = dados?.indicadores;
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Assinantes e pacotes ativos
            {dados && <span className="ml-2 text-[15px] font-medium text-muted">{dados.total} {dados.total === 1 ? 'contrato' : 'contratos'}</span>}
          </h1>
          <p className="mt-1 text-[14px] text-muted">Saldo de sessões, próximo vencimento e cobranças. O Pix cai na conta do salão: confirme aqui quando receber.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportar} loading={exportando}>
            <Icon name="download" size={18} />
            Exportar CSV
          </Button>
          <Button onClick={() => setVinculando(true)}>
            <Icon name="add" size={18} />
            Vincular cliente a plano
          </Button>
        </div>
      </div>

      {erro && (
        <Banner tone="danger" variant="inline" action={<Button size="sm" variant="secondary" onClick={() => carregar(filtro)}>Tentar de novo</Button>}>
          {erro}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!ind ? Array.from({ length: 4 }).map((_, i) => <Card key={i} className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-20" /></Card>) : (
          <>
            <Indicador icone="group" rotulo="Contratos ativos" valor={String(ind.ativos)} />
            <Indicador icone="payments" rotulo="Receita recorrente (mês)" valor={formatCurrency(ind.receitaMensal)} legenda="Soma das mensalidades ativas" />
            <Indicador icone="warning" rotulo="Cobranças em atraso" valor={String(ind.emAtraso)} tom={ind.emAtraso ? 'perigo' : undefined}
              acao={ind.emAtraso ? <button type="button" className="text-[13px] font-semibold text-brand-text underline" onClick={() => setFiltro({ ...filtro, status: 'em_atraso', pagina: 1 })}>Ver quem está em atraso</button> : undefined} />
            <Indicador icone="event_busy" rotulo="Encerram em 30 dias" valor={String(ind.cancelam30dias)} legenda="Clubes cancelados ainda no ciclo pago" />
          </>
        )}
      </div>

      <Card className="space-y-4 p-0">
        <div className="flex flex-col gap-3 px-5 pt-5 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="Buscar cliente ou plano" className="pl-9" placeholder="Buscar cliente ou plano" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div role="tablist" aria-label="Tipo" className="flex gap-1">
            {([[undefined, 'Todos'], ['clube', 'Clubes'], ['pacote', 'Pacotes']] as const).map(([v, r]) => (
              <button key={r} type="button" role="tab" aria-selected={filtro.tipo === v}
                onClick={() => setFiltro({ ...filtro, tipo: v as TipoOferta | undefined, pagina: 1 })}
                className={cn('rounded-full border px-3 py-1.5 text-[13px] font-semibold', filtro.tipo === v ? 'border-brand bg-brand/8 text-ink' : 'border-line text-muted')}>
                {r}
              </button>
            ))}
          </div>
          <Select aria-label="Status" className="lg:w-56" value={filtro.status ?? ''}
            onChange={(e) => setFiltro({ ...filtro, status: (e.target.value || undefined) as StatusContrato | undefined, pagina: 1 })}>
            <option value="">Status: vigentes</option>
            {(Object.keys(STATUS_CONTRATO) as StatusContrato[]).map((s) => <option key={s} value={s}>{STATUS_CONTRATO[s].rotulo}</option>)}
          </Select>
        </div>

        {!dados ? (
          <div className="space-y-2 px-5 pb-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : dados.itens.length === 0 ? (
          <p className="px-5 pb-6 text-[14px] text-muted">Nenhum contrato encontrado. Use “Vincular cliente a plano” para vender no balcão.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {dados.itens.map((c) => (
              <LinhaContrato key={c.id} c={c} dona={dona} ocupado={ocupado === c.id}
                onConfirmar={() => setConfirmando(c)} onCobrar={() => cobrar(c)} onCancelar={() => cancelar(c)} />
            ))}
          </ul>
        )}
        {dados && paginas > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
            <span>Página {dados.pagina} de {paginas}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={dados.pagina <= 1} onClick={() => setFiltro({ ...filtro, pagina: dados.pagina - 1 })}>Anterior</Button>
              <Button size="sm" variant="secondary" disabled={dados.pagina >= paginas} onClick={() => setFiltro({ ...filtro, pagina: dados.pagina + 1 })}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {vinculando && (
        <VincularModal
          onClose={() => setVinculando(false)}
          onVinculado={(pendente) => {
            setVinculando(false);
            showToast(pendente ? 'Cobrança Pix enviada. Confirme aqui quando o pagamento cair.' : 'Plano vinculado.', 'success');
            void carregar(filtro);
          }}
        />
      )}
      {confirmando && (
        <ConfirmarCobrancaModal
          contrato={confirmando}
          onClose={() => setConfirmando(null)}
          onConfirmado={() => { setConfirmando(null); showToast('Pagamento confirmado.', 'success'); void carregar(filtro); }}
        />
      )}
    </div>
  );
}

function Indicador({ icone, rotulo, valor, legenda, tom, acao }: {
  icone: string; rotulo: string; valor: string; legenda?: string; tom?: 'perigo'; acao?: React.ReactNode;
}) {
  return (
    <Card className="space-y-1">
      <p className="flex items-center justify-between text-[13px] font-semibold text-muted">
        {rotulo}
        <Icon name={icone} size={18} className={tom === 'perigo' ? 'text-danger' : 'text-muted'} />
      </p>
      <p className={cn('text-2xl font-bold tabular-nums', tom === 'perigo' ? 'text-danger' : 'text-ink')}>{valor}</p>
      {legenda && <p className="text-[12px] text-muted">{legenda}</p>}
      {acao}
    </Card>
  );
}

interface LinhaProps { c: Contrato; dona: boolean; ocupado: boolean; onConfirmar: () => void; onCobrar: () => void; onCancelar: () => void }

function LinhaContrato({ c, dona, ocupado, onConfirmar, onCobrar, onCancelar }: LinhaProps) {
  const s = STATUS_CONTRATO[c.status];
  const saldo = rotuloSaldo(c);
  const vigente = ['aguardando_pagamento', 'ativo', 'em_atraso'].includes(c.status);
  const vencimento = c.status === 'cancelado' && c.cancelaEm
    ? { data: c.cancelaEm, legenda: 'Usa até' }
    : c.tipo === 'pacote'
      ? { data: c.validoAte, legenda: 'Validade do pacote' }
      : { data: c.proximoVencimento, legenda: c.status === 'em_atraso' ? 'Venceu' : 'Próxima mensalidade' };
  return (
    <li className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_110px_150px_110px_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={c.cliente.nome} size={36} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{c.cliente.nome}</p>
          <p className="text-[12px] text-muted">{c.cliente.telefone}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{c.oferta.nome}</p>
        <p className="text-[12px] text-muted">{c.tipo === 'clube' ? 'Clube mensal' : 'Pacote'}{c.origem === 'publico' ? ' · pela página' : ''}</p>
      </div>
      <div className="text-[13px]">
        <p className="font-semibold tabular-nums text-ink">{saldo.principal}</p>
        <p className="text-[12px] text-muted">{saldo.detalhe}</p>
      </div>
      <div className="text-[13px]">
        <p className={cn('font-semibold', c.status === 'em_atraso' ? 'text-danger' : 'text-ink')}>{vencimento.data ? dataCurta(vencimento.data) : '—'}</p>
        <p className="text-[12px] text-muted">{vencimento.legenda}</p>
      </div>
      <div className="text-[13px]">
        <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', s.classe)}>{s.rotulo}</span>
        {c.ultimaForma && <p className="mt-1 text-[12px] text-muted">{ROTULO_FORMA_CLUBE[c.ultimaForma]}</p>}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {c.cobrancaPendente && (
          <>
            <Button size="sm" onClick={onConfirmar} disabled={ocupado}>Confirmar pagamento</Button>
            <Button size="sm" variant="secondary" onClick={onCobrar} loading={ocupado}>
              <Icon name="chat" size={16} />
              Cobrar
            </Button>
          </>
        )}
        {dona && vigente && <Button size="sm" variant="ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</Button>}
      </div>
      {c.cobrancaPendente && (
        <p className="text-[12px] text-muted lg:col-span-6">
          {formatCurrency(c.cobrancaPendente.valor)} vence {dataCurta(c.cobrancaPendente.vencimento)} ·{' '}
          {c.cobrancaPendente.enviadoEm ? `Pix enviado em ${new Date(c.cobrancaPendente.enviadoEm).toLocaleDateString('pt-BR')}` : 'Pix ainda não enviado'}
        </p>
      )}
    </li>
  );
}
