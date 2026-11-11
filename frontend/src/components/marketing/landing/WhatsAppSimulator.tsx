'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui';

type ClientBubble = {
  from: 'cliente';
  text: string;
  time: string;
};

type BotBubble = {
  from: 'bot';
  text: string;
  time: string;
  confirmed?: boolean;
};

type Bubble = ClientBubble | BotBubble;

// Mesmo fluxo do robô de verdade: menu numerado e agendamento já confirmado, sem sinal
// (o sinal Pix só é cobrado no agendamento pelo link).
export const bubbles: Bubble[] = [
  { from: 'cliente', text: 'Oi! Tem horário pra sexta à tarde?', time: '14:15' },
  {
    from: 'bot',
    text: 'Olá! Bem-vinda ao Studio Exemplo. Responda com o número:\n*1* • 📅 Agendar um horário\n2️⃣ Ver nossos serviços\n3️⃣ Cancelar agendamento',
    time: '14:15',
  },
  { from: 'cliente', text: '1', time: '14:16' },
  { from: 'bot', text: 'Horários livres na sexta, 24/10:\n1️⃣ 14:00\n2️⃣ 16:30', time: '14:16' },
  { from: 'cliente', text: '1', time: '14:16' },
  {
    from: 'bot',
    text: 'Agendamento confirmado para sexta às 14:00. Você recebe um lembrete por aqui antes do horário.',
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
              <Icon name="verified" size={16} className="text-status-confirmed" />
            </div>
            <span className="text-xs font-bold text-whatsapp">WhatsApp</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-muted">
          <Icon name="videocam" size={20} />
          <Icon name="call" size={20} />
          <Icon name="more_vert" size={20} />
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
                <Icon name="smart_toy" size={14} />
                <span className="text-xs font-bold">EasyAgenda+ Bot</span>
              </div>
            )}

            {bubble.from === 'bot' && bubble.confirmed && (
              <div className="mb-1 flex items-center gap-1.5 text-whatsapp">
                <Icon name="check_circle" size={16} />
                <span className="text-sm font-bold">Agendamento confirmado</span>
              </div>
            )}

            <p className="whitespace-pre-line text-sm text-ink">{bubble.text}</p>

            <div className="mt-1 flex items-center justify-end gap-1 text-muted">
              <span className="text-[11px] tabular-nums">{bubble.time}</span>
              {bubble.from === 'cliente' && <Icon name="done_all" size={14} className="text-status-confirmed" />}
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
