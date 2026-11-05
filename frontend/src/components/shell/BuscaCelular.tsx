'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useVocabulario } from '@/hooks/useVocabulario';
import { useBuscaGeral } from '@/hooks/useBuscaGeral';
import { BuscaResultados } from './BuscaResultados';

/** Busca geral em tela cheia no celular. Tem o próprio termo e ignora a busca registrada pela tela. */
export function BuscaCelular() {
  const cli = useVocabulario().cli;
  const [aberto, setAberto] = useState(false);
  const busca = useBuscaGeral({ aoEscolher: () => setAberto(false) });
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);

  const { setTermo } = busca;
  const mudarAberto = (valor: boolean) => {
    if (!valor) setTermo('');
    setAberto(valor);
  };

  const idAtivo = busca.aberta && busca.itens.length > 0 ? `${idLista}-${busca.ativo}` : undefined;

  return (
    <Dialog.Root open={aberto} onOpenChange={mudarAberto}>
      <Dialog.Trigger
        aria-label="Buscar"
        className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
      >
        <Icon name="search" size={22} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            campo.current?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-bg"
        >
          <Dialog.Title className="sr-only">Buscar</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
            <div className="relative min-w-0 flex-1">
              <Icon name="search" size={19} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={campo}
                type="text"
                maxLength={80}
                value={busca.termo}
                onChange={(e) => busca.setTermo(e.target.value)}
                onKeyDown={busca.aoTeclar}
                placeholder={`Buscar ${cli.s}, agendamento ou tela...`}
                role="combobox"
                aria-label="Buscar"
                aria-expanded={busca.aberta}
                aria-controls={busca.aberta ? idLista : undefined}
                aria-activedescendant={idAtivo}
                aria-autocomplete="list"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-[15px] text-ink placeholder-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <Dialog.Close className="h-11 shrink-0 px-2 text-[14px] font-semibold text-ink">Fechar</Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {busca.aberta && (
              <BuscaResultados
                idLista={idLista}
                itens={busca.itens}
                status={busca.status}
                termo={busca.termo}
                ativo={busca.ativo}
                onEscolher={busca.escolher}
                onPassar={busca.setAtivo}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
