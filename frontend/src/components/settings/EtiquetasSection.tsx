'use client';

import { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Banner, Button, Card, Field, Icon, IconButton, Input, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { ETIQUETA_CORES } from '@/components/clientes/ListaClientes';
import { cn } from '@/lib/cn';
import { materialIcon } from '@/lib/materialIconAdapter';
import {
  CORES_ETIQUETA,
  atualizarEtiqueta,
  criarEtiqueta,
  listarEtiquetas,
  removerEtiqueta,
  type CorEtiqueta,
  type EtiquetaComContagem,
} from '@/lib/tags';
import { getApiErrorMessage } from '@/utils/handleApiError';

const ICONE_EDITAR = materialIcon('edit');
const ICONE_APAGAR = materialIcon('delete');

// Os seis tokens de cor das etiquetas, com o ponto em cor cheia e um nome para leitores de tela.
const COR: Record<CorEtiqueta, { nome: string; ponto: string }> = {
  brand: { nome: 'Laranja', ponto: 'bg-brand' },
  success: { nome: 'Verde', ponto: 'bg-success' },
  warning: { nome: 'Amarelo', ponto: 'bg-warning' },
  danger: { nome: 'Vermelho', ponto: 'bg-danger' },
  tertiary: { nome: 'Azul', ponto: 'bg-tertiary' },
  muted: { nome: 'Cinza', ponto: 'bg-muted' },
};

const corValida = (cor: string): CorEtiqueta => ((CORES_ETIQUETA as readonly string[]).includes(cor) ? (cor as CorEtiqueta) : 'muted');

const mensagemDeErro = (error: unknown, fallback: string) =>
  error instanceof AxiosError && error.response?.status === 409
    ? 'Já existe uma etiqueta com esse nome'
    : getApiErrorMessage(error, fallback);

function SeletorCor({ rotulo, valor, onChange }: { rotulo: string; valor: CorEtiqueta; onChange: (cor: CorEtiqueta) => void }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex items-center gap-2">
      {CORES_ETIQUETA.map((cor) => (
        <button
          key={cor}
          type="button"
          role="radio"
          aria-checked={valor === cor}
          aria-label={COR[cor].nome}
          title={COR[cor].nome}
          onClick={() => onChange(cor)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            valor === cor ? 'border-ink' : 'border-transparent hover:border-line',
          )}
        >
          <span className={cn('h-5 w-5 rounded-full', COR[cor].ponto)} />
        </button>
      ))}
    </div>
  );
}

/** Ajustes: as etiquetas manuais das clientes (nome, cor e quantas clientes usam cada uma). */
export function EtiquetasSection() {
  const { showToast } = useToast();
  const [etiquetas, setEtiquetas] = useState<EtiquetaComContagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState<CorEtiqueta>('brand');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; nome: string; cor: CorEtiqueta } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEtiquetas(await listarEtiquetas());
      setErroCarga(null);
    } catch (error: unknown) {
      setErroCarga(getApiErrorMessage(error, 'Não foi possível carregar as etiquetas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const tentarDeNovo = () => {
    setLoading(true);
    setErroCarga(null);
    carregar();
  };

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = async () => {
    const name = novoNome.trim();
    if (!name) return;
    setCriando(true);
    try {
      await criarEtiqueta({ name, color: novaCor });
      setNovoNome('');
      showToast('Etiqueta criada.', 'success');
      carregar();
    } catch (error: unknown) {
      showToast(mensagemDeErro(error, 'Não foi possível criar a etiqueta.'), 'error');
    } finally {
      setCriando(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    const name = editando.nome.trim();
    if (!name) return;
    setSalvando(true);
    try {
      await atualizarEtiqueta(editando.id, { name, color: editando.cor });
      setEditando(null);
      showToast('Etiqueta atualizada.', 'success');
      carregar();
    } catch (error: unknown) {
      showToast(mensagemDeErro(error, 'Não foi possível salvar a etiqueta.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (etiqueta: EtiquetaComContagem) => {
    if (!window.confirm('Remover a etiqueta de todas as clientes?')) return;
    setApagandoId(etiqueta.id);
    try {
      await removerEtiqueta(etiqueta.id);
      showToast('Etiqueta apagada.', 'info');
      carregar();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível apagar a etiqueta.'), 'error');
    } finally {
      setApagandoId(null);
    }
  };

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Etiquetas</h2>
        <p className="mt-1 text-[15px] text-muted">
          Marque clientes com as suas próprias etiquetas para filtrar a lista de Clientes.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-end">
        <Field id="etiqueta-nova" label="Nova etiqueta" className="flex-1">
          <Input
            id="etiqueta-nova"
            maxLength={40}
            placeholder="Ex.: Noiva, Alérgica, Indicação"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') criar(); }}
          />
        </Field>
        <SeletorCor rotulo="Cor da nova etiqueta" valor={novaCor} onChange={setNovaCor} />
        <Button onClick={criar} loading={criando} disabled={!novoNome.trim()}>
          {!criando && <Icon name="add" size={18} />}
          Criar etiqueta
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-11 w-full" label="Carregando..." />
      ) : erroCarga ? (
        <Banner
          tone="danger"
          variant="inline"
          action={
            <Button variant="secondary" size="sm" onClick={tentarDeNovo}>
              Tentar de novo
            </Button>
          }
        >
          <span className="flex-1 text-[14px] text-ink">{erroCarga}</span>
        </Banner>
      ) : etiquetas.length === 0 ? (
        <p className="py-4 text-center text-[14px] text-muted">Nenhuma etiqueta criada ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {etiquetas.map((etiqueta) => {
            const cor = corValida(etiqueta.color);
            const emEdicao = editando?.id === etiqueta.id;
            return (
              <li key={etiqueta.id} aria-label={etiqueta.name} className="flex flex-col gap-3 py-3">
                {emEdicao && editando ? (
                  <div className="flex flex-col gap-3">
                    <Field id={`etiqueta-${etiqueta.id}`} label="Nome da etiqueta">
                      <Input
                        id={`etiqueta-${etiqueta.id}`}
                        maxLength={40}
                        value={editando.nome}
                        onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                      />
                    </Field>
                    <SeletorCor rotulo="Cor da etiqueta" valor={editando.cor} onChange={(c) => setEditando({ ...editando, cor: c })} />
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="secondary" size="sm" onClick={() => setEditando(null)} disabled={salvando}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={salvarEdicao} loading={salvando} disabled={!editando.nome.trim()}>
                        Salvar etiqueta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('inline-flex max-w-[60%] items-center truncate rounded-full px-2.5 py-0.5 text-[13px] font-semibold', ETIQUETA_CORES[cor])}>
                        {etiqueta.name}
                      </span>
                      <span className="text-[13px] tabular-nums text-muted">
                        {etiqueta.clientes} {etiqueta.clientes === 1 ? 'cliente' : 'clientes'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        icon={ICONE_EDITAR}
                        label={`Editar ${etiqueta.name}`}
                        onClick={() => setEditando({ id: etiqueta.id, nome: etiqueta.name, cor })}
                      />
                      <IconButton
                        icon={ICONE_APAGAR}
                        label={`Apagar ${etiqueta.name}`}
                        disabled={apagandoId === etiqueta.id}
                        onClick={() => apagar(etiqueta)}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
