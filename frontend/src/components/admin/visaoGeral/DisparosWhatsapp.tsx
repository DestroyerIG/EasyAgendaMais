import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA, SEM_DADO, pct } from '../formato';

const ROTULO_ORIGEM: Record<string, string> = {
  lembrete: 'Lembretes',
  confirmacao: 'Confirmações',
  sinal_pix: 'Cobranças de sinal Pix',
  retorno: 'Alertas de retorno',
};
const ORDEM = Object.keys(ROTULO_ORIGEM);
const OUTROS = 'Outros';

type Disparo = AdminVisaoGeral['disparos24h'][number];

/** Junta as origens sem rótulo em "Outros" e ordena: lembretes, confirmações, sinal, retorno, outros. */
function agrupar(disparos: Disparo[]) {
  const grupos = new Map<string, { rotulo: string; enviados: number; falhos: number }>();
  for (const d of disparos) {
    const chave = ROTULO_ORIGEM[d.origem] ? d.origem : OUTROS;
    const g = grupos.get(chave) ?? { rotulo: ROTULO_ORIGEM[chave] ?? OUTROS, enviados: 0, falhos: 0 };
    g.enviados += d.enviados;
    g.falhos += d.falhos;
    grupos.set(chave, g);
  }
  return [...ORDEM, OUTROS].flatMap((chave) => grupos.get(chave) ?? []);
}

const taxa = (enviados: number, falhos: number) =>
  enviados + falhos === 0 ? null : (enviados / (enviados + falhos)) * 100;

export function DisparosWhatsapp({ disparos }: { disparos: Disparo[] }) {
  const linhas = agrupar(disparos);
  const enviados = linhas.reduce((s, l) => s + l.enviados, 0);
  const falhos = linhas.reduce((s, l) => s + l.falhos, 0);
  const geral = taxa(enviados, falhos);

  return (
    <section aria-labelledby="vg-disparos" className={cn(CAIXA, 'p-5 sm:p-6')}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="mark_chat_read" size={20} className="text-whatsapp" />
          <h2 id="vg-disparos" className="text-[15px] font-bold text-ink">
            Disparos de WhatsApp (24 h)
          </h2>
        </div>
        <span
          title="Enviados sobre o total de tentativas"
          className={cn('text-[12px] font-bold', geral === null ? 'text-muted' : 'text-success-text')}
        >
          Taxa {geral === null ? SEM_DADO : pct(geral)}
        </span>
      </div>

      {linhas.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhum disparo nas últimas 24 h.</p>
      ) : (
        <ul className="space-y-3">
          {linhas.map((l) => {
            const t = taxa(l.enviados, l.falhos) ?? 0;
            return (
              <li key={l.rotulo}>
                <div className="mb-1 flex justify-between gap-2 text-[12px] text-muted">
                  <span>{l.rotulo}</span>
                  <span>
                    <span className="font-semibold text-ink">{formatNumber(l.enviados)} enviados</span>
                    {l.falhos > 0 && <span className="text-danger"> · {formatNumber(l.falhos)} falhos</span>}
                  </span>
                </div>
                <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-whatsapp" style={{ width: `${t}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
