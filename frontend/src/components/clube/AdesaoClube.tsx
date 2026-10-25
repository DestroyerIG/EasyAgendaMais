'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, CalendarClock, Check, Crown, Repeat } from 'lucide-react';
import { type NegocioPublico, type OfertaPublica, type ResultadoAdesao, clubePublicoApi, dataCurta } from '@/lib/clube';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button } from '@/components/ui';

// Página pública de adesão a um clube: a cliente informa nome e WhatsApp e recebe o Pix.
// A assinatura só começa quando o salão confirma o pagamento no painel.

const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Regra de uso do clube em uma linha, sem o tipo (a vitrine só tem clube). */
function regraPublica(o: OfertaPublica): string {
  const base = o.sessoesPorCiclo === null
    ? 'Uso livre no mês'
    : `${o.sessoesPorCiclo} ${o.sessoesPorCiclo === 1 ? 'sessão' : 'sessões'} por mês (não cumulativas)`;
  return o.intervaloMinimoDias > 0 ? `${base} · intervalo mínimo de ${o.intervaloMinimoDias} dias` : base;
}

export function AdesaoClube({ slug, ofertaId }: { slug: string; ofertaId: string }) {
  const [dados, setDados] = useState<{ negocio: NegocioPublico; oferta: OfertaPublica } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  // LGPD: consentimento pré-marcado não vale — a caixa começa desmarcada.
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAdesao | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const copiadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
  }, []);

  useEffect(() => {
    clubePublicoApi
      .oferta(slug, ofertaId)
      .then(setDados)
      .catch(() => setErro('Este clube não está disponível.'))
      .finally(() => setCarregando(false));
  }, [slug, ofertaId]);

  const pix = resultado?.cobranca.pixCopiaCola ?? null;
  useEffect(() => {
    if (!pix) {
      setQrCodeUrl(null);
      return;
    }
    let cancelado = false;
    QRCode.toDataURL(pix, { margin: 1, width: 220 })
      .then((url) => { if (!cancelado) setQrCodeUrl(url); })
      .catch(() => { if (!cancelado) setQrCodeUrl(null); });
    return () => { cancelado = true; };
  }, [pix]);

  const assinar = async () => {
    if (!consentimento) return;
    setEnviando(true);
    setErro(null);
    try {
      setResultado(await clubePublicoApi.aderir(slug, ofertaId, { nome, telefone, consentimento: true }));
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível concluir a adesão. Tente novamente.'));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix);
      setCopiado(true);
      if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
      copiadoTimer.current = setTimeout(() => setCopiado(false), 3000);
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione o código e copie manualmente.');
    }
  };

  if (carregando) return <div className="p-8 text-center text-muted">Carregando...</div>;
  if (!dados) return <div className="p-8 text-center text-danger">{erro}</div>;
  const { negocio, oferta } = dados;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <Link href={`/agendar/${slug}`} aria-label="Voltar para a página do salão" className="text-muted hover:text-ink">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        {negocio.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase Storage), sem domínio pro next/image otimizar
          <img src={negocio.logoUrl} alt="" className="h-8 w-8 rounded-full border border-line object-cover" />
        )}
        <p className="truncate font-bold text-ink">{negocio.nome}</p>
      </div>

      <div className="flex-1 space-y-5 px-4 pb-6 pt-5">
        <section className="rounded-card border border-line bg-surface p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand">
            <Crown className="h-4 w-4" aria-hidden="true" /> Assinatura mensal
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{oferta.nome}</h1>
          {oferta.descricao && <p className="mt-1 text-sm text-muted">{oferta.descricao}</p>}
          <p className="mt-4 text-3xl font-bold tabular-nums text-ink">
            {formatCurrency(oferta.preco)}<span className="text-base font-semibold text-muted">/mês</span>
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
            <Repeat className="h-4 w-4 shrink-0" aria-hidden="true" />
            Cobrança mensal por Pix · cancele quando quiser
          </p>
        </section>

        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-[15px] font-bold text-ink">O que está incluso</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {oferta.servicos.map((s) => (
              <li key={s} className="flex items-start gap-2 text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" /> {s}
              </li>
            ))}
            {oferta.descontoExtrasPct > 0 && (
              <li className="flex items-start gap-2 text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
                {String(oferta.descontoExtrasPct).replace('.', ',')}% de desconto nos outros serviços e produtos
              </li>
            )}
            {oferta.beneficios.map((b) => (
              <li key={b} className="flex items-start gap-2 text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" /> {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[13px] text-muted">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {regraPublica(oferta)}
          </p>
        </section>

        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}

        {resultado ? (
          <section className="flex flex-col gap-4 rounded-card border border-line bg-surface-2 p-5">
            <h2 className="font-bold text-ink">Pague a 1ª mensalidade de {formatCurrency(resultado.cobranca.valor)} via Pix</h2>
            {resultado.repetida && (
              <p className="text-sm text-muted">Você já tinha começado esta adesão. Este é o mesmo Pix.</p>
            )}
            {qrCodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL gerado no cliente, sem domínio pro next/image otimizar
              <img src={qrCodeUrl} alt="QR Code do Pix" width={220} height={220}
                className="mx-auto rounded-lg border border-line bg-surface p-2" />
            )}
            {pix ? (
              <>
                <textarea readOnly aria-label="Código Pix copia e cola" value={pix}
                  className="h-24 rounded-lg border border-line bg-surface p-3 text-xs text-ink" />
                <Button type="button" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar código'}</Button>
              </>
            ) : (
              <p className="text-sm text-muted">O salão vai te enviar o Pix pelo WhatsApp.</p>
            )}
            <p className="text-sm text-ink">
              Assim que o salão confirmar o pagamento, sua assinatura começa. Vencimento: {dataCurta(resultado.cobranca.vencimento)}.
            </p>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
            <h2 className="text-[15px] font-bold text-ink">Seus dados</h2>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Seu nome
              <input placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink" />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Seu WhatsApp
              <input placeholder="Seu WhatsApp" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink" />
            </label>
            <label className="mt-1 flex items-start gap-3 rounded-card border border-line bg-surface-2 p-3">
              <input
                type="checkbox"
                checked={consentimento}
                onChange={(e) => setConsentimento(e.target.checked)}
                aria-labelledby="consentimento-clube"
                aria-describedby="consentimento-clube-ajuda"
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
              />
              <span className="flex flex-col gap-0.5">
                <span id="consentimento-clube" className="text-[14px] font-semibold text-ink">
                  Aceito receber a cobrança mensal e os avisos do clube pelo WhatsApp de {negocio.nome}
                </span>
                <span id="consentimento-clube-ajuda" className="text-[13px] text-muted">
                  Você pode cancelar a assinatura quando quiser, é só avisar o salão.
                </span>
              </span>
            </label>
            <Button type="button" fullWidth disabled={enviando || !nome || !telefone || !consentimento} loading={enviando} onClick={assinar}>
              Assinar com Pix
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}

/** Seção "Clube" da Minha página: some quando não há clube público. */
export function ClubeVitrine({ slug }: { slug: string }) {
  const [ofertas, setOfertas] = useState<OfertaPublica[]>([]);

  useEffect(() => {
    let ativo = true;
    clubePublicoApi
      .vitrine(slug)
      .then((v) => { if (ativo) setOfertas(v.ofertas); })
      .catch(() => { if (ativo) setOfertas([]); });
    return () => { ativo = false; };
  }, [slug]);

  if (ofertas.length === 0) return null;
  return (
    <section aria-labelledby="vitrine-clube" className="mt-8">
      <h2 id="vitrine-clube" className="flex items-center gap-2 text-xl font-bold text-ink">
        <Crown className="h-5 w-5 text-brand" aria-hidden="true" /> Clube
      </h2>
      <p className="mt-1 text-sm text-muted">Assine e tenha suas sessões garantidas todo mês.</p>
      <div className="mt-4 flex flex-col gap-3">
        {ofertas.map((o) => (
          <Link key={o.id} href={`/agendar/${slug}/clube/${o.id}`}
            className="block rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand/50">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold text-ink">{o.nome}</p>
              <p className="shrink-0 font-bold tabular-nums text-ink">{formatCurrency(o.preco)}<span className="text-sm font-semibold text-muted">/mês</span></p>
            </div>
            <p className="mt-1 text-sm text-muted">{regraPublica(o)}</p>
            <p className="mt-2 text-[13px] font-semibold text-brand">Conhecer o clube →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
