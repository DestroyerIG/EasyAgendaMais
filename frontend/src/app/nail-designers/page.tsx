import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { ForcedLight } from '@/components/theme/ForcedLight';
import { Icon } from '@/components/ui';
import { HeroPhoneMockup } from '@/components/marketing/landing/HeroPhoneMockup';
import { SectionHeading } from '@/components/marketing/landing/SectionHeading';
import { segments } from '@/components/marketing/landing/heroSegments';
import { formatCurrency } from '@/lib/formatters';

export const metadata: Metadata = {
  title: 'EasyAgenda+ para Nail Designers e Manicures',
  description:
    'Agenda online, sinal via Pix e lembrete de manutenção para manicures e nail designers que atendem em mesa própria ou espaço individual.',
};

const painPoints = [
  {
    icone: 'person_off',
    tag: 'Dor 01: Faltas de última hora',
    title: 'Mesa vazia e horário de sábado perdido',
    description:
      'A cliente avisa que não vai 15 minutos antes ou simplesmente não aparece, jogando fora horas de faturamento que não voltam mais.',
    solutionLabel: 'Solução: Sinal via Pix obrigatório',
    solutionText:
      'Quem agenda pelo seu link paga um sinal no Pix, no percentual que você define em cada serviço. O dinheiro cai direto na sua conta, sem intermediação.',
  },
  {
    icone: 'alarm',
    tag: 'Dor 02: Manutenção esquecida',
    title: 'Alongamento que quebra e cliente insatisfeita',
    description:
      'A cliente esquece a data, ultrapassa o prazo com a unha crescendo descompensada e chega querendo milagre na mesa.',
    solutionLabel: 'Solução: Hora de voltar',
    solutionText:
      'Você liga a automação e define o prazo (21 dias por padrão, ou o intervalo de cada cliente). Quando chega a hora, a cliente recebe no WhatsApp o convite para a manutenção, antes de haver quebra.',
  },
  {
    icone: 'speaker_notes_off',
    tag: 'Dor 03: Directs incessantes',
    title: 'Parar de lixar para responder valores e horários',
    description:
      'Você com pó na luva tendo que parar o atendimento pra avisar que não tem vaga quinta às 18h, perdendo foco e tempo.',
    solutionLabel: 'Solução: Link com horários em tempo real',
    solutionText:
      'Cole seu link no Instagram e no WhatsApp. A cliente clica, vê só as brechas livres, escolhe o serviço e agenda em segundos.',
  },
];

const gallery = [
  {
    photo: '/images/nail-gallery-1.jpg',
    duration: '1h de duração',
    title: 'Blindagem Diamante com Banho de Gel',
    price: 90,
  },
  {
    photo: '/images/nail-gallery-2.jpg',
    duration: '1h 30m de duração',
    title: 'Manutenção com Esmaltação em Gel Nude Chic',
    price: 120,
  },
  {
    photo: '/images/nail-gallery-3.jpg',
    duration: '2h 15m de duração',
    title: 'Nail Art Minimalista com Linhas Geométricas',
    price: 150,
  },
];

const faqItems = [
  {
    question: 'E se a cliente não pagar o sinal?',
    answer:
      'O horário fica reservado pelo prazo que você escolher: 15, 30 ou 60 minutos. Você confirma o Pix no painel; se o pagamento não for confirmado nesse prazo, o horário volta a ficar livre na sua agenda.',
  },
  {
    question: 'Atendo a domicílio, funciona para mim?',
    answer:
      'Funciona para organizar a agenda, o sinal e os lembretes. Ainda não há taxa de deslocamento nem intervalo automático entre endereços: por enquanto, inclua o tempo de deslocamento na duração do serviço.',
  },
  {
    question: 'Preciso de computador na bancada?',
    answer:
      'Não. O EasyAgenda+ foi feito para usar no celular com uma mão só. Você confirma horários e consulta dados de clientes entre uma secagem e outra.',
  },
  {
    question: 'O dinheiro do sinal cai na minha conta na hora?',
    answer:
      'Sim, o pagamento via Pix cai instantaneamente na chave cadastrada no seu banco de preferência. Não retemos o valor nem cobramos porcentagem sobre o sinal.',
  },
];

