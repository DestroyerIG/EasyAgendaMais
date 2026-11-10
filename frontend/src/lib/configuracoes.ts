export type SecaoConfiguracao =
  | 'perfil'
  | 'conta'
  | 'horarios'
  | 'comissao'
  | 'app-profissional'
  | 'google-agenda'
  | 'recebimentos'
  | 'crm';

export interface CartaoConfiguracao {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  href: string;
  /** Termos extras para a busca geral. */
  sinonimos?: readonly string[];
}

export interface GrupoConfiguracao {
  rotulo: string;
  cartoes: readonly CartaoConfiguracao[];
}

export const GRUPOS_CONFIGURACAO: readonly GrupoConfiguracao[] = [
  {
    rotulo: 'Sua empresa',
    cartoes: [
      {
        id: 'perfil',
        titulo: 'Perfil do negócio',
        descricao: 'Nome, responsável, WhatsApp, CPF/CNPJ e e-mail da conta.',
        icone: 'storefront',
        href: '/configuracoes/perfil',
        sinonimos: ['negócio', 'dados cadastrais'],
      },
      {
        id: 'horarios',
        titulo: 'Horários de funcionamento',
        descricao: 'Dias abertos, horário de abrir e fechar e intervalo entre vagas.',
        icone: 'schedule',
        href: '/configuracoes/horarios',
        sinonimos: ['funcionamento', 'expediente'],
      },
      {
        id: 'servicos',
        titulo: 'Serviços e equipe',
        descricao: 'O que se pode marcar, preços, duração e quem atende.',
        icone: 'content_cut',
        href: '/servicos',
        sinonimos: ['serviços', 'equipe', 'preços'],
      },
      {
        id: 'comissao',
        titulo: 'Comissão padrão',
        descricao: 'Percentual que cada profissional recebe quando não há regra própria.',
        icone: 'percent',
        href: '/configuracoes/comissao',
        sinonimos: ['comissões'],
      },
    ],
  },
  {
    rotulo: 'Conta e acesso',
    cartoes: [
      {
        id: 'conta',
        titulo: 'Senha e acesso',
        descricao: 'Troque a senha de entrada no painel.',
        icone: 'lock',
        href: '/configuracoes/conta',
        sinonimos: ['senha', 'segurança'],
      },
      {
        id: 'app-profissional',
        titulo: 'App da profissional',
        descricao: 'Quem cobra a cliente no fim do atendimento.',
        icone: 'smartphone',
        href: '/configuracoes/app-profissional',
      },
      {
        id: 'planos',
        titulo: 'Plano e cobrança',
        descricao: 'Seu plano, fatura, forma de pagamento e upgrade.',
        icone: 'credit_card',
        href: '/planos',
        sinonimos: ['assinatura', 'cobrança'],
      },
    ],
  },
  {
    rotulo: 'Clientes e integrações',
    cartoes: [
      {
        id: 'google-agenda',
        titulo: 'Google Agenda',
        descricao: 'Conecte a agenda do negócio ao Google.',
        icone: 'event',
        href: '/configuracoes/google-agenda',
      },
      {
        id: 'recebimentos',
        titulo: 'Recebimentos',
        descricao: 'Chave Pix do sinal e confirmação automática do pagamento.',
        icone: 'account_balance_wallet',
        href: '/configuracoes/recebimentos',
        sinonimos: ['mercado pago', 'infinitepay', 'pix', 'chave pix', 'sinal'],
      },
      {
        id: 'crm',
        titulo: 'CRM e etiquetas',
        descricao: 'Segmento do negócio, meta diária e etiquetas das clientes.',
        icone: 'sell',
        href: '/configuracoes/crm',
        sinonimos: ['etiquetas', 'tags', 'meta'],
      },
    ],
  },
];

export const CARTOES_CONFIGURACAO: readonly CartaoConfiguracao[] = GRUPOS_CONFIGURACAO.flatMap((g) => g.cartoes);

export const SECOES_CONFIGURACAO: readonly SecaoConfiguracao[] = [
  'perfil',
  'conta',
  'horarios',
  'comissao',
  'app-profissional',
  'google-agenda',
  'recebimentos',
  'crm',
];

export function ehSecaoConfiguracao(valor: string): valor is SecaoConfiguracao {
  return (SECOES_CONFIGURACAO as readonly string[]).includes(valor);
}

export function tituloDaSecao(secao: SecaoConfiguracao): string {
  return CARTOES_CONFIGURACAO.find((c) => c.id === secao)?.titulo ?? 'Configurações';
}
