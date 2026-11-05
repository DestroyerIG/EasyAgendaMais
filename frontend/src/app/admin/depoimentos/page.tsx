'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Icon, Tabs, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { CAIXA } from '@/components/admin/formato';
import { adminApi } from '@/lib/adminApi';
import { cn } from '@/lib/cn';
import { rotuloPlano } from '@/lib/adminRotulos';
import { formatDataNegocio } from '@/lib/formatters';
import type { AbaDepoimentos, DepoimentoAdmin } from '@/types/admin';

// Espelha MIN_DEPOIMENTOS_NA_LANDING de src/app/page.tsx (não exportável de lá): abaixo disso a seção some da landing.
const MIN_DEPOIMENTOS_NA_LANDING = 3;
const TEXTO_MIN = 20;
const TEXTO_MAX = 400;

const ABAS: ReadonlyArray<{ valor: AbaDepoimentos; rotulo: string; vazio: string }> = [
  { valor: 'pendentes', rotulo: 'Pendentes', vazio: 'Nenhum depoimento esperando aprovação.' },
  { valor: 'publicados', rotulo: 'Publicados', vazio: 'Nenhum depoimento publicado ainda.' },
  { valor: 'recusados', rotulo: 'Recusados', vazio: 'Nenhum depoimento recusado.' },
  { valor: 'internos', rotulo: 'Avaliações internas', vazio: 'Nenhuma avaliação interna.' },
];

const mensagemDeErro = (erro: unknown): string => {
  const msg = (erro as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : 'Não foi possível concluir a ação. Tente de novo.';
};

function Estrelas({ nota }: { nota: number }) {
  return (
    <span role="img" aria-label={`Nota ${nota} de 5`} className="inline-flex gap-0.5 text-brand">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={18} filled={n <= nota} className={n <= nota ? undefined : 'text-line'} />
      ))}
    </span>
  );
}

interface CardProps {
  depoimento: DepoimentoAdmin;
  comAcoes: boolean;
  ocupado: boolean;
  onPublicar: () => void;
  onRecusar: () => void;
  /** Resolve com true quando a correção foi salva. */
  onCorrigir: (texto: string) => Promise<boolean>;
}

function CardDepoimento({ depoimento: d, comAcoes, ocupado, onPublicar, onRecusar, onCorrigir }: CardProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(d.texto);
  const tamanho = rascunho.trim().length;
  const valido = tamanho >= TEXTO_MIN && tamanho <= TEXTO_MAX;
  const quem = [d.nomeExibido, d.cidade, d.plano ? rotuloPlano(d.plano) : null].filter(Boolean).join(' · ');

  const salvarCorrecao = async () => {
    if (await onCorrigir(rascunho.trim())) setEditando(false);
  };

  return (
    <article className={cn(CAIXA, 'space-y-3 p-5')}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-ink">{d.negocio}</h3>
          {quem ? <p className="text-sm text-muted">{quem}</p> : null}
        </div>
        <Estrelas nota={d.nota} />
      </header>

      {editando ? (
        <div className="space-y-2">
          <Textarea
            aria-label="Texto do depoimento"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            invalid={!valido}
          />
          <p className="text-xs text-muted">
            {tamanho} de {TEXTO_MAX} caracteres (mínimo {TEXTO_MIN})
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink">{d.texto}</p>
      )}

      {d.textoOriginal ? (
        <div className="rounded-control bg-surface-2 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Texto original</p>
          <p className="mt-1 text-muted">{d.textoOriginal}</p>
        </div>
      ) : null}

      {d.autorizadoEm ? (
        <p className="text-xs text-muted">Autorizou exibir no site em {formatDataNegocio(d.autorizadoEm)}</p>
      ) : null}

      {comAcoes ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {editando ? (
            <>
              <Button size="sm" disabled={!valido || ocupado} onClick={salvarCorrecao}>
                Salvar correção
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={ocupado}
                onClick={() => {
                  setRascunho(d.texto);
                  setEditando(false);
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={ocupado} onClick={onPublicar}>
                Publicar
              </Button>
              <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => setEditando(true)}>
                Corrigir texto
              </Button>
              <Button size="sm" variant="danger" disabled={ocupado} onClick={onRecusar}>
                Recusar
              </Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function AdminDepoimentosPage() {
  const [aba, setAba] = useState<AbaDepoimentos>('pendentes');
  const [itens, setItens] = useState<DepoimentoAdmin[]>([]);
  const [publicados, setPublicados] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Descarta respostas de pedidos antigos quando a aba muda antes de a anterior responder.
  const pedidoAtual = useRef(0);

  const carregar = useCallback(async (alvo: AbaDepoimentos) => {
    const pedido = ++pedidoAtual.current;
    try {
      const lista = await adminApi.listarDepoimentos(alvo);
      if (pedido !== pedidoAtual.current) return;
      setItens(lista.data);
      setPublicados(lista.publicados);
    } catch (e) {
      if (pedido !== pedidoAtual.current) return;
      setErro(mensagemDeErro(e));
    } finally {
      if (pedido === pedidoAtual.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    void carregar(aba);
  }, [aba, carregar]);

  const executar = async (id: string, acao: () => Promise<void>): Promise<boolean> => {
    setOcupadoId(id);
    setErro(null);
    try {
      await acao();
      return true;
    } catch (e) {
      setErro(mensagemDeErro(e));
      return false;
    } finally {
      await carregar(aba);
      setOcupadoId(null);
    }
  };

  const atual = ABAS.find((a) => a.valor === aba)!;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-ink">Depoimentos</h1>
        <p className="mt-2 text-sm text-muted">Aprove o que aparece na página inicial. Só entra o que o dono autorizou.</p>
      </section>

      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaDepoimentos)}>
        <TabsList aria-label="Situação dos depoimentos">
          {ABAS.map((a) => (
            <TabsTrigger key={a.valor} value={a.valor}>
              {a.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {aba === 'publicados' && publicados < MIN_DEPOIMENTOS_NA_LANDING ? (
        <Banner tone="info" variant="inline">
          {publicados} de {MIN_DEPOIMENTOS_NA_LANDING} para a seção aparecer
        </Banner>
      ) : null}

      {erro ? (
        <Banner tone="danger" variant="inline">
          {erro}
        </Banner>
      ) : null}

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className={cn(CAIXA, 'p-8 text-center text-sm text-muted')}>{atual.vazio}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {itens.map((d) => (
            <CardDepoimento
              key={d.id}
              depoimento={d}
              comAcoes={aba === 'pendentes'}
              ocupado={ocupadoId === d.id}
              onPublicar={() => executar(d.id, () => adminApi.publicarDepoimento(d.id))}
              onRecusar={() => executar(d.id, () => adminApi.recusarDepoimento(d.id))}
              onCorrigir={(texto) => executar(d.id, () => adminApi.corrigirDepoimento(d.id, texto))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
