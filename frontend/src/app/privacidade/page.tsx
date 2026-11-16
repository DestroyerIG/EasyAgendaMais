import Link from 'next/link';
import { PublicNavbar } from '@/components/marketing/PublicNavbar';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { ForcedLight } from '@/components/theme/ForcedLight';

export const metadata = {
  title: 'Política de Privacidade - EasyAgenda+',
  description: 'Como o EasyAgenda+ coleta, usa e protege os seus dados pessoais, em conformidade com a LGPD.',
};

const LAST_UPDATE = '16 de novembro de 2026';

const sections = [
  {
    title: '1. Introdução',
    paragraphs: [
      'Esta Política de Privacidade descreve como o EasyAgenda+, operado pela EasyConnect, coleta, utiliza, armazena e protege os dados pessoais tratados na plataforma, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).',
      'Ao utilizar a plataforma, você declara estar ciente das práticas descritas neste documento.',
    ],
  },
  {
    title: '2. Dados que coletamos',
    paragraphs: [
      'Dados de cadastro: nome, e-mail, telefone/WhatsApp, CPF ou CNPJ e dados do negócio necessários à prestação do serviço.',
      'Dados operacionais: agendamentos, histórico de atendimentos, informações de clientes cadastrados pelo titular da conta, dados financeiros e de equipe inseridos na plataforma.',
      'Dados de uso: informações técnicas como registros de acesso, endereço IP e identificadores de dispositivo, coletados para segurança e melhoria do serviço.',
    ],
  },
  {
    title: '3. Como utilizamos os dados',
    paragraphs: [
      'Utilizamos os dados para fornecer e operar a plataforma, processar pagamentos, enviar notificações e lembretes, prestar suporte, garantir segurança e cumprir obrigações legais e regulatórias.',
      'Não vendemos dados pessoais. O tratamento ocorre conforme as bases legais previstas na LGPD, como execução de contrato, cumprimento de obrigação legal, legítimo interesse e consentimento (por exemplo, para cookies de marketing).',
    ],
  },
  {
    title: '4. Compartilhamento com terceiros',
    paragraphs: [
      'Podemos compartilhar dados com provedores que viabilizam o serviço, como processadores de pagamento (Asaas), serviços de hospedagem, banco de dados e envio de mensagens, sempre limitados à finalidade necessária.',
      'Com o seu consentimento, usamos também o pixel da Meta (Facebook e Instagram) nas páginas públicas para medir a eficácia dos nossos anúncios. A Meta pode tratar os dados coletados conforme as próprias políticas.',
      'Esses provedores estão sujeitos a obrigações de confidencialidade e proteção de dados compatíveis com a legislação aplicável.',
    ],
  },
  {
    title: '5. Armazenamento e segurança',
    paragraphs: [
      'Adotamos medidas técnicas e organizacionais para proteger os dados contra acesso não autorizado, perda ou alteração indevida. Os dados são mantidos pelo período necessário às finalidades descritas ou conforme exigido por lei.',
      'Apesar dos esforços, nenhum sistema é totalmente imune a riscos. Em caso de incidente de segurança relevante, adotaremos as providências previstas na LGPD.',
    ],
  },
  {
    title: '6. Responsabilidade pelos dados de clientes finais',
    paragraphs: [
      'O negócio titular da conta é o controlador dos dados de seus próprios clientes inseridos na plataforma, sendo responsável por obter o consentimento e as bases legais necessárias. O EasyAgenda+ atua como operador desses dados, tratando-os conforme as instruções do controlador.',
    ],
  },
  {
    title: '7. Direitos do titular',
    paragraphs: [
      'Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação e informações sobre o compartilhamento dos seus dados.',
      'Para exercer seus direitos, entre em contato pelo e-mail contato@easyconnectcg.com.br. Poderemos solicitar informações para confirmar sua identidade antes de atender à solicitação.',
    ],
  },
  {
    title: '8. Dados do Google',
    paragraphs: [
      'Login com Google: quando você entra com o Google, recebemos apenas seu nome, e-mail e a confirmação de que o e-mail é seu, para criar ou acessar sua conta.',
      'Google Agenda: se você conectar o Google Agenda, o EasyAgenda+ cria uma agenda separada chamada "EasyAgenda+" na sua conta e grava nela os seus agendamentos. Da sua agenda principal, lemos apenas se cada horário está ocupado ou livre, para não oferecer às clientes um horário em que você tem compromisso. Não lemos títulos, descrições, convidados nem qualquer outro detalhe dos seus eventos.',
      'O acesso fica guardado de forma cifrada e é usado só para essas finalidades. Você pode desconectar a qualquer momento em Ajustes (ou no app da profissional); ao desconectar, revogamos o acesso no Google e apagamos o que guardamos. A agenda "EasyAgenda+" continua na sua conta, e você pode apagá-la pelo próprio Google Agenda.',
      'O uso das informações recebidas das APIs do Google segue a Política de Dados do Usuário dos Serviços de API do Google (Google API Services User Data Policy), incluindo os requisitos de uso limitado (Limited Use). Esses dados não são vendidos, não são usados para publicidade e não são transferidos a terceiros.',
    ],
  },
  {
    title: '9. Cookies e tecnologias semelhantes',
    paragraphs: [
      'Utilizamos cookies e tecnologias semelhantes para autenticação, manutenção de sessão e melhoria da experiência. Você pode gerenciar as preferências de cookies no seu navegador, ciente de que isso pode afetar funcionalidades da plataforma.',
      'Cookies de marketing, como o pixel da Meta, só são ativados depois que você os aceita no aviso de cookies do site, e você pode revogar a escolha a qualquer momento. A lista completa de cookies, suas finalidades e durações está na Política de Cookies.',
    ],
  },
  {
    title: '10. Alterações desta política',
    paragraphs: [
      'Esta Política de Privacidade pode ser atualizada periodicamente. A versão vigente estará sempre disponível nesta página, com a data da última atualização.',
    ],
  },
  {
    title: '11. Contato',
    paragraphs: [
      'Para dúvidas, solicitações ou exercício de direitos relativos aos seus dados pessoais, entre em contato pelo e-mail contato@easyconnectcg.com.br.',
    ],
  },
];

export default function PrivacidadePage() {
  return (
    <ForcedLight className="min-h-screen bg-bg text-ink">
      <PublicNavbar />

      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-text">Documentos legais</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Política de Privacidade</h1>
        <p className="mt-3 text-sm text-muted">Última atualização: {LAST_UPDATE}</p>

        <div className="mt-10 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-ink">{section.title}</h2>
              <div className="mt-3 space-y-3 text-muted">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Consulte também os nossos{' '}
          <Link href="/termos" className="font-semibold text-brand-text hover:underline">Termos de Uso</Link>{' '}
          e a{' '}
          <Link href="/cookies" className="font-semibold text-brand-text hover:underline">Política de Cookies</Link>.
        </div>
      </main>

      <PublicFooter />
    </ForcedLight>
  );
}
