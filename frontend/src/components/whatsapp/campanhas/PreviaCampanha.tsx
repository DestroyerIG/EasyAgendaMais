'use client';

import { getInitials, Icon } from '@/components/ui';
import { formatarTelefoneLocal } from '@/lib/whatsappInbox';
import { previsaoDuracao, RODAPE_SAIR, type Cadencia, type PublicoDto } from '@/lib/whatsappCampanhas';
import { TextoWhatsApp } from '../retorno/PreviaConvite';
import { useVocabulario } from '@/hooks/useVocabulario';

interface PreviaCampanhaProps {
  publico: PublicoDto | null;
  /** A prévia do público falhou: o balão não fica preso em "Carregando". */
  erro?: boolean;
  nomeNegocio: string;
  /** Rótulo do dia no balão de data do chat: "Hoje", "Amanhã" ou "25/10". */
  dia: string;
  hora: string;
  cadencia: Cadencia;
}

/** Separa o rodapé fixo do corpo, para mostrá-lo como nota dentro do balão. */
function separarRodape(texto: string): { corpo: string; rodape: boolean } {
  if (!texto.endsWith(RODAPE_SAIR)) return { corpo: texto, rodape: false };
  return { corpo: texto.slice(0, -RODAPE_SAIR.length).trimEnd(), rodape: true };
}

export function PreviaCampanha({ publico, erro = false, nomeNegocio, dia, hora, cadencia }: PreviaCampanhaProps) {
  const { adaptar } = useVocabulario();
  const amostra = publico?.amostra ?? null;
  const { corpo, rodape } = separarRodape(amostra?.texto ?? '');
  const total = publico?.receberao ?? 0;

  return (
    <aside aria-label="Prévia da campanha" className="flex flex-col items-center gap-4 lg:sticky lg:top-6">
      <div className="flex w-full max-w-sm flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <Icon name="visibility" size={18} className="text-whatsapp" />
          <span className="text-[13px] font-bold text-ink">Pré-visualização Realista</span>
        </div>
        {amostra ? (
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span>Amostra:</span>
            <span className="rounded-md bg-surface px-2 py-0.5 font-bold text-ink shadow-sm">
              {`${amostra.nome} · ${formatarTelefoneLocal(amostra.telefone)}`}
            </span>
          </div>
        ) : null}
      </div>

      <div className="w-full max-w-sm rounded-[42px] bg-ink p-3 shadow-xl dark:bg-line">
        <div className="flex h-[560px] flex-col overflow-hidden rounded-[34px] bg-whatsapp-chat">
          <div className="flex shrink-0 items-center justify-between bg-whatsapp px-3 py-2.5 text-surface shadow-sm">
            <div className="flex min-w-0 items-center gap-2">
              <Icon name="arrow_back" size={18} />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-on-brand">
                {getInitials(nomeNegocio)}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="max-w-[130px] truncate text-[13px] font-bold">{nomeNegocio}</span>
                <span className="text-[10px] opacity-80">online</span>
              </div>
            </div>
            <div className="flex items-center gap-3" aria-hidden="true">
              <Icon name="videocam" size={19} />
              <Icon name="call" size={18} />
              <Icon name="more_vert" size={18} />
            </div>
          </div>

          <div className="my-2.5 flex justify-center">
            <span className="rounded-md bg-surface/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted shadow-sm">{dia}</span>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
            {publico === null ? (
              <p className="self-center text-center text-[13px] text-muted">{erro ? 'Prévia indisponível no momento.' : 'Carregando a prévia...'}</p>
            ) : amostra ? (
              <div className="flex max-w-[88%] flex-col gap-1.5 self-end rounded-xl rounded-tr-sm bg-whatsapp-bubble p-3 shadow-sm">
                {corpo ? (
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-[19px] text-ink"><TextoWhatsApp texto={corpo} /></p>
                ) : (
                  <p className="text-[13px] italic text-muted">Mensagem em branco...</p>
                )}
                {rodape ? (
                  <p className="mt-0.5 border-t border-line pt-1 text-[10px] italic text-muted">{RODAPE_SAIR}</p>
                ) : null}
                <div className="flex items-center justify-end gap-1">
                  <span className="text-[10px] font-medium text-muted">{hora}</span>
                  <Icon name="done_all" size={14} className="text-tertiary" />
                </div>
              </div>
            ) : (
              <p className="self-center rounded-md bg-surface/80 px-3 py-1 text-center text-[13px] text-muted">{adaptar('Nenhuma cliente neste público')}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 bg-surface-2 p-2" aria-hidden="true">
            <div className="flex flex-1 items-center justify-between rounded-full bg-surface px-3 py-1.5 text-muted shadow-sm">
              <div className="flex items-center gap-2">
                <Icon name="sentiment_satisfied" size={19} />
                <span className="text-[12px]">Mensagem</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="attach_file" size={18} />
                <Icon name="photo_camera" size={18} />
              </div>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-whatsapp text-surface shadow-sm">
              <Icon name="mic" size={18} />
            </span>
          </div>
        </div>
        <div className="mx-auto mt-2 h-1 w-32 rounded-full bg-muted/40" />
      </div>

      <div className="flex w-full max-w-sm flex-col gap-1.5 rounded-xl bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Simulação de Entrega</span>
          <span className="text-[11px] font-bold text-whatsapp">{`Previsão: ${previsaoDuracao(total, cadencia, hora)}`}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-m3-low">
          <div className="h-full w-full rounded-full bg-whatsapp" />
        </div>
        <p className="text-[11px] text-muted">
          {`${total} ${total === 1 ? 'envio espaçado' : 'envios espaçados'} preventivamente. Sem risco de bloqueio da linha cadastrada.`}
        </p>
      </div>
    </aside>
  );
}