export default function NailDesignersPage() {
  return (
    <ForcedLight className="min-h-screen bg-bg text-ink">
      <PublicNavbar />

      <main id="main-content">
        {/* Hero */}
        <section className="overflow-hidden border-b border-line bg-surface py-14 sm:py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-8">
            <div className="flex flex-col gap-6 lg:col-span-7">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted shadow-sm">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Exclusivo para Manicures &amp; Nail Designers
              </div>

              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl lg:text-[44px]">
                Pare de responder <span className="text-brand-text">“tem horário amanhã?”</span> no direct.
              </h1>
              <p className="max-w-xl text-base text-muted sm:text-lg">
                Sua cliente agenda sozinha pelo link da bio, paga o sinal no Pix e recebe o lembrete da manutenção no
                WhatsApp antes de quebrar o alongamento.
              </p>

              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/cadastro?segmento=unhas"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-brand px-8 py-4 text-sm font-bold text-on-brand shadow-md transition-opacity hover:opacity-90"
                >
                  Testar grátis
                  <Icon name="arrow_forward" size={16} />
                </Link>
                <div className="flex items-center gap-2 text-muted">
                  <Icon name="verified_user" size={18} className="text-whatsapp" />
                  <span className="text-xs">Acesso imediato sem burocracia</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Icon name="check_circle" size={20} className="text-whatsapp" />
                  <span className="text-sm font-semibold">Sem taxa de adesão</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="check_circle" size={20} className="text-whatsapp" />
                  <span className="text-sm font-semibold">7 dias grátis sem cartão</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="check_circle" size={20} className="text-whatsapp" />
                  <span className="text-sm font-semibold">Não exige cartão de crédito</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <HeroPhoneMockup data={segments.unhas} />
            </div>
          </div>
        </section>

        {/* Dores específicas */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Soluções pensadas na mesa"
              title="A rotina de uma Nail Designer não pode depender da sorte"
              subtitle="Veja como o EasyAgenda+ resolve as três maiores dores de quem trabalha horas com motor, cabine e lixa na mão."
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {painPoints.map((pain) => (
                <article key={pain.title} className="flex flex-col justify-between gap-4 rounded-card border border-line bg-surface p-6 shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
                      <Icon name={pain.icone} size={24} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wide text-danger">{pain.tag}</span>
                    <h3 className="text-lg font-bold text-ink">{pain.title}</h3>
                    <p className="text-sm text-muted">{pain.description}</p>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-4">
                    <div className="mb-1 flex items-center gap-2 text-sm font-bold text-whatsapp">
                      <Icon name="verified_user" size={18} />
                      {pain.solutionLabel}
                    </div>
                    <p className="text-sm text-muted">{pain.solutionText}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Galeria que agenda */}
        <section className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-widest text-brand">Galeria na sua página</span>
                <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[32px] lg:text-[36px]">
                  Sua vitrine de unhas na mesma página do agendamento
                </h2>
                <p className="mt-2 text-base text-muted">
                  A cliente vê seus trabalhos na sua página e agenda o serviço logo abaixo.
                </p>
              </div>
              <div className="flex w-fit items-center gap-2 rounded-lg bg-whatsapp/10 px-3.5 py-2 text-sm font-semibold text-whatsapp">
                <Icon name="image" size={20} />
                Galeria em destaque na sua página
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map((item) => (
                <article key={item.title} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
                  <div className="relative h-56 w-full bg-surface-2">
                    <Image src={item.photo} alt={item.title} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" />
                    <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">
                      {item.duration}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                    <div className="flex flex-col gap-2">
                      <h3 className="text-base font-bold text-ink">{item.title}</h3>
                      <p className="text-xl font-extrabold text-ink">{formatCurrency(item.price)}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Icon name="check_circle" size={16} className="text-whatsapp" />
                        Já inclui reserva e sinal Pix
                      </div>
                    </div>
                    <Link
                      href="/cadastro?segmento=unhas"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-on-brand shadow-sm transition-opacity hover:opacity-90"
                    >
                      Quero esse
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Depoimento */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-8 rounded-card border border-line bg-surface p-8 shadow-sm lg:grid-cols-12 lg:p-12">
              <div className="flex flex-col items-center gap-3 text-center lg:col-span-4 lg:items-start lg:text-left">
                <div className="relative h-32 w-32 overflow-hidden rounded-2xl shadow-md lg:h-40 lg:w-40">
                  <Image src="/images/hero-studio-avatar.jpg" alt="Foto ilustrativa de uma nail designer" fill sizes="160px" className="object-cover" />
                </div>
                <span className="text-sm font-bold text-ink">Depoimento de exemplo</span>
              </div>

              <div className="flex flex-col gap-4 lg:col-span-8">
                <p className="text-lg italic leading-relaxed text-ink sm:text-xl">
                  &ldquo;Antes eu perdia noites respondendo direct e ainda levava calote de no-show. Desde que comecei
                  a usar o sinal via Pix e os lembretes automáticos de manutenção, as clientes comparecem no horário e
                  a rotina da minha mesa ficou muito mais tranquila.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex text-brand">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Icon key={index} name="star" size={20} filled />
                    ))}
                  </div>
                  <span className="text-sm text-muted">Segmento: Nail Designer</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Preço */}
        <section className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-2 flex max-w-3xl items-center justify-center gap-2 text-center text-sm font-semibold text-brand-text">
              <Icon name="auto_awesome" size={16} />
              Recomendado pra quem atende sozinha: comece pelo plano Solo
            </div>
            <PricingPlansSection
              title="O plano sob medida pra quem atende em mesa própria"
              subtitle="Sem contratos de fidelidade ou taxas ocultas. Só o que você precisa pra focar no seu trabalho de mesa."
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Dúvidas frequentes"
              title="Perguntas comuns das Nail Designers"
              subtitle="Respostas diretas sobre como a plataforma funciona na sua rotina de mesa."
            />

            <div className="flex flex-col gap-4">
              {faqItems.map((item) => (
                <details key={item.question} className="group overflow-hidden rounded-card border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-left">
                    <span className="text-base font-bold text-ink">{item.question}</span>
                    <svg
                      className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <p className="px-6 pb-6 text-sm text-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="border-t border-line bg-surface-2 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-text">Chega de sobrecarga</span>
            <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[32px] lg:text-[38px]">
              Sua bancada cheia e seus fins de semana livres de mensagens no direct.
            </h2>
            <p className="mt-3 text-base text-muted">
              Deixe que o EasyAgenda+ cuide da recepção, dos sinais e dos lembretes pra você se dedicar à arte de
              transformar unhas.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/cadastro?segmento=unhas"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-brand px-8 py-4 text-sm font-bold text-on-brand shadow-md transition-opacity hover:opacity-90"
              >
                Experimentar grátis agora
                <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <Icon name="bolt" size={16} className="text-whatsapp" />
              Configuração guiada em 5 etapas, direto no painel. Sem dados de cartão.
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </ForcedLight>
  );
}
