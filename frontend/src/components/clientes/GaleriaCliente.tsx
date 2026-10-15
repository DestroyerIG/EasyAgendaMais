'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button, Field, Icon, Input, Modal, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { SecaoRecolhivel } from '@/components/clientes/SecaoRecolhivel';
import { formatDataNegocio } from '@/lib/formatters';
import { enviarFoto, listarFotos, removerFoto, TAMANHO_MAX_FOTO, type FotoCliente } from '@/lib/clientPhotos';

const TIPOS_ACEITOS = 'image/jpeg,image/png,image/webp';

export interface GaleriaClienteProps {
  clienteId: string;
}

const legendaDa = (f: FotoCliente) => f.caption || f.serviceName || 'Foto do procedimento';

/**
 * Galeria privada de procedimentos. As imagens vêm só do link assinado (com validade)
 * que a API devolve em GET /clients/:id/photos; quando um link expira e a imagem falha,
 * a lista é pedida de novo uma vez para obter links novos.
 */
export function GaleriaCliente({ clienteId }: GaleriaClienteProps) {
  const { showToast } = useToast();
  const [fotos, setFotos] = useState<FotoCliente[] | null>(null);
  const [erro, setErro] = useState(false);
  const recarregouPorFalha = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [legenda, setLegenda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<FotoCliente | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setFotos(await listarFotos(clienteId));
      setErro(false);
    } catch {
      setErro(true);
    }
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aoFalharImagem = () => {
    if (recarregouPorFalha.current) return;
    recarregouPorFalha.current = true;
    carregar();
  };

  const aoEscolher = (e: ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!escolhido) return;
    if (escolhido.size > TAMANHO_MAX_FOTO) {
      showToast('A foto precisa ter até 5MB', 'error');
      return;
    }
    if (!TIPOS_ACEITOS.split(',').includes(escolhido.type)) {
      showToast('Use uma imagem JPG, PNG ou WebP', 'error');
      return;
    }
    setLegenda('');
    setArquivo(escolhido);
  };

  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      await enviarFoto(clienteId, arquivo, legenda.trim() ? { caption: legenda.trim() } : {});
      showToast('Foto anexada', 'success');
      setArquivo(null);
      recarregouPorFalha.current = false;
      await carregar();
    } catch (err) {
      showToast(err instanceof Error && err.message ? err.message : 'Erro ao anexar a foto', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const confirmarRemocao = async () => {
    if (!removendo) return;
    setExcluindo(true);
    try {
      await removerFoto(clienteId, removendo.id);
      showToast('Foto removida', 'success');
      setRemovendo(null);
      await carregar();
    } catch {
      showToast('Erro ao remover a foto', 'error');
    } finally {
      setExcluindo(false);
    }
  };

  const total = fotos?.length ?? 0;

  const conteudo = () => {
    if (fotos === null && !erro) {
      return (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" label={i === 0 ? 'Carregando fotos...' : undefined} />
          ))}
        </div>
      );
    }
    if (erro && fotos === null) {
      return (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-[13px] text-muted">Não foi possível carregar as fotos</p>
          <Button variant="secondary" size="sm" onClick={() => carregar()}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    if (total === 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 py-8 text-center">
          <Icon name="photo_library" size={28} className="text-muted" />
          <p className="text-[13px] font-semibold text-muted">Nenhuma foto ainda</p>
        </div>
      );
    }
    return (
      <ul className="grid grid-cols-2 gap-3">
        {fotos!.map((f) => (
          <li key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-surface-2">
            {f.url ? (
              // Link assinado e temporário: não passa pelo otimizador do Next.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={f.url}
                alt={legendaDa(f)}
                loading="lazy"
                onError={aoFalharImagem}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted">
                <Icon name="image_not_supported" size={28} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-2 py-1.5">
              <p className="truncate text-[11px] font-bold leading-tight text-ink">{legendaDa(f)}</p>
              <p className="text-[10px] tabular-nums text-muted">{formatDataNegocio(f.takenAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => setRemovendo(f)}
              aria-label={`Remover foto ${legendaDa(f)}`}
              title="Remover foto"
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface/90 text-danger opacity-100 shadow-sm transition-opacity hover:bg-surface lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
            >
              <Icon name="delete" size={18} />
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <SecaoRecolhivel
      titulo="Galeria de procedimentos"
      icone="photo_library"
      subtitulo={fotos ? `${total} ${total === 1 ? 'foto registrada' : 'fotos registradas'}` : undefined}
    >
      {conteudo()}

      <input
        ref={inputRef}
        id="anexar-foto"
        type="file"
        accept={TIPOS_ACEITOS}
        aria-label="Anexar foto"
        className="sr-only"
        onChange={aoEscolher}
      />
      <Button variant="secondary" fullWidth className="mt-4" onClick={() => inputRef.current?.click()}>
        <Icon name="add_a_photo" size={18} />
        + Anexar foto
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted">JPG, PNG ou WebP até 5MB. As fotos ficam privadas do salão.</p>

      <Modal
        isOpen={arquivo !== null}
        onClose={() => setArquivo(null)}
        title="Anexar foto"
        icon="add_a_photo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArquivo(null)}>
              Cancelar
            </Button>
            <Button onClick={enviar} loading={enviando}>
              Enviar foto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 truncate text-[13px] text-muted">
            <Icon name="image" size={18} />
            {arquivo?.name}
          </p>
          <Field id="legenda-foto" label="Legenda (opcional)">
            <Input id="legenda-foto" value={legenda} maxLength={200} onChange={(e) => setLegenda(e.target.value)} placeholder="Ex.: manutenção em gel" />
          </Field>
        </div>
      </Modal>

      <Modal
        isOpen={removendo !== null}
        onClose={() => setRemovendo(null)}
        title="Remover foto"
        icon="delete"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarRemocao} loading={excluindo}>
              Remover
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-ink">A foto será apagada da ficha da cliente. Essa ação não pode ser desfeita.</p>
      </Modal>
    </SecaoRecolhivel>
  );
}
