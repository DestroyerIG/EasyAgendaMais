import Link from 'next/link';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/formatters';
import type { AdminVisaoGeral } from '@/types/admin';
import { CAIXA, tempoDesde } from '../formato';

const ROTULO_PLANO: Record<string, string> = { basico: 'Solo', profissional: 'Equipe', premium: 'Salão' };
const ROTULO_STATUS: Record<string, string> = {
  teste: 'Em teste', ativo: 'Ativo', carencia: 'Em carência', bloqueado_cobranca: 'Bloqueado',
  teste_encerrado: 'Teste encerrado', bloqueado_admin: 'Bloqueado pelo admin', cancelado: 'Cancelado',
};

interface Props {
  cadastros: AdminVisaoGeral['cadastros'];
  agora: Date;
}

export function CartaoCadastros({ cadastros, agora }: Props) {
  const janelas = [
    { rotulo: 'Hoje', valor: cadastros.hoje },
    { rotulo: '7 dias', valor: cadastros.ultimos7d },
    { rotulo: '30 dias', valor: cadastros.ultimos30d },
  ];
  return (
    <section aria-labelledby="vg-cadastros" className={cn(CAIXA, 'p-5 sm:p-6')}>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Icon name="person_add" size={20} className="text-brand-text" />
          <h2 id="vg-cadastros" className="text-[15px] font-bold text-ink">
            Cadastros novos
          </h2>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {janelas.map((j) => (
            <div key={j.rotulo} className="rounded-control bg-surface-2 px-3 py-1.5">
              <dt className="text-[12px] text-muted">{j.rotulo}</dt>
              <dd className="text-[16px] font-bold text-ink">{formatNumber(j.valor)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {cadastros.recentes.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhum cadastro ainda.</p>
      ) : (
        <ul className="divide-y divide-line">
          {cadastros.recentes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/negocios/${c.id}`}
                className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{c.nome}</span>
                  <span className="block truncate text-muted">
                    {c.dono} · {ROTULO_PLANO[c.plano] ?? c.plano}
                    {!c.onboardingConcluido && ' · sem configurar'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-ink">{ROTULO_STATUS[c.status] ?? c.status}</span>
                  <span className="block text-muted">há {tempoDesde(c.criadoEm, agora)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
