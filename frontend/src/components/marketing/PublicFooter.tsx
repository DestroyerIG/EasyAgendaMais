import Image from 'next/image';
import Link from 'next/link';
import { Calendar, BadgeCheck } from 'lucide-react';

const EASYCONNECT_URL = 'https://easyconnectcg.com.br';

const defaultContactUrl =
  'https://wa.me/5583991347023?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyAgenda';

const segmentLinks = [
  { label: 'Barbearias', href: '/cadastro' },
  { label: 'Esmalterias e Unhas', href: '/nail-designers' },
  { label: 'Cílios e Sobrancelhas', href: '/cadastro' },
  { label: 'Salões de Beleza', href: '/cadastro' },
  { label: 'Clínicas de Estética', href: '/cadastro' },
  { label: 'Spas & Massoterapia', href: '/cadastro' },
];

const resourceLinks = [
  { label: 'Agenda Online 24/7', href: '#recursos' },
  { label: 'Lembretes via WhatsApp', href: '#recursos' },
  { label: 'Cobrança de Sinal Pix', href: '#recursos' },
  { label: 'Radar de Retorno', href: '#recursos' },
  { label: 'Fechamento de Caixa', href: '#recursos' },
  { label: 'Planos e Preços', href: '#planos' },
];

export function PublicFooter() {
  const contactUrl = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_URL || defaultContactUrl;

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
                <Calendar className="h-5 w-5 text-on-brand" aria-hidden="true" />
              </div>
              <span className="text-lg font-bold tracking-tight text-ink">
                EasyAgenda<span className="text-brand">+</span>
              </span>
            </div>
            <p className="max-w-sm text-sm text-muted">
              Plataforma inteligente de agendamento online e gestão operacional desenvolvida para negócios de
              bem-estar, estética e beleza.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-bg text-whatsapp">
                <BadgeCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-ink">100% em Conformidade LGPD</span>
                <span className="text-xs text-muted">Seus dados e de seus clientes seguros</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-bold text-ink">Segmentos</span>
            <div className="flex flex-col gap-2.5">
              {segmentLinks.map((link) => (
                <Link key={link.label} href={link.href} className="text-sm text-muted hover:text-ink">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-bold text-ink">Recursos</span>
            <div className="flex flex-col gap-2.5">
              {resourceLinks.map((link) => (
                <a key={link.label} href={link.href} className="text-sm text-muted hover:text-ink">
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-bold text-ink">Legal e suporte</span>
            <div className="flex flex-col gap-2.5">
              <Link href="/termos" className="text-sm text-muted hover:text-ink">
                Termos de Uso
              </Link>
              <Link href="/privacidade" className="text-sm text-muted hover:text-ink">
                Política de Privacidade
              </Link>
              <a href={contactUrl} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-ink">
                Suporte via WhatsApp
              </a>
              <a href="mailto:contato@easyconnectcg.com.br" className="text-sm text-muted hover:text-ink">
                Fale com Especialista
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-8 md:flex-row">
          <p className="text-xs text-muted">© {new Date().getFullYear()} EasyAgenda+. Todos os direitos reservados.</p>

          <div className="flex items-center gap-6">
            <Link href="/termos" className="text-xs text-muted hover:text-ink">
              Termos
            </Link>
            <span className="text-line">·</span>
            <Link href="/privacidade" className="text-xs text-muted hover:text-ink">
              Privacidade
            </Link>
            <span className="text-line">·</span>
            <Link href="/privacidade" className="text-xs text-muted hover:text-ink">
              Segurança
            </Link>
          </div>

          <a
            href={EASYCONNECT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
            aria-label="Powered by EasyConnect"
          >
            <span className="text-xs text-muted">Powered by</span>
            <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5">
              <Image
                src="/easyconnect-logo.svg"
                alt="EasyConnect"
                width={90}
                height={26}
                className="h-[26px] w-auto object-contain"
                unoptimized
              />
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
