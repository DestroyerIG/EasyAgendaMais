import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDataNegocio, formatNumber } from '@/lib/formatters';
import { rotuloPlano } from '@/lib/adminRotulos';
import type { DetalheNegocio } from '@/types/admin';
import { SEM_DADO, mesAno } from '../formato';

function Cartao({ titulo, valor, children }: { titulo: string; valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-control bg-surface-2 px-4 py-3">
      <p className="text-[12px] font-semibold text-muted">{titulo}</p>
      <div className="text-[17px] font-bold text-ink">{valor}</div>
      {children && <div className="text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function CartoesNegocio({ detalhe }: { detalhe: DetalheNegocio }) {
  const { negocio: n, ltv } = detalhe;
  const temLtv = ltv.ciclos > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Cartao titulo="Plano atual" valor={rotuloPlano(n.plano)}>
        {`${formatCurrency(n.preco)} / mês`}
      </Cartao>
      <Cartao titulo="LTV" valor={temLtv ? formatCurrency(ltv.total) : SEM_DADO}>
        {temLtv && (
          <>
            <span>{`${formatNumber(ltv.ciclos)} ${ltv.ciclos === 1 ? 'ciclo' : 'ciclos'}`}</span>
            {ltv.desde && <span>{` · Desde ${mesAno(ltv.desde)}`}</span>}
          </>
        )}
      </Cartao>
      <Cartao
        titulo="WhatsApp"
        valor={
          <span className={cn('inline-flex items-center gap-1.5', n.whatsappConectado ? 'text-success-text' : 'text-danger')}>
            <Icon name={n.whatsappConectado ? 'qr_code_2' : 'link_off'} size={18} />
            {n.whatsappConectado ? 'Conectado' : 'Desconectado'}
          </span>
        }
      >
        {n.whatsappConectado && n.whatsappConectadoEm ? `Conectado desde ${formatDataNegocio(n.whatsappConectadoEm)}` : null}
      </Cartao>
    </div>
  );
}
