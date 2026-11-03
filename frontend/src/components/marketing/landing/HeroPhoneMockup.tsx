import Image from 'next/image';
import { Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import type { SegmentData } from './heroSegments';

export function HeroPhoneMockup({ data }: { data: SegmentData }) {
  return (
    <div className="relative flex justify-center lg:justify-end">
      <div className="pointer-events-none absolute -right-12 -top-12 h-80 w-80 rounded-full bg-surface-2 opacity-60 blur-3xl" />
      <div className="relative w-full max-w-[340px] rounded-[44px] border-4 border-line bg-ink p-3.5 shadow-2xl">
        <div className="absolute left-1/2 top-6 z-20 h-4 w-28 -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex flex-col gap-4 rounded-[36px] bg-surface px-4 pb-6 pt-8 text-ink">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2">
              <Image
                src="/images/hero-studio-avatar.jpg"
                alt="Foto da profissional do estúdio"
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[16px] font-bold">{data.name}</span>
                <Icon name="verified" size={18} className="shrink-0 text-status-confirmed" />
              </div>
              <span className="truncate text-xs text-muted">{data.sub}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-bg p-3.5">
            <div className="flex items-start justify-between">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Serviço Selecionado
                </span>
                <span className="text-[15px] font-bold">{data.service}</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{formatCurrency(data.price)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Icon name="schedule" size={16} />
              <span className="text-xs">Duração estimada: {data.duration}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-xl border border-line bg-bg p-3">
              <span className="text-[11px] text-muted">Data</span>
              <span className="text-[13px] font-bold">Sexta, 24 Out</span>
            </div>
            <div className="flex flex-col rounded-xl border border-line bg-bg p-3">
              <span className="text-[11px] text-muted">Horário</span>
              <span className="text-[13px] font-bold tabular-nums">14:00</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">Sinal de Confirmação</span>
              <span className="text-base font-bold tabular-nums">{formatCurrency(data.deposit)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <Icon name="info" size={18} className="text-whatsapp" />
              <span className="text-xs text-ink">Abatido no valor total do serviço</span>
            </div>
          </div>

          <div className="mt-2 w-full rounded-xl bg-ink py-3 text-center text-[13px] font-bold text-surface">
            Confirmar e Pagar Sinal via Pix
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-1 text-muted">
            <Icon name="lock" size={14} />
            <span className="text-[11px]">Ambiente Seguro EasyAgenda+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
