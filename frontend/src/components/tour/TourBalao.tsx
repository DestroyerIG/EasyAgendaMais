'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Icon } from '@/components/ui';
import { PASSOS_TOUR, TOTAL_PASSOS_TOUR } from '@/lib/tour';

interface Props {
  indice: number;
  onAvancar: () => void;
  onVoltar: () => void;
  onPular: () => void;
}

const FOLGA = 6;
const LARGURA_BALAO = 360;
const DESKTOP_MIN = 1024;

interface Alvo { top: number; left: number; width: number; height: number }

/** Acha o item do menu do passo; no celular, os itens do "Mais" são representados pelo botão "Mais". */
function medirAlvo(nav: string | undefined): Alvo | null {
  if (!nav) return null;
  for (const chave of [`nav-${nav}`, 'nav-mais']) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${chave}"]`);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

export function TourBalao({ indice, onAvancar, onVoltar, onPular }: Props) {
  const passo = PASSOS_TOUR[indice]!;
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [desktop, setDesktop] = useState(true);
  const [altura, setAltura] = useState(0);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const medir = () => {
      setAlvo(medirAlvo(passo.nav));
      setDesktop(window.innerWidth >= DESKTOP_MIN);
      setAltura(window.innerHeight);
    };
    medir();
    // A tela do passo carrega logo depois do clique: mede de novo quando ela já montou.
    const t = window.setTimeout(medir, 250);
    window.addEventListener('resize', medir);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', medir);
    };
  }, [passo.nav]);

  useEffect(() => {
    botaoRef.current?.focus();
  }, [indice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPular();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPular]);

  const primeiro = indice === 0;
  const ultimo = indice === TOTAL_PASSOS_TOUR - 1;

  // Posição do balão: ao lado do item no computador, acima da barra inferior no celular, ou no centro.
  let posicao: CSSProperties = {};
  const centralizado = !alvo;
  if (alvo && desktop) {
    const topo = alvo.top + alvo.height / 2 - 120;
    posicao = { left: alvo.left + alvo.width + 20, top: Math.max(16, Math.min(topo, altura - 340)), width: LARGURA_BALAO };
  } else if (alvo) {
    posicao = { left: 16, right: 16, bottom: 'calc(5rem + env(safe-area-inset-bottom))' };
  }

  return (
    <div className="fixed inset-0 z-[60]" data-testid="tour">
      {/* Camada que segura os cliques: durante o tour só o balão responde. */}
      <div className={alvo ? 'absolute inset-0' : 'absolute inset-0 bg-scrim/60'} aria-hidden="true" />
      {alvo && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: alvo.top - FOLGA,
            left: alvo.left - FOLGA,
            width: alvo.width + FOLGA * 2,
            height: alvo.height + FOLGA * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
          }}
        />
      )}
      <div
        className={centralizado ? 'absolute inset-0 flex items-center justify-center p-4' : undefined}
        style={centralizado ? undefined : { position: 'absolute', ...posicao }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-titulo"
          aria-describedby="tour-texto"
          className="w-full max-w-[360px] rounded-card border border-line bg-surface p-5 text-ink shadow-xl"
          style={centralizado ? undefined : { maxWidth: 'none' }}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-text">
              <Icon name={passo.icone} size={22} />
            </span>
            <div className="min-w-0">
              <h2 id="tour-titulo" className="text-[17px] font-bold leading-tight">{passo.titulo}</h2>
              <p id="tour-texto" className="mt-1.5 text-[14px] leading-relaxed text-muted">{passo.texto}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            {PASSOS_TOUR.map((p, i) => (
              <span key={p.id} className={i === indice ? 'h-1.5 w-4 rounded-full bg-brand' : 'h-1.5 w-1.5 rounded-full bg-line'} />
            ))}
          </div>
          <p className="mt-2 text-[12px] font-semibold text-muted" aria-live="polite">Passo {indice + 1} de {TOTAL_PASSOS_TOUR}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            {ultimo ? (
              <span />
            ) : (
              <Button variant="ghost" size="sm" onClick={onPular}>{primeiro ? 'Agora não' : 'Pular tour'}</Button>
            )}
            <div className="flex gap-2">
              {!primeiro && <Button variant="secondary" size="sm" onClick={onVoltar}>Voltar</Button>}
              <Button ref={botaoRef} size="sm" onClick={onAvancar}>
                {primeiro ? 'Começar o tour' : ultimo ? 'Concluir' : 'Próximo'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
