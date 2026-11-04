'use client';

import { useEffect, useState } from 'react';
import { Button, Field, Icon, Input, Modal, Textarea } from '@/components/ui';
import { depoimentosApi, type DepoimentoAtual, type MeuDepoimento } from '@/lib/depoimentos';
import { getApiErrorMessage } from '@/utils/handleApiError';

// Limites validados também no backend (depoimentos.rules.ts).
const NOTA_MINIMA_PUBLICAVEL = 4;
const TEXTO_MIN = 20;
const TEXTO_MAX = 400;
const FEEDBACK_MAX = 1000;
const NOME_MAX = 60;
const CIDADE_MAX = 80;

const SITUACAO: Record<DepoimentoAtual['status'], string> = {
  em_analise: 'Em análise',
  publicado: 'Publicado no site',
  nao_publicado: 'Não publicado',
};

export interface AvaliarSistemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  origem: 'popup' | 'menu';
}

type Etapa = 'carregando' | 'situacao' | 'nota' | 'obrigado';

export function AvaliarSistemaModal({ isOpen, onClose, origem }: AvaliarSistemaModalProps) {
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [dados, setDados] = useState<MeuDepoimento | null>(null);
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [autorizou, setAutorizou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    setEtapa('carregando');
    setNota(0);
    setTexto('');
    setCidade('');
    setAutorizou(false);
    setErro('');
    depoimentosApi
      .meu()
      .then((meu) => {
        if (cancelado) return;
        setDados(meu);
        setNome(meu.nomeSugerido);
        setEtapa(origem === 'menu' && meu.atual ? 'situacao' : 'nota');
      })
      .catch(() => {
        // Silencioso: sem os dados não há o que mostrar.
        if (!cancelado) onClose();
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, origem]);

  const publicavel = nota >= NOTA_MINIMA_PUBLICAVEL;
  const textoLimpo = texto.trim();
  const textoValido = publicavel
    ? textoLimpo.length >= TEXTO_MIN && textoLimpo.length <= TEXTO_MAX
    : textoLimpo.length >= 1 && textoLimpo.length <= FEEDBACK_MAX;
  const exibicaoValida = !(publicavel && autorizou) || (nome.trim().length > 0 && cidade.trim().length > 0);
  const podeEnviar = nota > 0 && textoValido && exibicaoValida;

  async function executar(acao: () => Promise<void>, depois: () => void) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      depois();
    } catch (e: unknown) {
      setErro(getApiErrorMessage(e, 'Não foi possível concluir. Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  }

  const enviar = () =>
    executar(
      () => {
        const autoriza = publicavel && autorizou;
        return depoimentosApi.enviar(
          autoriza
            ? { nota, texto: textoLimpo, nomeExibido: nome.trim(), cidade: cidade.trim(), autorizou: true }
            : { nota, texto: textoLimpo, autorizou: false },
        );
      },
      () => setEtapa('obrigado'),
    );

  const retirar = () =>
    executar(async () => {
      await depoimentosApi.retirar();
      try {
        const meu = await depoimentosApi.meu();
        setDados(meu);
        if (!meu.atual) setEtapa('nota');
      } catch {
        // A retirada já foi feita; só não deu para reler a situação.
        setDados((d) => (d?.atual ? { ...d, atual: { ...d.atual, status: 'nao_publicado' } } : d));
      }
    }, () => {});

  const titulo =
    etapa === 'situacao'
      ? 'Sua avaliação do EasyAgenda+'
      : etapa === 'obrigado'
        ? 'Obrigado!'
        : nota === 0 || etapa === 'carregando'
          ? 'Como está sendo o EasyAgenda+ pra você?'
          : publicavel
            ? 'Que bom! Conta pra outros profissionais?'
            : 'Obrigado pela sinceridade. O que podemos melhorar?';

  const atual = dados?.atual ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titulo} size="md">
      {etapa === 'carregando' && <p className="text-[15px] text-muted">Carregando...</p>}

      {etapa === 'obrigado' && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] text-ink">Recebemos a sua avaliação. Obrigado por ajudar o EasyAgenda+ a melhorar!</p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      )}

      {etapa === 'situacao' && (
        <div className="flex flex-col gap-4">
          {atual && (
            <div className="flex flex-col gap-1 rounded-control border border-line bg-surface-2 p-3">
              <span className="text-[13px] font-semibold text-muted">Situação</span>
              <span className="text-[15px] font-bold text-ink">{SITUACAO[atual.status]}</span>
              <p className="mt-1 text-[14px] text-ink">{atual.texto}</p>
            </div>
          )}
          {erro && <p role="alert" className="text-[13px] font-semibold text-danger">{erro}</p>}
          {atual && (atual.status === 'publicado' || atual.status === 'em_analise') && (
            <Button variant="secondary" onClick={retirar} loading={ocupado}>Retirar meu depoimento do site</Button>
          )}
          <Button onClick={() => setEtapa('nota')}>Enviar outra avaliação</Button>
        </div>
      )}

      {etapa === 'nota' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-center gap-1" role="group" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={n === 1 ? '1 estrela' : `${n} estrelas`}
                aria-pressed={nota === n}
                onClick={() => setNota(n)}
                className="flex h-11 w-11 items-center justify-center rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Icon name="star" size={32} filled={n <= nota} className={n <= nota ? 'text-brand' : 'text-muted'} />
              </button>
            ))}
          </div>

          {nota > 0 && (
            <>
              <Field
                id="dep-texto"
                label={publicavel ? 'Seu depoimento' : 'O que podemos melhorar?'}
                hint={publicavel ? `De ${TEXTO_MIN} a ${TEXTO_MAX} caracteres.` : undefined}
              >
                <Textarea
                  id="dep-texto"
                  value={texto}
                  maxLength={publicavel ? TEXTO_MAX : FEEDBACK_MAX}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </Field>

              {publicavel && (
                <>
                  <Field id="dep-nome" label="Nome exibido" required={autorizou}>
                    <Input id="dep-nome" value={nome} maxLength={NOME_MAX} onChange={(e) => setNome(e.target.value)} />
                  </Field>
                  <Field id="dep-cidade" label="Cidade" required={autorizou}>
                    <Input id="dep-cidade" value={cidade} maxLength={CIDADE_MAX} onChange={(e) => setCidade(e.target.value)} />
                  </Field>
                  <label className="flex items-start gap-2 text-[14px] text-ink">
                    <input
                      type="checkbox"
                      checked={autorizou}
                      onChange={(e) => setAutorizou(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-brand"
                    />
                    <span>Autorizo exibir este depoimento, com meu nome, o nome do meu negócio e a cidade, no site do EasyAgenda+.</span>
                  </label>
                </>
              )}

              {erro && <p role="alert" className="text-[13px] font-semibold text-danger">{erro}</p>}
              <Button onClick={enviar} loading={ocupado} disabled={!podeEnviar}>
                {publicavel ? 'Enviar' : 'Enviar para a equipe'}
              </Button>
              <p className="text-[13px] text-muted">
                {publicavel
                  ? 'Sem marcar a autorização, vai só como avaliação interna.'
                  : 'Vai direto para os responsáveis pelo sistema. Não aparece no site.'}
              </p>
            </>
          )}

          {origem === 'popup' && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => depoimentosApi.adiar(), onClose)}
                className="text-[13px] font-semibold text-muted underline hover:text-ink"
              >
                Agora não
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => depoimentosApi.dispensar(), onClose)}
                className="text-[13px] font-semibold text-muted underline hover:text-ink"
              >
                Não perguntar mais
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
