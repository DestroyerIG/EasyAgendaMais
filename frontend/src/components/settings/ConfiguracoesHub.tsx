'use client';

import Link from 'next/link';
import { Icon, PageHeader } from '@/components/ui';
import { GRUPOS_CONFIGURACAO } from '@/lib/configuracoes';

export function ConfiguracoesHub() {
  return (
    <>
      <PageHeader title="Configurações" description="Sua conta, os dados da empresa e como o painel funciona." />
      <div className="flex flex-col gap-8 pb-6">
        {GRUPOS_CONFIGURACAO.map((grupo) => (
          <section key={grupo.rotulo} aria-label={grupo.rotulo}>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">{grupo.rotulo}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {grupo.cartoes.map((cartao) => (
                <Link
                  key={cartao.id}
                  href={cartao.href}
                  className="flex items-start gap-4 rounded-card border border-line bg-surface p-5 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand/10 text-brand-text">
                    <Icon name={cartao.icone} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{cartao.titulo}</span>
                    <span className="mt-1 block text-[15px] text-muted">{cartao.descricao}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
