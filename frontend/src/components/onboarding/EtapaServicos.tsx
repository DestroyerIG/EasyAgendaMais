'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Icon, Input, Select, Skeleton } from '@/components/ui';
import { CascaOnboarding } from './CascaOnboarding';
import { onboardingApi, SEGMENTOS_ONBOARDING, type ServicoOnboarding, type TipoChavePix } from '@/lib/onboarding';
import type { Segmento } from '@/lib/technicalSheetTemplates';
import { cn } from '@/lib/cn';
import { useVocabulario } from '@/hooks/useVocabulario';

interface Linha extends ServicoOnboarding { chave: string; descricao: string; marcado: boolean; comSinal: boolean }

const TIPOS_PIX: Array<{ id: TipoChavePix; rotulo: string }> = [
  { id: 'telefone', rotulo: 'Telefone' }, { id: 'cpf', rotulo: 'CPF' }, { id: 'cnpj', rotulo: 'CNPJ' },
  { id: 'email', rotulo: 'E-mail' }, { id: 'aleatoria', rotulo: 'Chave aleatória' },
];

const SINAL_PADRAO = 30;

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

export function EtapaServicos({ segmento, jaSalvos, temChavePix, salvando, onVoltar, onSalvar }: {
  segmento: Segmento;
  jaSalvos: ServicoOnboarding[];
  temChavePix: boolean;
  salvando: boolean;
  onVoltar: () => void;
  onSalvar: (servicos: ServicoOnboarding[], chavePix?: { chave: string; tipo: TipoChavePix }) => void;
}) {
  const { cli } = useVocabulario();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [chave, setChave] = useState('');
  const [tipo, setTipo] = useState<TipoChavePix>('telefone');

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
            sinalPct: base.sinalPct, comSinal: (base.sinalPct ?? 0) > 0, marcado: jaSalvos.length ? !!s : c.marcado,
          };
        });
        const nomesCat = new Set(cat.map((c) => c.nome.toLowerCase()));
        const proprios: Linha[] = jaSalvos
          .filter((s) => !nomesCat.has(s.nome.trim().toLowerCase()))
          .map((s, i) => ({ ...s, chave: `p${i}`, descricao: '', marcado: true, comSinal: (s.sinalPct ?? 0) > 0 }));
        setLinhas([...doCatalogo, ...proprios]);
      })
      .catch(() => { if (vivo) setErroCarga(true); });
    return () => { vivo = false; };
  }, [segmento, jaSalvos]);

  const mudar = (k: string, patch: Partial<Linha>) => setLinhas((ls) => ls && ls.map((l) => (l.chave === k ? { ...l, ...patch } : l)));
  const incluir = () => setLinhas((ls) => [...(ls ?? []), {
    chave: `n${Date.now()}`, nome: '', descricao: '', duracaoMinutos: 60, preco: 0, sinalPct: null, comSinal: false, marcado: true,
  }]);

  const marcados = (linhas ?? []).filter((l) => l.marcado);
  const precisaPix = marcados.some((l) => l.comSinal) && !temChavePix;
  const erro = linhas ? erroDosServicos(linhas) ?? (precisaPix && !chave.trim() ? 'Informe a chave Pix para cobrar o sinal.' : null) : null;
  const nomeSegmento = SEGMENTOS_ONBOARDING.find((s) => s.id === segmento)?.titulo ?? 'seu negócio';

  const salvar = () => {
    const servicos = marcados.map((l) => ({
      nome: l.nome.trim(), duracaoMinutos: l.duracaoMinutos, preco: l.preco, sinalPct: l.comSinal ? (l.sinalPct || SINAL_PADRAO) : null,
    }));
    onSalvar(servicos, precisaPix ? { chave: chave.trim(), tipo } : undefined);
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
                <label className="flex items-center gap-2 text-[14px] text-ink sm:col-span-3">
                  <input
                    type="checkbox" className="h-4 w-4 accent-brand" checked={l.comSinal}
                    onChange={(e) => mudar(l.chave, { comSinal: e.target.checked, sinalPct: e.target.checked ? (l.sinalPct || SINAL_PADRAO) : null })}
                  />
                  Exigir sinal via Pix
                  {l.comSinal && (
                    <span className="flex items-center gap-1 text-muted">
                      ·
                      <Input
                        aria-label={`Sinal de ${l.nome} em %`} type="number" min={1} max={100} className="h-8 w-20"
                        value={l.sinalPct ?? SINAL_PADRAO} onChange={(e) => mudar(l.chave, { sinalPct: Number(e.target.value) })}
                      />
                      % do valor
                    </span>
                  )}
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>

      {linhas && (
        <Button variant="secondary" onClick={incluir}><Icon name="add" size={18} /> Incluir outro serviço</Button>
      )}

      {precisaPix && (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <h2 className="font-bold text-ink">Chave Pix para receber o sinal</h2>
            <p className="text-[14px] text-muted">O sinal confirma o compromisso {cli.doS} e protege o seu horário. Ele cai direto na sua conta.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field id="onb-pix-tipo" label="Tipo">
              <Select id="onb-pix-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoChavePix)}>
                {TIPOS_PIX.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </Select>
            </Field>
            <Field id="onb-pix-chave" label="Chave Pix">
              <Input id="onb-pix-chave" value={chave} onChange={(e) => setChave(e.target.value)} />
            </Field>
          </div>
        </section>
      )}

      {erro && linhas && <p role="alert" className="text-[14px] font-semibold text-danger">{erro}</p>}
    </CascaOnboarding>
  );
}
