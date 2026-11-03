import Link from 'next/link';
import { Icon, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { mensagemAlerta, rotuloPlano, rotuloSegmento } from '@/lib/adminRotulos';
import { linkWhatsapp } from '@/lib/whatsappLink';
import type { NegocioEmRisco, TipoAlerta } from '@/types/admin';
import { CAIXA, tempoDesde } from '../formato';

const ALERTA: Record<TipoAlerta, { texto: string; icone: string }> = {
  cobranca: { texto: 'Cobrança em atraso', icone: 'credit_card_off' },
  teste_sem_onboarding: { texto: 'Teste vence em até 48 h sem configuração concluída', icone: 'hourglass_bottom' },
  whatsapp: { texto: 'WhatsApp desconectado', icone: 'signal_disconnected' },
  sem_agendamento: { texto: 'Sem agendamentos novos', icone: 'event_busy' },
};

const TH = 'px-4 py-3 text-left text-[12px] font-semibold text-muted';
const TD = 'px-4 py-4 align-top';

function Linha({ n, agora }: { n: NegocioEmRisco; agora: Date }) {
  const alerta = ALERTA[n.tipo];
  const link = linkWhatsapp(n.whatsapp, mensagemAlerta(n.tipo, n.dono, n.nome));
  return (
    <tr className="transition-colors hover:bg-surface-2/60">
      <td className={cn(TD, 'pl-6')}>
        <Link
          href={`/admin/negocios/${n.id}`}
          className="text-[15px] font-bold text-ink hover:text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {n.nome}
        </Link>
        <div className="text-[13px] text-muted">
          {[n.dono, n.whatsapp ? formatPhone(n.whatsapp) : null].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td className={TD}>
        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink">
          {rotuloSegmento(n.segmento)}
        </span>
      </td>
      <td className={TD}>
        <span className="inline-flex items-start gap-1.5 text-[13px] font-semibold text-danger">
          <Icon name={alerta.icone} size={16} className="mt-0.5" />
          <span>{alerta.texto}</span>
        </span>
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[13px] font-semibold text-ink')}>{tempoDesde(n.desde, agora)}</td>
      <td className={cn(TD, 'whitespace-nowrap')}>
        {/* Pagante: é MRR de fato. Teste e demais: o plano ainda não entra no MRR, é valor em potencial. */}
        <div className="text-[15px] font-bold text-ink">
          {n.pagante ? `${formatCurrency(n.mrr)}/mês` : `Potencial ${formatCurrency(n.mrr)}/mês`}
        </div>
        <div className="text-[12px] text-muted">Plano {rotuloPlano(n.plano)}</div>
      </td>
      <td className={cn(TD, 'pr-6 text-right')}>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'whatsapp', size: 'sm' }), 'gap-1')}
          >
            <Icon name="chat" size={16} />
            Avisar no WhatsApp
          </a>
        ) : (
          <span className="text-[12px] text-muted">Sem telefone válido</span>
        )}
      </td>
    </tr>
  );
}

export function TabelaEmRisco({ negocios, agora }: { negocios: NegocioEmRisco[]; agora: Date }) {
  return (
    <section aria-labelledby="vg-risco" className={cn(CAIXA, 'overflow-hidden')}>
      <div className="flex flex-col gap-1 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="warning" size={22} className="text-danger" />
          <h2 id="vg-risco" className="text-lg font-bold text-ink">
            Negócios em risco
          </h2>
          {negocios.length > 0 && (
            <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[12px] font-bold text-danger">
              {negocios.length} {negocios.length === 1 ? 'caso' : 'casos'}
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted">
          Cobrança em atraso, teste perto do fim sem configuração, WhatsApp desconectado ou agenda parada.
        </p>
      </div>

      {negocios.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-line px-6 py-10 text-center">
          <Icon name="verified" size={28} className="text-success-text" />
          <p className="text-[14px] font-semibold text-ink">Nenhum negócio em risco agora.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={cn(TH, 'pl-6')}>Negócio e responsável</th>
                <th scope="col" className={TH}>Segmento</th>
                <th scope="col" className={TH}>Alerta</th>
                <th scope="col" className={TH}>Há quanto tempo</th>
                <th scope="col" className={TH}>Valor</th>
                <th scope="col" className={cn(TH, 'pr-6 text-right')}>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {negocios.map((n) => (
                <Linha key={`${n.id}-${n.tipo}`} n={n} agora={agora} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
