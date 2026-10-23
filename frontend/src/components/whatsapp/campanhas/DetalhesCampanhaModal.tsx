'use client';

import { useEffect, useState } from 'react';
import { Modal, Skeleton } from '@/components/ui';
import { formatarTelefone } from '@/lib/whatsappInbox';
import { detalhesCampanha, type CampanhaDto, type DetalhesCampanhaDto } from '@/lib/whatsappCampanhas';

const ROTULO_ITEM: Record<DetalhesCampanhaDto['itens'][number]['status'], string> = {
  na_fila: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', falhou: 'Falhou', pulado: 'Não enviado', cancelado: 'Cancelado',
};

interface DetalhesCampanhaModalProps {
  campanha: CampanhaDto;
  onFechar: () => void;
}

export function DetalhesCampanhaModal({ campanha, onFechar }: DetalhesCampanhaModalProps) {
  const [dados, setDados] = useState<DetalhesCampanhaDto | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    detalhesCampanha(campanha.id).then((d) => { if (ativo) setDados(d); }).catch(() => { if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [campanha.id]);

  const contagens = dados ? [
    ['Enviadas', dados.contagem.enviadas], ['Na fila', dados.contagem.naFila], ['Puladas', dados.contagem.puladas],
    ['Falhas', dados.contagem.falhas], ['Canceladas', dados.contagem.canceladas],
  ] as const : [];

  return (
    <Modal isOpen onClose={onFechar} title={campanha.nome} size="lg" telaCheiaNoCelular>
      {erro ? <p className="text-[15px] text-danger">Não foi possível carregar os detalhes.</p> : null}
      {!dados && !erro ? <Skeleton className="h-40 w-full" label="Carregando detalhes..." /> : null}
      {dados ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {contagens.map(([rotulo, n]) => (
              <div key={rotulo} className="flex flex-col-reverse rounded-card bg-surface-2 p-3 text-center">
                <dt className="text-[13px] text-muted">{rotulo}</dt>
                <dd className="text-lg font-bold text-ink">{n}</dd>
              </div>
            ))}
          </dl>
          <ul className="divide-y divide-line">
            {dados.itens.map((i) => (
              <li key={i.id} className="flex flex-col gap-0.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{i.nome}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-muted">{ROTULO_ITEM[i.status]}</span>
                </div>
                <span className="text-[13px] text-muted">{formatarTelefone(i.telefone)}</span>
                {i.motivo ? <span className="text-[13px] text-muted">{i.motivo}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
