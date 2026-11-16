'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ForcedLight } from '@/components/theme/ForcedLight';
import { cn } from '@/lib/cn';
import { ABRIR_PREFERENCIAS_EVENT, lerConsentimento, salvarConsentimento } from '@/lib/cookieConsent';
import { rotaPermitePixel } from '@/lib/metaPixel';

type Estado = 'carregando' | 'aberto' | 'fechado';

const botao =
  'min-h-11 flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const botaoNeutro = `${botao} border-line bg-surface-2 text-ink hover:border-ink/40`;
const botaoPrimario = `${botao} border-brand bg-brand text-on-brand hover:opacity-90`;

function Interruptor({
  rotulo,
  descricao,
  ligado,
  travado,
  onChange,
}: {
  rotulo: string;
  descricao: string;
  ligado: boolean;
  travado?: boolean;
  onChange?: (ligado: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-3">
      <div>
        <p className="text-sm font-bold text-ink">{rotulo}</p>
        <p className="mt-0.5 text-xs text-muted">{descricao}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        disabled={travado}
        onClick={() => onChange?.(!ligado)}
        className={cn(
          'relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
          ligado ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all',
            ligado ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

/**
 * Pop-up de consentimento de cookies (LGPD). Aparece nas páginas públicas enquanto não há
 * escolha válida e reabre pelo "Gerenciar cookies". Sempre no tema claro, como a landing.
 */
export function CookieBanner() {
  const pathname = usePathname();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [preferencias, setPreferencias] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const cartao = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEstado(lerConsentimento() ? 'fechado' : 'aberto');
    const reabrir = () => {
      setMarketing(lerConsentimento()?.marketing === true);
      setPreferencias(true);
      setEstado('aberto');
    };
    window.addEventListener(ABRIR_PREFERENCIAS_EVENT, reabrir);
    return () => window.removeEventListener(ABRIR_PREFERENCIAS_EVENT, reabrir);
  }, []);

  useEffect(() => {
    if (estado === 'aberto') cartao.current?.focus();
  }, [estado, preferencias]);

  if (estado !== 'aberto' || !rotaPermitePixel(pathname)) return null;

  const escolher = (aceitaMarketing: boolean) => {
    salvarConsentimento(aceitaMarketing);
    setPreferencias(false);
    setEstado('fechado');
  };

  return (
    <ForcedLight>
      <div
        ref={cartao}
        tabIndex={-1}
        role="dialog"
        aria-label="Cookies no EasyAgenda+"
        className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl focus:outline-none"
      >
        {preferencias ? (
          <>
            <h2 className="text-base font-bold">Preferências de cookies</h2>
            <p className="mt-1 text-sm text-muted">
              Escolha quais categorias você permite. Você pode mudar isso quando quiser.
            </p>
            <div className="mt-3">
              <Interruptor
                rotulo="Necessários"
                descricao="Login, sessão e tema. Sem eles o site não funciona."
                ligado
                travado
              />
              <Interruptor
                rotulo="Marketing"
                descricao="Pixel da Meta: mede anúncios no Facebook e Instagram. Nossos eventos não incluem nome, e-mail ou telefone."
                ligado={marketing}
                onChange={setMarketing}
              />
            </div>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <button type="button" className={botaoNeutro} onClick={() => setPreferencias(false)}>
                Voltar
              </button>
              <button type="button" className={botaoPrimario} onClick={() => escolher(marketing)}>
                Salvar preferências
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold">Cookies no EasyAgenda+</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Usamos cookies necessários para o site funcionar (login e tema). Com a sua permissão, usamos também
              cookies de marketing (pixel da Meta) para medir nossos anúncios. Saiba mais na{' '}
              <Link href="/cookies" className="font-semibold text-brand-text underline">
                Política de Cookies
              </Link>
              .
            </p>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <button type="button" className={botaoNeutro} onClick={() => escolher(false)}>
                Recusar não essenciais
              </button>
              <button
                type="button"
                className={botaoNeutro}
                onClick={() => {
                  setMarketing(false);
                  setPreferencias(true);
                }}
              >
                Personalizar
              </button>
              <button type="button" className={botaoPrimario} onClick={() => escolher(true)}>
                Aceitar todos
              </button>
            </div>
          </>
        )}
      </div>
    </ForcedLight>
  );
}
