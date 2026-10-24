'use client';

import { useRef } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { inserirVariavel } from '@/lib/inserirVariavel';
import { LIMITE_TEXTO_CAMPANHA, RODAPE_SAIR, VARIAVEIS_CAMPANHA } from '@/lib/whatsappCampanhas';
import { CabecalhoPasso } from './comum';

interface PassoMensagemProps {
  texto: string;
  onMudar(texto: string): void;
}

export function PassoMensagem({ texto, onMudar }: PassoMensagemProps) {
  const caixaRef = useRef<HTMLTextAreaElement>(null);
  const acimaDoLimite = texto.length > LIMITE_TEXTO_CAMPANHA;

  const inserirNoCursor = (nome: string) => {
    const caixa = caixaRef.current;
    const inicio = caixa?.selectionStart ?? texto.length;
    const fim = caixa?.selectionEnd ?? inicio;
    const r = inserirVariavel(texto, inicio, fim, nome, LIMITE_TEXTO_CAMPANHA);
    if (!r) return;
    onMudar(r.texto);
    requestAnimationFrame(() => {
      caixa?.focus();
      caixa?.setSelectionRange(r.cursor, r.cursor);
    });
  };

  return (
    <section aria-labelledby="passo-mensagem" className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm sm:p-6">
      <CabecalhoPasso numero={2} id="passo-mensagem" titulo="Mensagem & Personalização">
        <span className="text-[11px] text-muted">Tags sincronizadas em tempo real</span>
      </CabecalhoPasso>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Clique para inserir variável no texto:</span>
          <span className="text-[11px] font-bold text-brand-text">Tags Dinâmicas</span>
        </div>
        <div role="group" aria-label="Variáveis disponíveis" className="flex flex-wrap gap-2">
          {VARIAVEIS_CAMPANHA.map((v) => {
            const link = v === 'link';
            return (
              <button
                key={v}
                type="button"
                aria-label={`{${v}}`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => inserirNoCursor(v)}
                className={cn(
                  'flex min-h-9 items-center gap-1 rounded-lg px-3 py-1 text-[13px] text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                  link ? 'bg-brand/15 hover:bg-brand/25' : 'bg-surface-2 hover:bg-line/60',
                )}
              >
                {link ? <Icon name="link" size={14} /> : null}
                <span className="font-bold text-brand-text">{'{'}</span>
                {v}
                <span className="font-bold text-brand-text">{'}'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="camp-texto" className="sr-only">Texto da mensagem</label>
        <textarea
          id="camp-texto"
          ref={caixaRef}
          value={texto}
          maxLength={LIMITE_TEXTO_CAMPANHA}
          rows={7}
          placeholder="Digite o conteúdo da campanha..."
          onChange={(ev) => onMudar(ev.target.value)}
          aria-invalid={acimaDoLimite || undefined}
          className="w-full resize-y rounded-xl bg-surface-m3-low p-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        />
        <div
          data-testid="rodape-fixo"
          className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-muted"
        >
          <Icon name="lock" size={16} className="shrink-0" />
          <span>
            <span className="font-semibold text-ink">Rodapé automático: </span>
            <em>{RODAPE_SAIR}</em>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted">
          <span className={cn('font-semibold', acimaDoLimite && 'text-danger')}>
            {`${texto.length} de ${LIMITE_TEXTO_CAMPANHA} caracteres`}
          </span>
          <span className="flex items-center gap-1 font-medium">
            <Icon name="info" size={14} className="text-whatsapp" />
            Variáveis renderizadas conforme a ficha individual de cada cliente.
          </span>
        </div>
      </div>
    </section>
  );
}
