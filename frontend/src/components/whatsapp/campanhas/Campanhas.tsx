'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cancelarCampanha, listarCampanhas, type CampanhaDto } from '@/lib/whatsappCampanhas';
import { CartaoCampanha } from './CartaoCampanha';
import { DetalhesCampanhaModal } from './DetalhesCampanhaModal';
import { NovaCampanha } from './NovaCampanha';

interface CampanhasProps {
  /** Usados pela criação (Task 7): aviso de desconexão e cabeçalho da prévia. */
  conectado: boolean;
  nomeNegocio: string;
}

type Tela = { tipo: 'lista' } | { tipo: 'nova'; campanha?: CampanhaDto };

export function Campanhas(_props: CampanhasProps) {
  const { showToast } = useToast();
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [campanhas, setCampanhas] = useState<CampanhaDto[] | null>(null);
  const [erro, setErro] = useState(false);
  const [detalhes, setDetalhes] = useState<CampanhaDto | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCampanhas(await listarCampanhas());
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const cancelar = async (c: CampanhaDto) => {
    setCancelando(c.id);
    try {
      await cancelarCampanha(c.id);
      showToast('Envio cancelado.', 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível cancelar o envio.'), 'error');
    } finally {
      // Sucesso ou falha (ex.: 409 "já concluída"): o cartão passa a mostrar o status real.
      await carregar();
      setCancelando(null);
    }
  };

  if (tela.tipo === 'nova') {
    return (
      <NovaCampanha
        campanha={tela.campanha}
        onFechar={(recarregar) => { setTela({ tipo: 'lista' }); if (recarregar) void carregar(); }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Campanhas</h2>
        <Button size="sm" onClick={() => setTela({ tipo: 'nova' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova campanha
        </Button>
      </div>

      {erro ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[15px] text-danger">Não foi possível carregar as campanhas.</p>
          <Button variant="secondary" size="sm" onClick={() => void carregar()}>Tentar de novo</Button>
        </div>
      ) : campanhas === null ? (
        <Skeleton className="h-40 w-full" label="Carregando campanhas..." />
      ) : campanhas.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma campanha ainda"
          description="Envie uma novidade ou promoção para um grupo de clientes, no seu ritmo."
          action={{ label: 'Criar primeira campanha', onClick: () => setTela({ tipo: 'nova' }) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {campanhas.map((c) => (
            <CartaoCampanha
              key={c.id}
              campanha={c}
              cancelando={cancelando === c.id}
              onEditar={() => setTela({ tipo: 'nova', campanha: c })}
              onCancelar={() => cancelar(c)}
              onDetalhes={() => setDetalhes(c)}
            />
          ))}
        </div>
      )}

      {detalhes ? <DetalhesCampanhaModal campanha={detalhes} onFechar={() => setDetalhes(null)} /> : null}
    </section>
  );
}
