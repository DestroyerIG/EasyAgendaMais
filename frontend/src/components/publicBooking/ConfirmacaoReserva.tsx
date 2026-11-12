'use client';

import type { ReactNode } from 'react';
import { Button, Icon } from '@/components/ui';
import { dataPorExtenso, formatarDuracao, gerarIcs } from '@/lib/agendamentoPublico';

const moeda = (valor: number): string => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Linha({ icone, rotulo, children }: { icone: string; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icone} className="mt-0.5 shrink-0 text-brand-text" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{rotulo}</span>
        <span className="text-sm font-semibold text-ink">{children}</span>
      </div>
    </div>
  );
}

const baixarIcs = (conteudo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agendamento.ics';
  link.click();
  URL.revokeObjectURL(url);
};

export function ConfirmacaoReserva({
  negocio,
  cliente,
  servico,
  profissional,
  data,
  horario,
  sinal,
  forma = 'pix',
  endereco,
  whatsapp,
  comLembretes,
  onVoltar,
}: {
  negocio: string;
  cliente: string;
  servico: { name: string; price: number; durationMinutes: number };
  profissional: string | undefined;
  data: string;
  horario: string;
  sinal: number;
  forma?: 'pix' | 'cartao';
  endereco: string | null;
  whatsapp: string | null;
  comLembretes: boolean;
  onVoltar: () => void;
}) {
  const primeiroNome = cliente.trim().split(/\s+/)[0];
  const adicionarNaAgenda = () => baixarIcs(gerarIcs({
    titulo: `${servico.name} · ${negocio}`, data, horario, duracaoMinutos: servico.durationMinutes, local: endereco,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success-text">
          <Icon name="check_circle" size={36} filled />
        </span>
        <h1 className="text-[24px] font-bold text-ink">Agendamento confirmado!</h1>
        <p className="text-sm text-muted">{primeiroNome ? `Tudo certo, ${primeiroNome}!` : 'Tudo certo!'} Seu horário em {negocio} está garantido.</p>
      </div>

      <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-sm">
        <Linha icone="calendar_today" rotulo="Data e horário">{dataPorExtenso(data)} às {horario}</Linha>
        <Linha icone="event_available" rotulo="Serviço">{servico.name} · {formatarDuracao(servico.durationMinutes)}</Linha>
        {profissional && <Linha icone="person" rotulo="Atendimento">{profissional}</Linha>}
        {endereco && (
          <Linha icone="location_on" rotulo="Local">
            {endereco}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-brand-text"
            >
              <Icon name="near_me" size={16} />
              Abrir no GPS
            </a>
          </Linha>
        )}
        {sinal > 0 ? (
        <div className="grid grid-cols-2 gap-2 border-t border-line/60 pt-3">
          <div>
            <p className="text-xs text-muted">{forma === 'cartao' ? 'Sinal pago no cartão' : 'Sinal pago via Pix'}</p>
            <p className="text-[15px] font-bold tabular-nums text-ink">{moeda(sinal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Restante no atendimento</p>
            <p className="text-[15px] font-bold tabular-nums text-ink">{moeda(servico.price - sinal)}</p>
          </div>
        </div>
        ) : (
          <div className="border-t border-line/60 pt-3">
            <p className="text-xs text-muted">Pagamento no atendimento</p>
            <p className="text-[15px] font-bold tabular-nums text-ink">{moeda(servico.price)}</p>
          </div>
        )}
      </section>

      {comLembretes && (
        <p className="flex items-start gap-2 rounded-card bg-surface-2 p-3 text-sm text-muted">
          <Icon name="notifications_active" className="shrink-0 text-brand-text" />
          Os lembretes chegam pelo WhatsApp que você informou.
        </p>
      )}

      <Button type="button" size="lg" fullWidth onClick={adicionarNaAgenda}>
        <Icon name="event" />
        Adicionar à agenda do celular
      </Button>
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-bold text-whatsapp"
        >
          <Icon name="chat" />
          Remarcar ou falar no WhatsApp
        </a>
      )}
      <Button type="button" variant="ghost" fullWidth onClick={onVoltar}>
        Voltar para o perfil
      </Button>
    </div>
  );
}

/** Reserva que venceu sem pagamento ou foi cancelada pelo estabelecimento. */
export function ReservaEncerrada({
  situacao,
  forma = 'pix',
  whatsapp,
  onNovoHorario,
}: {
  situacao: 'expirado' | 'cancelado';
  forma?: 'pix' | 'cartao';
  whatsapp: string | null;
  onNovoHorario: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon name="event_busy" size={32} />
      </span>
      <h1 className="text-[22px] font-bold text-ink">
        {situacao === 'expirado' ? (forma === 'cartao' ? 'O prazo para pagar acabou' : 'O prazo do Pix acabou') : 'Esta reserva foi cancelada'}
      </h1>
      <p className="text-sm text-muted">
        {situacao === 'expirado'
          ? 'O horário foi liberado para outras pessoas. Se você já pagou, fale com o estabelecimento.'
          : 'O estabelecimento cancelou esta reserva. Você pode escolher outro horário.'}
      </p>
      <Button type="button" size="lg" fullWidth onClick={onNovoHorario}>
        Escolher outro horário
      </Button>
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-bold text-whatsapp"
        >
          <Icon name="chat" />
          Falar no WhatsApp
        </a>
      )}
    </div>
  );
}
