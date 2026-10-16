'use client';

import { useEffect, useState } from 'react';
import { buscarRespostasRapidas, type RespostaRapidaDto } from '@/lib/whatsappInbox';

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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Respostas rápidas">
      {itens.map((r) => {
        const indisponivel = !r.disponivel || !r.texto;
        return (
          <button
            key={r.chave}
            type="button"
            disabled={desabilitado || indisponivel}
            title={indisponivel ? r.motivo ?? undefined : undefined}
            onClick={() => { if (r.texto) onInserir(r.texto); }}
            className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[12px] font-bold text-ink transition-colors hover:bg-line/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {r.rotulo}
          </button>
        );
      })}
    </div>
  );
}
