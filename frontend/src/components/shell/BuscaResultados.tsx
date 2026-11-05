'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/ui';
import { useVocabulario } from '@/hooks/useVocabulario';
import { cn } from '@/lib/cn';
import type { ItemBusca } from '@/lib/busca';
import type { StatusBusca } from '@/hooks/useBuscaGeral';

export interface BuscaResultadosProps {
  idLista: string;
  itens: ItemBusca[];
  status: StatusBusca;
  termo: string;
  ativo: number;
  onEscolher: (item: ItemBusca) => void;
  onPassar: (indice: number) => void;
}

const GRUPOS = ['clientes', 'agendamentos', 'telas'] as const;

export function BuscaResultados({ idLista, itens, status, termo, ativo, onEscolher, onPassar }: BuscaResultadosProps) {
  const cli = useVocabulario().cli;
  const titulos = { clientes: cli.P, agendamentos: 'Agendamentos', telas: 'Telas' };
  const buscando = status === 'buscando';
  // Sem resposta do servidor (bloqueada) e sem telas, também não deixa o painel vazio.
  const nada = (status === 'pronto' || status === 'bloqueada') && itens.length === 0;

  // O item marcado pelas setas precisa ficar à vista na lista com rolagem.
  useEffect(() => {
    document.getElementById(`${idLista}-${ativo}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [idLista, ativo, itens]);

  return (
    <div>
      <div id={idLista} role="listbox" aria-label="Resultados da busca">
        {GRUPOS.map((grupo) => {
          const doGrupo = itens
            .map((item, indice) => ({ item, indice }))
            .filter(({ item }) => item.grupo === grupo);
          if (doGrupo.length === 0) return null;
          return (
            <div key={grupo} role="presentation" className="py-1">
              <div role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                {titulos[grupo]}
              </div>
              {doGrupo.map(({ item, indice }) => (
                <div
                  key={item.chave}
                  id={`${idLista}-${indice}`}
                  role="option"
                  aria-selected={indice === ativo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onEscolher(item)}
                  onMouseMove={() => indice !== ativo && onPassar(indice)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px]',
                    indice === ativo ? 'bg-surface-2' : '',
                  )}
                >
                  {item.icone && <Icon name={item.icone} size={18} className="shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{item.titulo}</span>
                    {item.detalhe && <span className="block truncate text-[12px] text-muted">{item.detalhe}</span>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {buscando && <p className="px-3 py-2 text-[12px] text-muted">Buscando...</p>}
      {status === 'erro' && (
        <p className="px-3 py-2 text-[12px] text-muted">{`Não foi possível buscar ${cli.p} agora.`}</p>
      )}
      {nada && <p className="px-3 py-3 text-[13px] text-muted">{`Nada encontrado para "${termo.trim()}".`}</p>}
      <div aria-live="polite" className="sr-only">
        {status === 'ocioso' || buscando ? '' : `${itens.length} ${itens.length === 1 ? 'resultado' : 'resultados'}`}
      </div>
    </div>
  );
}
