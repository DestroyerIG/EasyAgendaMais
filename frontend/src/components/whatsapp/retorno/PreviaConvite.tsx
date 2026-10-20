'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatarTelefone } from '@/lib/whatsappInbox';
import type { OportunidadeDto } from '@/lib/whatsappRetorno';

const PREFIXO_LINK = 'Se preferir, agende sozinha por aqui: ';

/** Separa do texto o parágrafo final com o link: no WhatsApp ele vira um cartão abaixo do balão. */
export function separarLink(texto: string): { corpo: string; link: string | null } {
  const i = texto.lastIndexOf(PREFIXO_LINK);
  if (i < 0) return { corpo: texto, link: null };
  const link = texto.slice(i + PREFIXO_LINK.length).trim();
  if (!link || /\s/.test(link)) return { corpo: texto, link: null };
  return { corpo: texto.slice(0, i).trimEnd(), link };
}

/** *trecho* vira negrito, como no WhatsApp; as quebras de linha ficam por conta do whitespace-pre-wrap. */
function TextoWhatsApp({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*[^*\n]+\*)/g).map((parte, i) => (
        /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : <span key={i}>{parte}</span>
      ))}
    </>
  );
}

const horaAgora = () =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

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
  const { corpo, link } = separarLink(escolhida?.texto ?? '');
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
        <div className="flex items-center justify-between bg-whatsapp px-4 py-3 text-surface shadow-sm">
          <div className="flex items-center gap-2">
            <Icon name="arrow_back" size={20} className="shrink-0" />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand-text shadow-sm">
              <Icon name="spa" size={20} />
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-bold">{nomeNegocio}</span>
              <span className="text-[11px] opacity-80">online</span>
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-80" aria-hidden="true">
            <Icon name="videocam" size={18} />
            <Icon name="call" size={18} />
            <Icon name="more_vert" size={18} />
          </div>
        </div>
        <div className="flex min-h-[360px] flex-col gap-2 bg-whatsapp-chat p-4">
          <span className="mb-2 self-center rounded-md bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm">HOJE</span>
          {escolhida ? (
            <>
              <div className="flex max-w-[92%] flex-col gap-1 self-end rounded-xl rounded-tr-sm bg-whatsapp-bubble p-3 shadow-sm">
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink"><TextoWhatsApp texto={corpo} /></p>
                <div className="flex items-center justify-end gap-1 text-[10px] text-muted">
                  <span>{horaAgora()}</span>
                  <Icon name="done_all" size={14} className="text-whatsapp" />
                </div>
              </div>
              {link ? (
                <div data-cartao-link className="flex max-w-[92%] items-center justify-between gap-2 self-end rounded-xl bg-whatsapp-bubble p-2.5 shadow-sm">
                  <div className="flex min-w-0 items-center gap-1">
                    <Icon name="calendar_add_on" size={20} className="shrink-0 text-brand-text" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[11px] font-bold text-ink">Auto-agendamento rápido</span>
                      <span className="truncate text-[11px] text-muted">{link.replace(/^https?:\/\//, '')}</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" size={16} className="shrink-0 text-muted" />
                </div>
              ) : null}
            </>
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
