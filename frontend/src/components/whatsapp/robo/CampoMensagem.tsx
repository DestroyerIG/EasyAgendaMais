'use client';

import { useId, useRef } from 'react';
import { Icon, Textarea } from '@/components/ui';
import { inserirVariavel } from '@/lib/inserirVariavel';
import {
  LIMITE_TEXTO_PADRAO, previaTexto, rotuloVariavel, variaveisUsadas, type TextoDto,
} from '@/lib/roboTextos';

interface CampoMensagemProps {
  texto: TextoDto;
  valor: string;
  onMudar: (valor: string) => void;
  onRestaurar: () => void;
}

/** Uma mensagem do robô: variáveis que funcionam nela, avisos, prévia e "Restaurar padrão". */
export function CampoMensagem({ texto, valor, onMudar, onRestaurar }: CampoMensagemProps) {
  const id = useId();
  const caixaRef = useRef<HTMLTextAreaElement>(null);
  const limite = texto.max ?? LIMITE_TEXTO_PADRAO;
  const personalizada = valor !== texto.padrao;
  const usadas = variaveisUsadas(valor);
  const apagadas = (texto.importantes ?? []).filter((v) => !usadas.includes(v));
  const desconhecidas = usadas.filter((v) => !texto.variaveis.includes(v));
  const vazioProibido = !texto.permiteVazio && valor.trim() === '';

  const inserir = (nome: string) => {
    const caixa = caixaRef.current;
    const inicio = caixa?.selectionStart ?? valor.length;
    const fim = caixa?.selectionEnd ?? inicio;
    const r = inserirVariavel(valor, inicio, fim, nome, limite);
    if (!r) return;
    onMudar(r.texto);
    const { cursor } = r;
    requestAnimationFrame(() => {
      caixa?.focus();
      caixa?.setSelectionRange(cursor, cursor);
    });
  };

  const lista = (nomes: string[]) => nomes.map((n) => `{${n}}`).join(', ');

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">{texto.rotulo}</label>
        {personalizada && (
          <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand-text">Personalizada</span>
        )}
      </div>

      {texto.variaveis.length > 0 && (
        <div role="group" aria-label="Variáveis disponíveis" className="flex flex-wrap gap-1.5">
          {texto.variaveis.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`Inserir ${rotuloVariavel(v)} ({${v}})`}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => inserir(v)}
              className="min-h-9 rounded-full bg-whatsapp/12 px-2.5 text-[12px] font-semibold text-whatsapp transition-colors hover:bg-whatsapp/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              + {rotuloVariavel(v)}
            </button>
          ))}
        </div>
      )}

      <Textarea
        id={id}
        ref={caixaRef}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        rows={4}
        maxLength={limite}
        invalid={vazioProibido}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span className="font-semibold">{valor.length}/{limite}</span>
        <button
          type="button"
          onClick={onRestaurar}
          disabled={!personalizada}
          className="inline-flex min-h-9 items-center gap-1 rounded text-[12px] font-bold text-ink transition-colors hover:text-brand-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="restart_alt" size={16} />
          Restaurar padrão
        </button>
      </div>

      {texto.permiteVazio && valor.trim() === '' && (
        <p className="text-[13px] text-muted">
          {texto.caminho === 'promotions' ? 'Sem texto, esta opção não aparece no menu.' : 'Pode ficar em branco.'}
        </p>
      )}
      {vazioProibido && (
        <p role="alert" className="text-[13px] font-semibold text-danger">Este texto não pode ficar em branco.</p>
      )}
      {apagadas.length > 0 && (
        <p className="text-[13px] text-warning">
          Você apagou {lista(apagadas)}. Sem isso, a mensagem pode sair sem informações importantes.
        </p>
      )}
      {desconhecidas.length > 0 && (
        <p className="text-[13px] text-warning">
          {lista(desconhecidas)} não funciona neste texto e vai aparecer como está.
        </p>
      )}

      {valor.trim() !== '' && (
        <div aria-label="Prévia com dados de exemplo" role="group" className="rounded-xl rounded-tl-sm bg-whatsapp/12 p-3">
          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">{previaTexto(valor)}</p>
          <p className="mt-1 text-[11px] font-semibold text-muted">Prévia com dados de exemplo</p>
        </div>
      )}
    </div>
  );
}
