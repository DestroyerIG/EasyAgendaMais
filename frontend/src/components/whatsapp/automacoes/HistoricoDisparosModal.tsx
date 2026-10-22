'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Icon, Modal, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatarTelefone, type Origem, type StatusMensagem } from '@/lib/whatsappInbox';
import { historico, ROTULO_REGRA, type HistoricoAutomacoesDto } from '@/lib/whatsappAutomacoes';

interface HistoricoDisparosModalProps {
  aberto: boolean;
  onFechar(): void;
}

type Item = HistoricoAutomacoesDto['itens'][number];

const STATUS: Record<StatusMensagem, { rotulo: string; icone: string; classe: string }> = {
  recebida: { rotulo: 'Recebida', icone: 'done', classe: 'bg-surface-2 text-muted' },
  enviada: { rotulo: 'Enviada', icone: 'done', classe: 'bg-surface-2 text-muted' },
  entregue: { rotulo: 'Entregue', icone: 'done_all', classe: 'bg-success/12 text-success-text' },
  lida: { rotulo: 'Lida', icone: 'done_all', classe: 'bg-whatsapp/12 text-whatsapp' },
  falhou: { rotulo: 'Falhou', icone: 'error', classe: 'bg-danger/12 text-danger' },
};

const rotuloDoTipo = (tipo: Origem) => (ROTULO_REGRA as Partial<Record<Origem, string>>)[tipo] ?? 'Automação';

const dataHora = (iso: string) => {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const pega = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${pega('day')}/${pega('month')} · ${pega('hour')}:${pega('minute')}`;
};

function Linha({ item }: { item: Item }) {
  const status = STATUS[item.status];
  const telefone = formatarTelefone(item.telefone);
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[14px] font-semibold text-ink">{item.cliente ?? telefone}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
          <span>{rotuloDoTipo(item.tipo)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{dataHora(item.criadaEm)}</span>
        </span>
      </div>
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', status.classe)}>
        <Icon name={status.icone} size={14} />
        {status.rotulo}
      </span>
    </li>
  );
}

export function HistoricoDisparosModal({ aberto, onFechar }: HistoricoDisparosModalProps) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (ativo: () => boolean = () => true) => {
    setErro(false);
    setItens(null);
    try {
      const r = await historico();
      if (ativo()) setItens(r.itens);
    } catch {
      if (ativo()) setErro(true);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    void carregar(() => ativo);
    return () => { ativo = false; };
  }, [aberto, carregar]);

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      title="Histórico de disparos"
      icon="history"
      description="Últimas mensagens enviadas pelas automações."
      size="lg"
      telaCheiaNoCelular
    >
      {erro ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-[14px] text-muted">Não foi possível carregar o histórico.</p>
          <Button variant="secondary" size="sm" onClick={() => void carregar()}>Tentar novamente</Button>
        </div>
      ) : !itens ? (
        <Skeleton className="h-48 w-full" label="Carregando histórico..." />
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Icon name="history_toggle_off" size={32} className="text-muted" />
          <p className="text-[15px] text-muted">Nenhum disparo automático ainda</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {itens.map((item) => <Linha key={item.id} item={item} />)}
        </ul>
      )}
    </Modal>
  );
}
