import Link from 'next/link';
import {
  Ban,
  CheckCircle2,
  Hand,
  Hourglass,
  Lock,
  PenLine,
  Radar,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { ForcedLight } from '@/components/theme/ForcedLight';
import { Hero } from '@/components/marketing/landing/Hero';
import { WhatsAppSimulator } from '@/components/marketing/landing/WhatsAppSimulator';
import { RoiCalculator } from '@/components/marketing/landing/RoiCalculator';
import { SectionHeading } from '@/components/marketing/landing/SectionHeading';

const painPoints = [
  {
    icon: Ban,
    tag: 'Dor 01: Faltas e desculpas de última hora',
    title: 'Cobrança de sinal obrigatório via Pix direto na sua conta',
    description:
      'Quem paga com antecedência comparece. Você define a porcentagem ou valor fixo (ex: R$ 30) para travar a vaga. O Pix é gerado automaticamente e confirmado em segundos.',
    panelLabel: 'Configuração de Sinal Pix',
    panelBadge: 'Ativo em todos os serviços',
    panelRow: { title: 'Depósito de Reserva', subtitle: 'Cobrado no ato do agendamento web', value: '30% ou R$ 30,00' },
    panelFoot: { icon: ShieldCheck, text: 'Taxa de no-show menor', tone: 'text-whatsapp' },
  },
  {
    icon: Radar,
    tag: 'Dor 02: Cliente que esquece de agendar a manutenção',
    title: 'Radar de Retorno automático no ciclo exato',
    description:
      'Cada serviço tem um ciclo natural de retorno (unhas a cada 21 dias, barba a cada 15 dias). O sistema avisa o cliente no momento certo, antes que ele procure a concorrência.',
    panelLabel: 'Radar de Retorno (21 dias)',
    panelBadge: '3 alertas hoje',
    panelRow: { title: 'Cliente Exemplo', subtitle: 'Último serviço: Manutenção (21 dias atrás)', value: 'WhatsApp enviado' },
    panelFoot: null,
  },
  {
    icon: Hourglass,
    tag: 'Dor 03: Horário vago por cancelamento emergencial',
    title: 'Lista de espera inteligente que preenche a vaga',
    description:
      'Quando alguém desmarca, o EasyAgenda+ notifica imediatamente os clientes que marcaram interesse naquele dia e turno, reocupando a cadeira sem esforço.',
    panelLabel: 'Desistência detectada: Sex 16:30',
    panelBadge: 'Vaga aberta',
    panelRow: { title: '4 clientes na fila de espera', subtitle: 'Disparo de aviso simultâneo via WhatsApp', value: 'Preenchido em 4 min' },
    panelFoot: null,
  },
  {
    icon: Wallet,
    tag: 'Dor 04: Brigas no fim do mês e papel de pão',
    title: 'Fechamento de caixa e rateio de comissões automático',
    description:
      'Separação exata de pagamentos em Pix, cartão ou dinheiro, com divisão automática conforme as regras do seu negócio.',
    panelLabel: 'Extrato Diário da Equipe',
    panelBadge: 'Total: R$ 1.820,00',
    panelRow: { title: 'Salão (50%)', subtitle: '', value: 'R$ 910,00' },
    panelFoot: null,
  },
  {
    icon: Users,
    tag: 'Dor 05: Profissionais sem visibilidade ou vendo dados sensíveis',
    title: 'Acesso individual e seguro para cada parceiro',
    description:
      'Cada colaborador acessa o próprio painel e visualiza apenas seus agendamentos e extrato de comissões, sem acessar o faturamento geral do negócio.',
    panelLabel: 'Permissões Segmentadas',
    panelBadge: '',
    panelRow: { title: 'Faturamento total do estabelecimento', subtitle: '', value: 'Oculto para parceiro' },
    panelFoot: { icon: Lock, text: 'Apenas dados individuais liberados na conta do parceiro', tone: 'text-status-confirmed' },
  },
];

const beforeItems = [
  'Mensagens acumuladas à noite e no domingo roubando o descanso da sua família.',
  'Faltas sem aviso prévio e horário nobre perdido que nunca mais é recuperado.',
  'Cliente esquecendo a data marcada porque você não teve tempo de mandar mensagem.',
  'Brigas no fim do mês por comissão anotada em papel e divergências no caixa.',
  'Sem histórico técnico do que o cliente fez em atendimentos anteriores.',
];

const afterItems = [
  'Agendamento ativo 24 horas por dia sem você precisar encostar no celular durante a rotina.',
  'Sinal antecipado via Pix que praticamente zera o no-show e garante o faturamento.',
  'Lembretes automáticos enviados via WhatsApp com 24h e 2h de antecedência.',
  'Comissões e rateio calculados automaticamente em tempo real.',
  'Ficha técnica, preferências e histórico organizados por cliente.',
];

const testimonials = [
  {
    quote:
      'O sinal Pix reduziu minhas faltas a praticamente zero. Não perco mais domingo respondendo WhatsApp.',
    segment: 'Segmento: Esmalteria e Unhas',
  },
  {
    quote:
      'Com barbeiros na casa, o fechamento de comissões levava horas. Hoje cada um olha o próprio celular e bate o repasse.',
    segment: 'Segmento: Barbearia',
  },
  {
    quote:
      'O Radar de Retorno traz clientes de volta sem eu precisar parecer insistente. Elas amam a pontualidade do lembrete.',
    segment: 'Segmento: Cílios e sobrancelha',
  },
];

const faqItems = [
  {
    question: 'Serve para o meu tipo de negócio?',
    answer:
      'Sim! O EasyAgenda+ foi desenhado especificamente para negócios baseados em agendamento pontual de serviços. Ele atende barbearias, esmalterias, designers de sobrancelhas e cílios, salões de cabeleireiro, clínicas de estética e estúdios de massoterapia, quer você trabalhe sozinho ou lidere uma equipe.',
  },
  {
    question: 'Preciso comprar outro chip para usar o WhatsApp?',
    answer:
      'Não! A plataforma se conecta diretamente ao seu número de WhatsApp atual através de um QR Code simples, igual ao WhatsApp Web. Você não perde nenhuma conversa anterior e continua conversando com seus clientes normalmente.',
  },
  {
    question: 'O dinheiro do sinal Pix cai na minha conta ou na plataforma?',
    answer:
      'Cai direto na sua conta bancária via chave Pix, no mesmo segundo da transferência. O EasyAgenda+ não retém o valor, não cobra comissão sobre o sinal e você não precisa solicitar saque.',
  },
  {
    question: 'Como funciona o teste grátis de 14 dias?',
    answer:
      'Você cria sua conta em poucos minutos e recebe acesso completo a todos os recursos da plataforma por 14 dias, sem exigir cartão de crédito no cadastro. Se optar por não continuar, o acesso é encerrado sem cobranças automáticas.',
  },
  {
    question: 'Minha equipe consegue ver o faturamento total do meu negócio?',
    answer:
      'Não. Cada profissional convidado possui um login restrito com perfil de colaborador. Eles visualizam apenas a própria grade de horários, suas notas técnicas e o extrato de comissão dos atendimentos que realizaram.',
  },
];

const defaultContactUrl =
  'https://wa.me/5583991347023?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyAgenda';

export default function HomePage() {
  const contactUrl = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_URL || defaultContactUrl;

  return (
    <ForcedLight className="min-h-screen bg-bg text-ink">
      <PublicNavbar />

      <main id="main-content">
        {/* 1. Hero */}
        <section id="inicio" className="overflow-hidden border-b border-line bg-surface py-14 sm:py-16 lg:py-24">
          <Hero />
        </section>

        {/* 2. Demonstração WhatsApp */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Automação humana & sem atrito"
              title="Veja como funciona na prática para o seu cliente"
              subtitle="Menos faltas e menos atrito. O fluxo completo ocorre onde seu cliente já está habituado: no WhatsApp."
            />

            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="flex justify-center lg:col-span-7">
                <WhatsAppSimulator />
              </div>

              <div className="flex flex-col gap-6 lg:col-span-5">
                <InfoCard
                  icon={Hand}
                  iconClassName="text-brand"
                  title="Zero perda de tempo digitando no meio do atendimento"
                  description="Você não precisa pausar o secador nem responder mensagens enquanto atende. O robô responde em segundos, consulta sua agenda em tempo real e bloqueia o horário."
                />
                <InfoCard
                  icon={Wallet}
                  iconClassName="text-whatsapp"
                  title="Sinal direto na sua conta sem intermediários"
                  description="O valor do sinal Pix cai instantaneamente na sua chave cadastrada. Não há taxa retida pelo EasyAgenda+ sobre o valor do sinal nem espera para sacar."
                />
              </div>
            </div>
          </div>
        </section>

        {/* 3. Calculadora de impacto */}
        <section className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Simulação real de faturamento"
              title="Quanto você perde com faltas e clientes que não voltam?"
              subtitle="Coloque seus números e veja o impacto real no seu faturamento mensal."
            />
            <RoiCalculator />
          </div>
        </section>

        {/* 4. Como funciona */}
        <section id="recursos" className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Configuração rápida"
              title="Do cadastro aos primeiros agendamentos em minutos"
              subtitle="Sem necessidade de suporte técnico, sem treinamentos longos e sem mudar a rotina do seu espaço."
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  step: 1,
                  title: 'Conecte o WhatsApp com QR code',
                  description: 'Escaneie o QR Code na tela com o seu celular. Sem precisar comprar outro chip nem mudar de número.',
                },
                {
                  step: 2,
                  title: 'Compartilhe seu link',
                  description: 'Coloque o link exclusivo na bio do Instagram, envie no WhatsApp e exiba o QR Code no balcão.',
                },
                {
                  step: 3,
                  title: 'A agenda se enche',
                  description: 'Seus clientes escolhem serviço e horário sozinhos, pagam o sinal e os lembretes saem no piloto automático.',
                },
              ].map((item) => (
                <article key={item.step} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-bg text-xl font-extrabold text-ink">
                    {item.step}
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-bold text-ink">{item.title}</h3>
                    <p className="text-sm text-muted">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Recursos por dor */}
        <section className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Solução prática para o dia a dia"
              title="Criado para resolver cada gargalo da sua rotina"
              subtitle="Construído a partir das dores reais de quem trabalha com horário marcado e lida com público diariamente."
            />

            <div className="flex flex-col gap-6">
              {painPoints.map((pain) => (
                <article
                  key={pain.title}
                  className="grid grid-cols-1 items-center gap-6 rounded-card border border-line bg-bg p-6 sm:p-8 lg:grid-cols-12"
                >
                  <div className="flex flex-col gap-3 lg:col-span-6">
                    <div className="flex items-center gap-2 text-sm font-bold text-brand">
                      <pain.icon className="h-5 w-5" aria-hidden="true" />
                      <span>{pain.tag}</span>
                    </div>
                    <h3 className="text-lg font-bold text-ink sm:text-xl">{pain.title}</h3>
                    <p className="text-sm text-muted sm:text-base">{pain.description}</p>
                  </div>
                  <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-sm lg:col-span-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-ink">{pain.panelLabel}</span>
                      {pain.panelBadge && (
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink">
                          {pain.panelBadge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-ink">{pain.panelRow.title}</span>
                        {pain.panelRow.subtitle && (
                          <span className="text-xs text-muted">{pain.panelRow.subtitle}</span>
                        )}
                      </div>
                      <span className="text-sm font-bold tabular-nums text-ink">{pain.panelRow.value}</span>
                    </div>
                    {pain.panelFoot && (
                      <div className={['flex items-center gap-2', pain.panelFoot.tone].join(' ')}>
                        <pain.panelFoot.icon className="h-4 w-4" aria-hidden="true" />
                        <span className="text-xs font-semibold">{pain.panelFoot.text}</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Antes e depois */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Transformação real"
              title="Compare a sua rotina"
              subtitle="Veja a diferença prática entre conduzir o negócio de forma manual versus ter um ecossistema inteligente."
            />

            <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-5 rounded-card border border-line bg-surface-2 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-line text-muted">
                    <PenLine className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-ink">Caderno + direct do Instagram</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {beforeItems.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <p className="text-sm text-muted">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-bg text-brand">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-ink">Com o EasyAgenda+</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {afterItems.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-whatsapp" aria-hidden="true" />
                      <p className="text-sm text-ink">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Planos */}
        <section id="planos" className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <PricingPlansSection
              title="Preço pelo tamanho da equipe, não por profissional"
              subtitle="Sem pegadinhas ou cobranças adicionais por colaborador que você contrata para o seu time."
            />
          </div>
        </section>

        {/* 8. Depoimentos */}
        <section className="bg-bg py-16 sm:py-20">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Casos práticos"
              title="Quem usa todos os dias recomenda"
              subtitle="Profissionais e estúdios que recuperaram horas de descanso e organizaram suas finanças."
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {testimonials.map((testimonial) => (
                <article
                  key={testimonial.segment}
                  className="flex flex-col justify-between gap-6 rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5 text-brand">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
                      ))}
                    </div>
                    <p className="text-[15px] italic leading-relaxed text-ink">&ldquo;{testimonial.quote}&rdquo;</p>
                  </div>
                  <div className="flex flex-col gap-0.5 border-t border-line pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Depoimento de exemplo</span>
                    <span className="text-sm font-bold text-ink">{testimonial.segment}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 9. FAQ */}
        <section className="border-y border-line bg-surface py-16 sm:py-20">
          <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Transparência"
              title="Dúvidas frequentes"
              subtitle="Respostas diretas sobre como a plataforma funciona no seu dia a dia."
            />

            <div className="flex flex-col gap-4">
              {faqItems.map((item) => (
                <details key={item.question} className="group overflow-hidden rounded-card border border-line bg-bg">
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

        {/* 10. CTA final */}
        <section id="contato" className="bg-bg py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-8 rounded-card border border-line bg-surface p-8 shadow-sm sm:p-10 lg:flex-row lg:p-14">
              <div className="flex max-w-xl flex-col gap-3 text-center lg:text-left">
                <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
                  Sua cadeira ocupada e seu tempo de volta.
                </h2>
                <p className="text-base text-muted">
                  Junte-se a estúdios e profissionais que pararam de perder dinheiro para o no-show e para as noites de
                  domingo respondendo mensagens.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-4 sm:flex-row">
                <Link
                  href="/cadastro"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-brand px-8 py-4 text-center text-sm font-bold text-on-brand shadow-md transition-opacity hover:opacity-90"
                >
                  Começar teste grátis de 14 dias
                </Link>
                <a
                  href={contactUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-line px-8 py-4 text-center text-sm font-bold text-ink transition-colors hover:border-ink/40"
                >
                  Falar no WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </ForcedLight>
  );
}

function InfoCard({
  icon: Icon,
  iconClassName,
  title,
  description,
}: {
  icon: typeof Hand;
  iconClassName: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className={['flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2', iconClassName].join(' ')}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
