'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, Skeleton } from '@/components/ui';
import { recebimentosApi, type EstadoMaquininhas } from '@/lib/recebimentos';
import { getApiErrorMessage } from '@/utils/handleApiError';

// Ajustes › Recebimentos: as maquininhas Point da conta do Mercado Pago. A escolhida cobra o débito e o
// crédito da comanda; o terminal precisa estar em modo PDV. Só aparece com o Mercado Pago conectado.
export function PointCard() {
  const [estado, setEstado] = useState<EstadoMaquininhas | null>(null);
  const [falhaAoCarregar, setFalhaAoCarregar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setFalhaAoCarregar(false);
    try {
      setEstado(await recebimentosApi.maquininhas());
    } catch {
      setFalhaAoCarregar(true);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    recebimentosApi.maquininhas()
      .then((e) => { if (ativo) setEstado(e); })
      .catch(() => { if (ativo) setFalhaAoCarregar(true); });
    return () => { ativo = false; };
  }, []);

  const agir = async (acao: () => Promise<EstadoMaquininhas>, aoFim?: () => Promise<void>) => {
    setOcupado(true);
    setErro(null);
    try {
      setEstado(await acao());
      if (aoFim) await aoFim();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível concluir. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Maquininha Point</h2>
        <p className="mt-1 text-[15px] text-muted">
          Cobre o débito e o crédito direto na maquininha do Mercado Pago. Quando o cliente paga, a comanda fecha sozinha.
        </p>
      </div>

      {estado === null && !falhaAoCarregar && <Skeleton className="h-20 w-full" label="Carregando maquininhas..." />}

      {falhaAoCarregar && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">Não foi possível carregar as maquininhas.</p>
          <Button type="button" variant="secondary" size="sm" onClick={carregar}>Tentar de novo</Button>
        </div>
      )}

      {estado && estado.terminais.length === 0 && (
        <Banner tone="info" variant="inline">
          <div className="space-y-2 text-[14px]">
            <p className="font-semibold text-ink">Nenhuma maquininha encontrada na sua conta.</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Crie uma loja e um caixa no app do Mercado Pago.</li>
              <li>Associe a maquininha a esse caixa.</li>
              <li>Volte aqui, toque em Atualizar e ative o modo PDV.</li>
            </ol>
            <Button type="button" variant="secondary" size="sm" onClick={carregar}>Atualizar</Button>
          </div>
        </Banner>
      )}

      {estado && estado.terminais.length > 0 && (
        <ul className="space-y-3">
          {estado.terminais.map((t) => {
            const pronta = t.modo === 'PDV';
            const escolhida = estado.padrao === t.id;
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">{t.nome}</span>
                  <span className={`block text-[13px] ${pronta ? 'text-success-text' : 'text-warning-text'}`}>
                    {pronta ? 'Pronta para cobrar' : 'Precisa ativar o modo PDV'}
                  </span>
                  {escolhida && <span className="block text-[13px] font-semibold text-brand-text">Usada nas cobranças</span>}
                </span>
                {!pronta ? (
                  <Button
                    type="button" variant="secondary" size="sm" disabled={ocupado}
                    aria-label={`Ativar modo PDV de ${t.nome}`} onClick={() => agir(() => recebimentosApi.ativarPdv(t.id))}
                  >
                    Ativar modo PDV
                  </Button>
                ) : !escolhida ? (
                  <Button
                    type="button" size="sm" disabled={ocupado}
                    aria-label={`Usar ${t.nome}`} onClick={() => agir(() => recebimentosApi.definirTerminalPadrao(t.id))}
                  >
                    Usar esta maquininha
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {estado?.padrao && (
        // A resposta de "limpar" não traz a lista: relê para as maquininhas continuarem na tela.
        <Button
          type="button" variant="ghost" size="sm" disabled={ocupado}
          onClick={() => agir(() => recebimentosApi.definirTerminalPadrao(null), carregar)}
        >
          Não usar nenhuma
        </Button>
      )}

      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    </Card>
  );
}
