'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { buscarRespostasRapidas, type RespostaRapidaDto } from '@/lib/whatsappInbox';

const ICONE: Record<RespostaRapidaDto['chave'], { nome: string; classe: string }> = {
  pix: { nome: 'bolt', classe: 'text-brand-text' },
  como_chegar: { nome: 'location_on', classe: 'text-brand-text' },
  horarios: { nome: 'event_available', classe: 'text-tertiary' },
  politica: { nome: 'policy', classe: 'text-muted' },
};

interface RespostasRapidasProps {
  conversaId: string;
  desabilitado?: boolean;
  onInserir: (texto: string) => void;
}

export function RespostasRapidas({ conversaId, desabilitado = false, onInserir }: RespostasRapidasProps) {
  const [itens, setItens] = useState<RespostaRapidaDto[]>([]);

  useEffect(() => {
    let ativo = true;
    setItens([]);
    buscarRespostasRapidas(conversaId)
      .then((lista) => { if (ativo) setItens(lista); })
      .catch(() => { if (ativo) setItens([]); });
    return () => { ativo = false; };
  }, [conversaId]);

  if (itens.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Respostas rápidas">
      {itens.map((r) => {
        const indisponivel = !r.disponivel || !r.texto;
        return (
          <button
            key={r.chave}
            type="button"
            disabled={desabilitado || indisponivel}
            title={indisponivel ? r.motivo ?? undefined : undefined}
            onClick={() => { if (r.texto) onInserir(r.texto); }}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-line/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name={ICONE[r.chave]?.nome ?? 'bolt'} size={14} className={ICONE[r.chave]?.classe ?? 'text-brand-text'} />
            {r.rotulo}
          </button>
        );
      })}
    </div>
  );
}
