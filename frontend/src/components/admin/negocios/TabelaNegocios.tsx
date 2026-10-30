import Link from 'next/link';
import { Icon, buttonVariants, controlClass } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { rotuloPlano, rotuloSegmento, rotuloStatus } from '@/lib/adminRotulos';
import type { LimitePagina, NegocioListado, PaginationMeta, StatusAdmin } from '@/types/admin';
import { CAIXA, SEM_DADO, tempoDesde } from '../formato';

export const LIMITES: LimitePagina[] = [6, 20, 50, 100];

const TOM_STATUS: Record<StatusAdmin, string> = {
  ativo: 'bg-success/12 text-success-text',
  teste: 'bg-brand/12 text-brand-text',
  carencia: 'bg-warning/12 text-warning-text',
  bloqueado_cobranca: 'bg-danger/12 text-danger',
  teste_encerrado: 'bg-muted/12 text-muted',
  bloqueado_admin: 'bg-danger/12 text-danger',
  cancelado: 'bg-muted/12 text-muted',
};

const diasRestantes = (n: number) => {
  if (n <= 0) return 'Termina hoje';
  return n === 1 ? '1 dia restante' : `${formatNumber(n)} dias restantes`;
};

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

const TH = 'px-4 py-3 text-left text-[12px] font-semibold text-muted';
const TD = 'px-4 py-4 align-top';

function Linha({ n, agora }: { n: NegocioListado; agora: Date }) {
  return (
    <tr className="transition-colors hover:bg-surface-2/60">
      <td className={cn(TD, 'pl-6')}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand/12 text-[13px] font-bold text-brand-text"
          >
            {iniciais(n.nome)}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink">{n.nome}</p>
            <p className="text-[13px] text-muted">{n.dono || SEM_DADO}</p>
            {n.endereco && (
              <p className="mt-0.5 flex items-start gap-1 text-[12px] text-muted">
                <Icon name="location_on" size={14} className="mt-px" />
                <span>{n.endereco}</span>
              </p>
            )}
          </div>
        </div>
      </td>
      <td className={TD}>
        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink">
          {rotuloSegmento(n.segmento)}
        </span>
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[13px] font-semibold text-ink')}>
        {`${rotuloPlano(n.plano)} · ${formatCurrency(n.preco)}/mês`}
      </td>
      <td className={TD}>
        <span
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold',
            TOM_STATUS[n.status] ?? 'bg-muted/12 text-muted',
          )}
        >
          {rotuloStatus(n.status)}
        </span>
        {n.status === 'teste' && n.diasRestantesTeste !== null && (
          <p className="mt-1 text-[12px] font-semibold text-warning-text">{diasRestantes(n.diasRestantesTeste)}</p>
        )}
      </td>
      <td className={TD}>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold',
            n.whatsappConectado ? 'text-success-text' : 'text-danger',
          )}
        >
          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', n.whatsappConectado ? 'bg-success' : 'bg-danger')} />
          {n.whatsappConectado ? 'Conectado' : 'Desconectado'}
        </span>
      </td>
      <td className={cn(TD, 'whitespace-nowrap text-[14px] font-semibold text-ink')}>{formatNumber(n.agendamentos30d)}</td>
      <td className={cn(TD, 'whitespace-nowrap text-[13px] text-ink')}>
        {n.ultimaAtividadeEm ? `Há ${tempoDesde(n.ultimaAtividadeEm, agora)}` : SEM_DADO}
      </td>
      <td className={cn(TD, 'pr-6 text-right')}>
        <Link
          href={`/admin/negocios/${n.id}`}
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'whitespace-nowrap')}
        >
          Ver detalhes
        </Link>
      </td>
    </tr>
  );
}

interface Props {
  negocios: NegocioListado[];
  meta: PaginationMeta;
  limite: LimitePagina;
  carregando: boolean;
  onPagina: (pagina: number) => void;
  onLimite: (limite: LimitePagina) => void;
}

export function TabelaNegocios({ negocios, meta, limite, carregando, onPagina, onLimite }: Props) {
  const agora = new Date();
  // Página além do fim (URL antiga) volta vazia: nada de "Exibindo 41–20".
  const vazia = negocios.length === 0;
  const de = vazia ? 0 : (meta.page - 1) * meta.limit + 1;
  const ate = vazia ? 0 : Math.min(meta.page * meta.limit, meta.total);
  const totalPaginas = Math.max(1, meta.totalPages);

  return (
    <section aria-label="Negócios" aria-busy={carregando} className={cn(CAIXA, 'overflow-hidden')}>
      {negocios.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Icon name="search_off" size={28} className="text-muted" />
          <p className="text-[14px] font-semibold text-ink">Nenhum negócio encontrado com esses filtros.</p>
        </div>
      ) : (
        <div className={cn('overflow-x-auto transition-opacity', carregando && 'opacity-60')}>
          <table className="w-full min-w-[1080px]">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className={cn(TH, 'pl-6')}>Negócio e cidade</th>
                <th scope="col" className={TH}>Segmento</th>
                <th scope="col" className={TH}>Plano e valor</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>WhatsApp</th>
                <th scope="col" className={TH}>Agendamentos (30 dias)</th>
                <th scope="col" className={TH}>Última atividade</th>
                <th scope="col" className={cn(TH, 'pr-6 text-right')}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {negocios.map((n) => (
                <Linha key={n.id} n={n} agora={agora} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line px-6 py-4 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Exibindo {formatNumber(de)}–{formatNumber(ate)} de {formatNumber(meta.total)}{' '}
          {meta.total === 1 ? 'negócio' : 'negócios'}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="relative flex items-center gap-2">
            <span>Itens por página:</span>
            <select
              aria-label="Itens por página"
              value={limite}
              onChange={(e) => onLimite(Number(e.target.value) as LimitePagina)}
              className={cn(controlClass, 'h-9 w-auto appearance-none pl-3 pr-8 text-[13px]')}
            >
              {LIMITES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <Icon name="expand_more" size={16} className="pointer-events-none absolute right-2 text-muted" />
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Página anterior"
              disabled={meta.page <= 1}
              onClick={() => onPagina(meta.page - 1)}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-11 px-0 lg:w-9')}
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <span className="px-2 text-ink">
              Página {formatNumber(meta.page)} de {formatNumber(totalPaginas)}
            </span>
            <button
              type="button"
              aria-label="Próxima página"
              disabled={meta.page >= totalPaginas}
              onClick={() => onPagina(meta.page + 1)}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'w-11 px-0 lg:w-9')}
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
