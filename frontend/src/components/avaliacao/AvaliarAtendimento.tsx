'use client';

import { useEffect, useState } from 'react';
import { Heart, Star } from 'lucide-react';
import { Button } from '@/components/ui';
import { avaliacaoPublicaApi, type AvaliacaoPublica } from '@/lib/avaliacoes';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';

// Página pública /avaliar/[token]: a cliente dá de 1 a 5 estrelas e um comentário opcional.

const ROTULO_NOTA = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function AvaliarAtendimento({ token }: { token: string }) {
  const [dados, setDados] = useState<AvaliacaoPublica | null>(null);
  const [indisponivel, setIndisponivel] = useState<string | null>(null);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    avaliacaoPublicaApi.ver(token)
      .then(setDados)
      .catch((e) => setIndisponivel(getApiErrorMessage(e, 'Este link de avaliação não está disponível.')));
  }, [token]);

  const enviar = async () => {
    if (!nota) return;
    setEnviando(true);
    setErro(null);
    try {
      await avaliacaoPublicaApi.enviar(token, nota, comentario.trim() || null);
      setEnviada(true);
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível enviar. Tente de novo.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="app-theme flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center">
        {indisponivel ? (
          <>
            <Heart className="mx-auto h-8 w-8 text-brand" aria-hidden="true" />
            <p className="mt-3 text-[15px] text-ink">{indisponivel}</p>
          </>
        ) : enviada ? (
          <>
            <Heart className="mx-auto h-10 w-10 fill-brand text-brand" aria-hidden="true" />
            <h1 className="mt-3 text-xl font-bold text-ink">Obrigada pela avaliação!</h1>
            <p className="mt-1 text-[14px] text-muted">Sua opinião ajuda {dados?.profissional} e o {dados?.negocio}.</p>
          </>
        ) : !dados ? (
          <p className="text-muted">Carregando...</p>
        ) : (
          <>
            <p className="text-[12px] font-bold uppercase tracking-wide text-brand-text">{dados.negocio}</p>
            <h1 className="mt-1 text-xl font-bold text-ink">Como foi seu atendimento com {dados.profissional}?</h1>
            <p className="mt-1 text-[13px] text-muted">{dados.servico} · {dataBr(dados.data)}</p>

            <div role="radiogroup" aria-label="Nota de 1 a 5" className="mt-5 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={nota === n}
                  aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                  onClick={() => setNota(n)}
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                >
                  <Star className={cn('h-9 w-9', n <= nota ? 'fill-brand text-brand' : 'text-line')} aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="mt-1 h-5 text-[13px] font-semibold text-ink">{ROTULO_NOTA[nota]}</p>

            <label className="mt-4 block text-left text-[13px] font-semibold text-ink">
              Quer contar mais? (opcional)
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={3}
                className="mt-1.5 w-full rounded-control border border-line bg-surface p-3 text-[15px] font-normal text-ink" />
            </label>
            {erro && <p role="alert" className="mt-2 text-sm text-danger">{erro}</p>}
            <Button className="mt-4" size="lg" fullWidth onClick={enviar} loading={enviando} disabled={!nota}>Enviar</Button>
          </>
        )}
      </section>
    </div>
  );
}
