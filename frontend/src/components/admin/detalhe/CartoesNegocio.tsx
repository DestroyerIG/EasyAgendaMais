import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDataNegocio, formatNumber } from '@/lib/formatters';
import { planoNoCatalogo, rotuloPlano } from '@/lib/adminRotulos';
import type { DetalheNegocio } from '@/types/admin';
import { ROTULO_WHATSAPP, SEM_DADO, TOM_WHATSAPP, estadoWhatsapp, mesAno, type EstadoWhatsapp } from '../formato';

const ICONE_WHATSAPP: Record<EstadoWhatsapp, string> = {
  conectado: 'qr_code_2',
  desconectado: 'link_off',
  nao_configurado: 'chat_bubble_outline',
};

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
  // Um pagamento avulso de upgrade entra no total, mas não conta ciclo.
  const temLtv = ltv.total > 0;
  const whatsapp = estadoWhatsapp(n);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Cartao titulo="Plano atual" valor={rotuloPlano(n.plano)}>
        {`${planoNoCatalogo(n.plano) ? formatCurrency(n.preco) : SEM_DADO} / mês`}
      </Cartao>
      <Cartao titulo="LTV" valor={temLtv ? formatCurrency(ltv.total) : SEM_DADO}>
        {temLtv && (
          <>
            {ltv.ciclos > 0 && <span>{`${formatNumber(ltv.ciclos)} ${ltv.ciclos === 1 ? 'ciclo' : 'ciclos'}`}</span>}
            {ltv.desde && <span>{`${ltv.ciclos > 0 ? ' · ' : ''}Desde ${mesAno(ltv.desde)}`}</span>}
          </>
        )}
      </Cartao>
      <Cartao
        titulo="WhatsApp"
        valor={
          <span className={cn('inline-flex items-center gap-1.5', TOM_WHATSAPP[whatsapp].texto)}>
            <Icon name={ICONE_WHATSAPP[whatsapp]} size={18} />
            {ROTULO_WHATSAPP[whatsapp]}
          </span>
        }
      >
        {n.whatsappConectado && n.whatsappConectadoEm ? `Conectado desde ${formatDataNegocio(n.whatsappConectadoEm)}` : null}
      </Cartao>
    </div>
  );
}
