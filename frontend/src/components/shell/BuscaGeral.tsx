'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useVocabulario } from '@/hooks/useVocabulario';
import { useBuscaGeral } from '@/hooks/useBuscaGeral';
import { cn } from '@/lib/cn';
import { BuscaResultados } from './BuscaResultados';
import { useTopBarSearchConfig } from './TopBarSearchContext';

function ehCampoDeTexto(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function BuscaGeral() {
  const registrada = useTopBarSearchConfig();
  const cli = useVocabulario().cli;
  const busca = useBuscaGeral();
  const idLista = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/mac/i.test(navigator.platform));
  }, []);

  // Ctrl K / Cmd K leva o foco à barra, menos quando outro campo de texto está em uso.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey)) return;
      const input = campo.current;
      if (!input || input.getClientRects().length === 0) return;
      const foco = document.activeElement;
      if (foco !== input && ehCampoDeTexto(foco)) return;
      e.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  // Clique fora fecha a lista.
  const { setAberta } = busca;
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberta(false);
    };
    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [setAberta]);

  const aberta = !registrada && busca.aberta;
  const placeholder = registrada?.placeholder ?? `Buscar ${cli.s}, agendamento ou tela...`;
  const idAtivo = aberta && busca.itens.length > 0 ? `${idLista}-${busca.ativo}` : undefined;

  return (
    <div ref={caixa} className="relative hidden items-center sm:flex">
      <Icon name="search" size={19} className="pointer-events-none absolute left-3 text-muted" />
      {/* Um único <input>, sempre controlado (value nunca é undefined). */}
      <input
        ref={campo}
        type="text"
        maxLength={80}
        value={registrada ? registrada.value : busca.termo}
        onChange={(e) => (registrada ? registrada.onChange(e.target.value) : busca.setTermo(e.target.value))}
        onKeyDown={registrada ? undefined : busca.aoTeclar}
        onFocus={() => !registrada && busca.termo.trim() && busca.setAberta(true)}
        // Tab para fora fecha a lista; clicar numa opção não tira o foco (mouseDown com preventDefault).
        onBlur={() => !registrada && busca.setAberta(false)}
        placeholder={placeholder}
        role={registrada ? undefined : 'combobox'}
        aria-label={placeholder}
        aria-expanded={registrada ? undefined : aberta}
        aria-controls={registrada ? undefined : aberta ? idLista : undefined}
        aria-activedescendant={registrada ? undefined : idAtivo}
        aria-autocomplete={registrada ? undefined : 'list'}
        autoComplete="off"
        className={cn(
          'w-[22rem] rounded-xl border border-line bg-surface-2 py-1.5 pl-9 pr-14 text-[13px] text-ink placeholder-muted transition-all',
          'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        )}
      />
      <kbd className="pointer-events-none absolute right-3 rounded border border-line px-1 text-[10px] font-medium text-muted">
        {mac ? '⌘ K' : 'Ctrl K'}
      </kbd>
      {aberta && (
        <div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-96 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
          <BuscaResultados
            idLista={idLista}
            itens={busca.itens}
            status={busca.status}
            termo={busca.termo}
            ativo={busca.ativo}
            onEscolher={busca.escolher}
            onPassar={busca.setAtivo}
          />
        </div>
      )}
    </div>
  );
}
