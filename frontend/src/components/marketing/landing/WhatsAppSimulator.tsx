'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BadgeCheck, Bot, CheckCheck, CheckCircle2, MoreVertical, Phone, QrCode, Video } from 'lucide-react';

type ClientBubble = {
  from: 'cliente';
  text: string;
  time: string;
};

type BotBubble = {
  from: 'bot';
  text: string;
  time: string;
  pixLink?: boolean;
  confirmed?: boolean;
};

type Bubble = ClientBubble | BotBubble;

const bubbles: Bubble[] = [
  { from: 'cliente', text: 'Oi! Tem horário pra sexta à tarde?', time: '14:15' },
  {
    from: 'bot',
    text: 'Olá! Temos 2 horários vagos nesta sexta: 14h00 e 16h30. Qual prefere reservar?',
    time: '14:15',
  },
  { from: 'cliente', text: '14h00, por favor!', time: '14:16' },
  {
    from: 'bot',
    text: 'Perfeito! Horário reservado provisoriamente. Para confirmar, toque aqui ou pague o sinal de R$ 30,00 via Pix. O valor é integralmente abatido no atendimento.',
    time: '14:16',
    pixLink: true,
  },
  {
    from: 'bot',
    text: 'Agendamento garantido para sexta às 14h00. Te avisamos 24h antes por aqui.',
    time: '14:17',
    confirmed: true,
  },
];

const PAUSE_BEFORE_LOOP_MS = 4000;
const TYPING_DURATION_MS = 1100;
const GAP_AFTER_BUBBLE_MS = 750;

export function WhatsAppSimulator() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingIndex, setTypingIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const playFrom = (index: number) => {
      if (cancelled) return;

      if (index >= bubbles.length) {
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setVisibleCount(0);
          setTypingIndex(null);
          playFrom(0);
        }, PAUSE_BEFORE_LOOP_MS);
        return;
      }

      const bubble = bubbles[index];

      if (bubble.from === 'bot') {
        setTypingIndex(index);
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setTypingIndex(null);
          setVisibleCount(index + 1);
          timeoutId = setTimeout(() => playFrom(index + 1), GAP_AFTER_BUBBLE_MS);
        }, TYPING_DURATION_MS);
      } else {
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setVisibleCount(index + 1);
          timeoutId = setTimeout(() => playFrom(index + 1), GAP_AFTER_BUBBLE_MS);
        }, 500);
      }
    };

    playFrom(0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount, typingIndex]);

  return (
    <div className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-line">
            <Image
              src="/images/whatsapp-avatar.jpg"
              alt="Foto da profissional do Studio Exemplo"
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-ink">Studio Exemplo</span>
              <BadgeCheck className="h-4 w-4 text-status-confirmed" aria-hidden="true" />
            </div>
            <span className="text-xs font-bold text-whatsapp">WhatsApp</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-muted">
          <Video className="h-5 w-5" aria-hidden="true" />
          <Phone className="h-5 w-5" aria-hidden="true" />
          <MoreVertical className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div ref={scrollRef} className="flex h-[420px] flex-col gap-3 overflow-y-auto scroll-smooth bg-bg p-4">
        <span className="mx-auto rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-muted">Hoje</span>

        {bubbles.slice(0, visibleCount).map((bubble, index) => (
          <div
            key={index}
            className={[
              'max-w-[85%] animate-fade-in rounded-2xl border border-line bg-surface p-3 shadow-sm',
              bubble.from === 'cliente' ? 'self-end rounded-tr-none' : 'self-start rounded-tl-none',
            ].join(' ')}
          >
            {bubble.from === 'bot' && !bubble.confirmed && (
              <div className="mb-1 flex items-center gap-1 text-brand">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs font-bold">EasyAgenda+ Bot</span>
              </div>
            )}

            {bubble.from === 'bot' && bubble.confirmed && (
              <div className="mb-1 flex items-center gap-1.5 text-whatsapp">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm font-bold">Sinal confirmado!</span>
              </div>
            )}

            <p className="text-sm text-ink">{bubble.text}</p>

            {bubble.from === 'bot' && bubble.pixLink && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-line bg-bg p-2.5">
                <div className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-brand" aria-hidden="true" />
                  <span className="text-xs font-bold text-ink">Pix Copia e Cola Gerado</span>
                </div>
                <span className="text-xs font-bold text-status-confirmed">Copiar Código</span>
              </div>
            )}

            <div className="mt-1 flex items-center justify-end gap-1 text-muted">
              <span className="text-[11px] tabular-nums">{bubble.time}</span>
              {bubble.from === 'cliente' && <CheckCheck className="h-3.5 w-3.5 text-status-confirmed" aria-hidden="true" />}
            </div>
          </div>
        ))}

        {typingIndex !== null && (
          <div className="flex max-w-[85%] animate-fade-in items-center gap-1 self-start rounded-2xl rounded-tl-none border border-line bg-surface px-4 py-3 shadow-sm">
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-muted" />
          </div>
        )}
      </div>
    </div>
  );
}
