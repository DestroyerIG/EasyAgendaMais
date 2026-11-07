'use client';

import { Button, Card, Icon, Skeleton } from '@/components/ui';
import type { TextoDto } from '@/lib/roboTextos';
import { CampoMensagem } from './CampoMensagem';
import type { useRascunhoTextos } from './useRascunhoTextos';

interface MensagensGeraisProps {
  textos: TextoDto[];
  rascunho: ReturnType<typeof useRascunhoTextos>;
  loading: boolean;
  erro: boolean;
  salvando: boolean;
  onSalvar: () => void;
  onRecarregar: () => void;
}

/** Textos que não pertencem a uma opção do menu: boas-vindas, erros, fora do horário e a resposta rápida da política. */
export function MensagensGerais({ textos, rascunho, loading, erro, salvando, onSalvar, onRecarregar }: MensagensGeraisProps) {
  return (
    <Card className="overflow-hidden">
      <section aria-labelledby="mensagens-gerais-titulo">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 id="mensagens-gerais-titulo" className="mb-2 text-lg font-bold text-ink">Mensagens gerais</h3>
            <p className="text-[15px] text-muted">
              Textos que não pertencem a uma opção do menu: boas-vindas, avisos e erros.
            </p>
          </div>
          <Button
            onClick={onSalvar}
            loading={salvando}
            disabled={loading || erro || !rascunho.temAlteracoes || rascunho.invalido}
          >
            {!salvando && <Icon name="save" size={16} />}
            Salvar mensagens
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" label={i === 0 ? 'Carregando mensagens...' : undefined} />
            ))}
          </div>
        ) : erro ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-[14px] font-semibold text-danger">Não foi possível carregar as mensagens.</p>
            <Button variant="secondary" onClick={onRecarregar}>Tentar de novo</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {textos.map((t) => (
              <CampoMensagem
                key={t.chave}
                texto={t}
                valor={rascunho.valorDe(t)}
                onMudar={(v) => rascunho.mudar(t, v)}
                onRestaurar={() => rascunho.restaurar(t)}
              />
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}
