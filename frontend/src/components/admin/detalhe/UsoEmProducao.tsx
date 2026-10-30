import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import type { DetalheNegocio } from '@/types/admin';
import { CAIXA, SEM_DADO } from '../formato';

function Bloco({ titulo, icone, valor, children }: { titulo: string; icone: string; valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted">{titulo}</span>
        <Icon name={icone} size={18} className="text-muted" />
      </div>
      <p className="text-[20px] font-bold text-ink">{valor}</p>
      {children && <p className="mt-1 text-[13px] text-muted">{children}</p>}
    </div>
  );
}

function Linha({ icone, titulo, children }: { icone: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Icon name={icone} size={18} className="text-muted" />
        {titulo}
      </span>
      <div className="text-[13px] text-muted sm:text-right">{children}</div>
    </div>
  );
}

export function UsoEmProducao({ uso: u }: { uso: DetalheNegocio['uso'] }) {
  const profissionais =
    u.limiteProfissionais === null
      ? `${formatNumber(u.profissionaisAtivas)} · sem limite`
      : `${formatNumber(u.profissionaisAtivas)} / ${formatNumber(u.limiteProfissionais)} vagas`;

  return (
    <section aria-labelledby="dn-uso" className={cn(CAIXA, 'p-5 sm:p-6')}>
      <p className="text-[12px] font-semibold text-muted">Uso em produção</p>
      <h2 id="dn-uso" className="mb-4 text-[17px] font-bold text-ink">
        Como o negócio usa o EasyAgenda+
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Bloco titulo="Profissionais ativas" icone="badge" valor={profissionais} />
        <Bloco
          titulo="Sinal Pix"
          icone="payments"
          valor={
            u.agendamentosMes === 0
              ? SEM_DADO
              : `${formatNumber(u.agendamentosComSinalMes)} de ${formatNumber(u.agendamentosMes)}`
          }
        >
          Agendamentos com sinal no mês
        </Bloco>
        <Bloco titulo="Clientes na base" icone="group" valor={formatNumber(u.clientes)}>
          {`+${formatNumber(u.clientesNovosMes)} novas no mês`}
        </Bloco>
      </div>

      <div className="mt-4 divide-y divide-line border-t border-line">
        <Linha icone="chat" titulo="Lembretes do WhatsApp">
          <span className={cn('font-semibold', u.lembretesLigados ? 'text-success-text' : 'text-muted')}>
            {u.lembretesLigados ? 'Ligados' : 'Desligados'}
          </span>
          <span className="block">{`${formatNumber(u.enviosMes.enviados)} enviados e ${formatNumber(u.enviosMes.falhos)} falhos no mês`}</span>
        </Linha>
        <Linha icone="link" titulo="Página pública">
          {u.paginaPublica ? (
            <a
              href={u.paginaPublica}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all font-semibold text-brand-text hover:underline"
            >
              {u.paginaPublica.replace(/^https?:\/\//, '')}
              <Icon name="open_in_new" size={14} />
            </a>
          ) : (
            SEM_DADO
          )}
        </Linha>
      </div>
    </section>
  );
}
