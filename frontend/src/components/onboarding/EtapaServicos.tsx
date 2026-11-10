'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Icon, Input, Skeleton } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { onboardingApi, SEGMENTOS_ONBOARDING, type ServicoEntrada, type ServicoOnboarding } from '@/lib/onboarding';
import type { Segmento } from '@/lib/technicalSheetTemplates';
import { cn } from '@/lib/cn';

interface Linha extends ServicoEntrada { chave: string; descricao: string; marcado: boolean }

/** Mensagem do primeiro problema da lista marcada (vazio = pode salvar). */
export function erroDosServicos(linhas: Array<Pick<Linha, 'nome' | 'duracaoMinutos' | 'preco' | 'marcado'>>): string | null {
  const marcados = linhas.filter((l) => l.marcado);
  if (marcados.length === 0) return 'Escolha pelo menos um serviço.';
  if (marcados.some((l) => l.nome.trim().length < 2)) return 'Dê um nome a cada serviço marcado.';
  if (marcados.some((l) => !(l.preco > 0))) return 'O preço de cada serviço precisa ser maior que zero.';
  if (marcados.some((l) => l.duracaoMinutos < 10 || l.duracaoMinutos > 300)) return 'A duração vai de 10 a 300 minutos.';
  const nomes = marcados.map((l) => l.nome.trim().toLowerCase());
  if (new Set(nomes).size !== nomes.length) return 'Há serviços com o mesmo nome.';
  return null;
}

export function EtapaServicos({ segmento, jaSalvos, salvando, onVoltar, onSalvar }: {
  segmento: Segmento;
  jaSalvos: ServicoOnboarding[];
  salvando: boolean;
  onVoltar: () => void;
  onSalvar: (servicos: ServicoEntrada[]) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erroCarga, setErroCarga] = useState(false);

  useEffect(() => {
    let vivo = true;
    onboardingApi.catalogo(segmento)
      .then((cat) => {
        if (!vivo) return;
        // Quem voltou para esta etapa vê o que já salvou marcado; o resto do catálogo, desmarcado.
        const salvos = new Map(jaSalvos.map((s) => [s.nome.trim().toLowerCase(), s]));
        const doCatalogo: Linha[] = cat.map((c, i) => {
          const s = salvos.get(c.nome.toLowerCase());
          const base = s ?? c;
          return {
            chave: `c${i}`, descricao: c.descricao, nome: base.nome, duracaoMinutos: base.duracaoMinutos, preco: base.preco,
            marcado: jaSalvos.length ? !!s : c.marcado,
          };
        });
        const nomesCat = new Set(cat.map((c) => c.nome.toLowerCase()));
        const proprios: Linha[] = jaSalvos
          .filter((s) => !nomesCat.has(s.nome.trim().toLowerCase()))
          .map((s, i) => ({ nome: s.nome, duracaoMinutos: s.duracaoMinutos, preco: s.preco, chave: `p${i}`, descricao: '', marcado: true }));
        setLinhas([...doCatalogo, ...proprios]);
      })
      .catch(() => { if (vivo) setErroCarga(true); });
    return () => { vivo = false; };
  }, [segmento, jaSalvos]);

  const mudar = (k: string, patch: Partial<Linha>) => setLinhas((ls) => ls && ls.map((l) => (l.chave === k ? { ...l, ...patch } : l)));
  const incluir = () => setLinhas((ls) => [...(ls ?? []), {
    chave: `n${Date.now()}`, nome: '', descricao: '', duracaoMinutos: 60, preco: 0, marcado: true,
  }]);

  const marcados = (linhas ?? []).filter((l) => l.marcado);
  const erro = linhas ? erroDosServicos(linhas) : null;
  const nomeSegmento = SEGMENTOS_ONBOARDING.find((s) => s.id === segmento)?.titulo ?? 'seu negócio';

  const salvar = () => {
    onSalvar(marcados.map((l) => ({ nome: l.nome.trim(), duracaoMinutos: l.duracaoMinutos, preco: l.preco })));
  };

  return (
    <CascaOnboarding
      etapa={3}
      titulo="Confirme seus serviços e valores iniciais"
      descricao={`Selecionamos os serviços mais comuns para ${nomeSegmento}. Tudo pode ser editado agora ou depois, em Serviços.`}
      rodape={(
        <>
          <Button variant="ghost" onClick={onVoltar}><Icon name="arrow_back" size={18} /> Voltar</Button>
          <Button disabled={!linhas || !!erro} loading={salvando} onClick={salvar}>
            Continuar <Icon name="arrow_forward" size={18} />
          </Button>
        </>
      )}
    >
      {erroCarga ? (
        <p className="text-[15px] text-muted">Não foi possível carregar as sugestões. Inclua seus serviços abaixo.</p>
      ) : !linhas ? (
        <Skeleton className="h-64 w-full" />
      ) : null}

      <ul className="space-y-3">
        {(linhas ?? []).map((l) => (
          <li key={l.chave} className={cn('rounded-card border bg-surface p-4', l.marcado ? 'border-brand/60' : 'border-line opacity-80')}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-brand"
                checked={l.marcado}
                onChange={(e) => mudar(l.chave, { marcado: e.target.checked })}
                aria-label={`Oferecer ${l.nome || 'novo serviço'}`}
              />
              <span className="flex-1">
                <span className="block font-bold text-ink">{l.nome || 'Novo serviço'}</span>
                {l.descricao && <span className="block text-[13px] text-muted">{l.descricao}</span>}
              </span>
            </label>
            {l.marcado && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Field id={`onb-nome-${l.chave}`} label="Nome">
                  <Input id={`onb-nome-${l.chave}`} value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} />
                </Field>
                <Field id={`onb-dur-${l.chave}`} label="Duração (min)">
                  <Input
                    id={`onb-dur-${l.chave}`} type="number" inputMode="numeric" min={10} max={300} step={5}
                    value={l.duracaoMinutos} onChange={(e) => mudar(l.chave, { duracaoMinutos: Number(e.target.value) })}
                  />
                </Field>
                <Field id={`onb-preco-${l.chave}`} label="Preço (R$)">
                  <Input
                    id={`onb-preco-${l.chave}`} type="number" inputMode="decimal" min={0} step="0.01"
                    value={l.preco || ''} onChange={(e) => mudar(l.chave, { preco: Math.round(Number(e.target.value) * 100) / 100 })}
                  />
                </Field>
              </div>
            )}
          </li>
        ))}
      </ul>

      {linhas && (
        <Button variant="secondary" onClick={incluir}><Icon name="add" size={18} /> Incluir outro serviço</Button>
      )}

      {erro && linhas && <p role="alert" className="text-[14px] font-semibold text-danger">{erro}</p>}
    </CascaOnboarding>
  );
}
