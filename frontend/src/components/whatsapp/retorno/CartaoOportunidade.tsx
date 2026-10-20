'use client';

import type { KeyboardEvent } from 'react';
import { Icon } from '@/components/ui';
import { getInitials } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import type { OportunidadeDto } from '@/lib/whatsappRetorno';

/** Convite da Hora de voltar mais recente que isto fica fora de "Selecionar todas". */
export const DIAS_ENTRE_CONVITES = 7;
const DIA_MS = 86_400_000;

/** Dias inteiros desde o último convite, ou null quando não há convite. */
export function diasDesdeConvite(item: OportunidadeDto, agora: number = Date.now()): number | null {
  if (!item.ultimoConviteEm) return null;
  return Math.max(0, Math.floor((agora - new Date(item.ultimoConviteEm).getTime()) / DIA_MS));
}

export const convidadaRecentemente = (item: OportunidadeDto) => {
  const dias = diasDesdeConvite(item);
  return dias !== null && dias < DIAS_ENTRE_CONVITES;
};

type Tom = 'neutro' | 'brand' | 'sucesso' | 'aviso' | 'perigo';

function Selo({ tom, icone, children }: { tom: Tom; icone?: string; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        tom === 'neutro' && 'bg-surface-2 text-muted',
        tom === 'brand' && 'bg-brand/15 text-brand-text',
        tom === 'sucesso' && 'bg-success/12 text-success-text',
        tom === 'aviso' && 'bg-warning/12 text-warning-text',
        tom === 'perigo' && 'bg-danger/12 text-danger',
      )}
    >
      {icone ? <Icon name={icone} size={13} /> : null}
      {children}
    </span>
  );
}

function SelosDeEstado({ item }: { item: OportunidadeDto }) {
  const envio = item.envio;
  const dias = diasDesdeConvite(item);
  const temSelo = !item.podeReceber || (dias !== null && dias < DIAS_ENTRE_CONVITES) || !!envio;
  if (!temSelo) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {!item.podeReceber ? (
        <>
          <Selo tom="perigo" icone="block">Não recebe mensagens</Selo>
          {item.motivoBloqueio ? <span className="text-[11px] text-muted">{item.motivoBloqueio}</span> : null}
        </>
      ) : null}
      {item.podeReceber && dias !== null && dias < DIAS_ENTRE_CONVITES ? (
        <Selo tom="aviso" icone="history">{dias === 0 ? 'Convite enviado hoje' : `Convite enviado há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}</Selo>
      ) : null}
      {envio?.status === 'na_fila' ? <Selo tom="brand" icone="schedule">{envio.previstoHora ? `Na fila (envio previsto ~${envio.previstoHora})` : 'Na fila'}</Selo> : null}
      {envio?.status === 'enviando' ? <Selo tom="brand" icone="schedule">Enviando agora</Selo> : null}
      {envio?.status === 'enviado' ? <Selo tom="sucesso" icone="done_all">Enviado</Selo> : null}
      {envio && (envio.status === 'falhou' || envio.status === 'pulado')
        ? <Selo tom="perigo" icone="error">{`Não enviado: ${envio.motivo ?? 'sem detalhe'}`}</Selo>
        : null}
    </div>
  );
}

interface CartaoOportunidadeProps {
  item: OportunidadeDto;
  selecionada: boolean;
  escolhida: boolean;
  /** Sem conexão com o WhatsApp não há envio; a lista continua visível. */
  envioDesabilitado: boolean;
  onAlternarSelecao: () => void;
  onEscolher: () => void;
  onVerTexto: () => void;
  onEnviar: () => void;
}

export function CartaoOportunidade({
  item, selecionada, escolhida, envioDesabilitado, onAlternarSelecao, onEscolher, onVerTexto, onEnviar,
}: CartaoOportunidadeProps) {
  const { cliente } = item;
  const emFila = item.envio?.status === 'na_fila' || item.envio?.status === 'enviando';
  const semEnvio = envioDesabilitado || !item.podeReceber || emFila;
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEscolher();
    }
  };
  const tomAtraso = item.atrasoDias >= 14 ? 'bg-danger/12 text-danger' : 'bg-warning/12 text-warning-text';

  return (
    <div
      data-cartao
      role="group"
      aria-label={`Oportunidade de ${cliente.nome}`}
      tabIndex={0}
      onClick={onEscolher}
      onKeyDown={aoTeclar}
      className={cn(
        'cursor-pointer rounded-xl bg-surface p-4 shadow-sm transition-colors hover:bg-surface-m3-low/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
        escolhida && 'ring-2 ring-brand',
      )}
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-4">
          {item.podeReceber ? (
            <input
              type="checkbox"
              aria-label={`Selecionar ${cliente.nome}`}
              checked={selecionada}
              onChange={onAlternarSelecao}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-brand sm:mt-0 sm:self-center"
            />
          ) : (
            <span className="mt-1 h-4 w-4 shrink-0 sm:mt-0 sm:self-center" aria-hidden="true" />
          )}
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[15px] font-bold text-muted">
            {getInitials(cliente.nome)}
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="break-words text-[17px] font-bold leading-6 text-ink">{cliente.nome}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', tomAtraso)}>{`${item.atrasoDias} dias atrasada`}</span>
            </div>
            <p className="mt-0.5 text-[14px] leading-5 text-muted">
              {`${item.servico} · `}
              <span className="font-medium text-ink">{item.profissional}</span>
            </p>
            <p className="mt-1 text-[11px] font-semibold text-muted">
              {`Última visita: há ${item.ultimaVisitaHaDias} dias • Ciclo recomendado: ${item.cicloDias} dias`}
            </p>
            <SelosDeEstado item={item} />
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.encaixes.length > 0 ? (
              <>
                <span className="mr-1 text-[11px] font-bold uppercase text-muted">Encaixes:</span>
                {item.encaixes.map((e, i) => (
                  <span key={`${i}-${e.inicio}`} className="rounded-lg bg-surface-m3-low px-2.5 py-1 text-[11px] font-semibold text-ink">{e.curto}</span>
                ))}
              </>
            ) : (
              <span className="text-[11px] font-semibold text-muted">Sem encaixe nesta semana</span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVerTexto(); }}
              className="min-h-9 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-surface-m3-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              Ver texto
            </button>
            <button
              type="button"
              disabled={semEnvio}
              onClick={(e) => { e.stopPropagation(); onEnviar(); }}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-whatsapp px-4 py-1.5 text-[11px] font-bold text-surface shadow-sm transition-colors hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="send" size={16} />
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
