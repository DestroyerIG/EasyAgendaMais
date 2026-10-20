'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatarTelefone } from '@/lib/whatsappInbox';
import type { OportunidadeDto } from '@/lib/whatsappRetorno';

interface PreviaConviteProps {
  escolhida: OportunidadeDto | null;
  nomeNegocio: string;
  incluirLink: boolean;
  linkDisponivel: boolean;
  numeroNegocio: string | null;
  conectado: boolean;
  testando?: boolean;
  onAlternarLink: () => void;
  onTestar: () => void;
}

export function PreviaConvite({
  escolhida, nomeNegocio, incluirLink, linkDisponivel, numeroNegocio, conectado, testando = false, onAlternarLink, onTestar,
}: PreviaConviteProps) {
  const podeTestar = conectado && !testando && !!escolhida && !!numeroNegocio;
  const linkLigado = linkDisponivel && incluirLink;
  return (
    <aside aria-label="Prévia do convite" className="flex flex-col gap-4 lg:sticky lg:top-6">
      <div className="rounded-xl bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Icon name="chat" size={20} className="text-whatsapp" />
            <span className="text-[17px] font-bold text-ink">Prévia do WhatsApp</span>
          </div>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">Tempo real</span>
        </div>
        {escolhida ? (
          <p className="mt-1 text-[11px] font-semibold text-muted">
            Simulação para <span className="font-bold text-ink">{escolhida.cliente.nome}</span> · Variáveis preenchidas automaticamente.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl bg-surface-2 shadow-md">
        <div className="flex items-center gap-2 bg-surface-m3-low px-4 py-3 shadow-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-brand-text shadow-sm">
            <Icon name="spa" size={20} />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-bold text-ink">{nomeNegocio}</span>
            <span className="text-[11px] text-muted">online</span>
          </div>
        </div>
        <div className="flex min-h-[360px] flex-col gap-2 p-4">
          <span className="mb-2 self-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm">HOJE</span>
          {escolhida ? (
            <div className="max-w-[92%] self-end rounded-xl rounded-tr-sm bg-surface-m3-low p-3 shadow-sm">
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">{escolhida.texto}</p>
            </div>
          ) : (
            <p className="self-center text-center text-[13px] text-muted">Escolha uma cliente para ver a mensagem.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span id="rotulo-link" className="text-[13px] font-bold text-ink">Link de auto-agendamento</span>
            <span className="text-[11px] font-semibold text-muted">
              {linkDisponivel ? 'Insere atalho direto para a cliente confirmar sozinha' : 'Publique sua página em Minha página'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={linkLigado}
            aria-labelledby="rotulo-link"
            disabled={!linkDisponivel}
            onClick={onAlternarLink}
            className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', linkLigado ? 'bg-whatsapp' : 'bg-line')}>
              <span className={cn('inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform', linkLigado ? 'translate-x-5' : 'translate-x-0.5')} />
            </span>
          </button>
        </div>
        <div className="h-px bg-line" />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={!podeTestar}
            onClick={onTestar}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-m3-low px-4 py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send_to_mobile" size={18} className="text-muted" />
            Testar envio no meu número
          </button>
          <span className="text-center text-[11px] font-semibold text-muted">
            {numeroNegocio
              ? `Envia exatamente a mensagem acima para ${formatarTelefone(numeroNegocio)}`
              : 'Cadastre o WhatsApp do seu negócio em Ajustes para testar o envio'}
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-surface-m3-low p-4 shadow-sm">
        <Icon name="lightbulb" size={20} className="mt-0.5 text-brand-text" />
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-ink">Dica de conversão</span>
          <span className="mt-0.5 text-[14px] leading-5 text-muted">
            Convites com horários sugeridos costumam receber mais respostas do que mensagens genéricas.
          </span>
        </div>
      </div>
    </aside>
  );
}
