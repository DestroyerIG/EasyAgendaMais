/**
 * Conteúdo de exemplo das telas do painel.
 *
 * NADA AQUI VEM DO BANCO. São os valores que as telas de referência do Stitch
 * mostram, usados nos blocos cujas funções ainda não existem (sub-projetos D a I:
 * clube e pacotes, relatórios, página pública, sinal Pix, automações de WhatsApp).
 *
 * Quando a função correspondente existir, troque o uso deste módulo pelo dado real
 * e apague a chave. Antes de publicar para clientes, decida bloco a bloco: ou o dado
 * é real, ou o bloco sai da tela.
 *
 * Regra desta rodada de limpeza (correção I11 da revisão final): campo sem consumidor
 * fora deste módulo e dos testes foi apagado; valor que é função de outro campo
 * (percentual, total, saldo) não fica gravado como número fixo — vira cálculo no
 * componente que o usa.
 */

// ─── Clientes (clientes-lista.html, cliente-ficha.html) ────────────────────────

/**
 * "Retorno previsto" de exemplo: nunca um texto gravado com data e "em N dias"/"há N
 * dias" fixos (correção I2) — só a data-base (dia do mês) e a direção ficam fixas; o
 * texto e o estado vencido são calculados no componente a partir de `new Date()`.
 * `{ tipo: 'texto' }` é para os dois casos sem data específica (cliente nova, cliente
 * inativa) — aí não há o que recalcular.
 */
export type ClienteRetornoPrevisto =
  | { tipo: 'data'; diaBase: number; direcao: 'futuro' | 'vencido' }
  | { tipo: 'texto'; texto: string };

export interface ClienteExemplo {
  etiqueta: string;
  fase: string;
  servico: string;
  profissional: string;
  cicloMedioDias: number | null;
  cicloMedioLegenda: string;
  retornoPrevisto: ClienteRetornoPrevisto;
}

export interface ClientePreferenciaAtendimento {
  rotulo: string;
  valor: string;
}

export interface ClienteFichaTecnica {
  titulo: string;
  preferencias: ClientePreferenciaAtendimento[];
}

export interface ClienteGaleriaItem {
  data: string;
  legenda: string;
}

export interface ClienteLinhaDoTempoItem {
  // Nenhum item guarda data: "cadastro" sempre usa client.created_at real (correção
  // C1/I2); "whatsapp" e "avaliacao" recalculam a data relativa a cada render a partir
  // de um deslocamento fixo em dias (DIAS_ATRAS_EXEMPLO em ClientDetailPanel.tsx), nunca
  // um texto gravado (achado da varredura de telas: a avaliação tinha ficado atrás).
  tipo: 'whatsapp' | 'avaliacao' | 'cadastro';
  descricao: string;
}

export interface ClientePerfilDestaque {
  consentimentoLgpd: {
    texto: string;
    // Sem "autorizadoEm" fixo: a data de autorização usa client.created_at real
    // (correção C1 da revisão final), então não há campo de exemplo a manter aqui.
    canal: string;
  };
  fichaTecnica: ClienteFichaTecnica;
  galeria: ClienteGaleriaItem[];
  linhaDoTempo: ClienteLinhaDoTempoItem[];
}

export interface ClientesContent {
  exemplos: ClienteExemplo[];
  perfilDestaque: ClientePerfilDestaque;
}

// ─── WhatsApp (whatsapp-conexao.html) ──────────────────────────────────────────

export interface WhatsappSaude {
  taxaEntregaPercentual: number;
  variacaoTaxaEntrega: string;
  denunciasSpam: number;
}

export interface WhatsappBreakdownItem {
  rotulo: string;
  quantidade: number;
}

export interface WhatsappHistoricoItem {
  horario: string;
  destinatario: string;
  tipo: string;
  status: string;
}

export interface WhatsappContent {
  saude: WhatsappSaude;
  breakdownEnvios: WhatsappBreakdownItem[];
  historicoRecente: WhatsappHistoricoItem[];
}

// ─── Plano (ajustes-plano.html) ────────────────────────────────────────────────

export interface PlanoProximaCobranca {
  data: string;
  diasRestantes: number;
}

export interface PlanoAtual {
  proximaCobranca: PlanoProximaCobranca;
}

export interface PlanoFormaPagamento {
  bandeira: string;
  final: string;
  titular: string;
  validade: string;
}

export interface PlanoFatura {
  data: string;
  periodo: string;
  formaPagamento: string;
  status: 'Pago';
}

export interface PlanoCancelamento {
  acessoAte: string;
  mensagem: string;
}

export interface PlanoContent {
  atual: PlanoAtual;
  formaPagamento: PlanoFormaPagamento;
  faturas: PlanoFatura[];
  cancelamento: PlanoCancelamento;
}

// ─── Módulo ─────────────────────────────────────────────────────────────────────

export interface ConteudoDemo {
  clientes: ClientesContent;
  whatsapp: WhatsappContent;
  plano: PlanoContent;
}

export const conteudoDemo = {
  clientes: {
    exemplos: [
      {
        etiqueta: 'Clube VIP',
        fase: 'Fiel',
        servico: 'Corte e finalização',
        profissional: 'Camila',
        cicloMedioDias: 21,
        cicloMedioLegenda: 'Muito pontual',
        retornoPrevisto: { tipo: 'data', diaBase: 3, direcao: 'futuro' },
      },
      {
        etiqueta: 'Fidelidade',
        fase: 'Recorrente',
        servico: 'Coloração',
        profissional: 'Camila',
        cicloMedioDias: 20,
        cicloMedioLegenda: 'Padrão regular',
        retornoPrevisto: { tipo: 'data', diaBase: 7, direcao: 'futuro' },
      },
      {
        etiqueta: 'Resgatável',
        fase: 'Em risco',
        servico: 'Massagem relaxante',
        profissional: 'Camila',
        cicloMedioDias: 21,
        cicloMedioLegenda: 'Ciclo estourado',
        retornoPrevisto: { tipo: 'data', diaBase: 5, direcao: 'vencido' },
      },
      {
        etiqueta: 'Preferencial',
        fase: 'Fiel',
        servico: 'Limpeza de pele',
        profissional: 'Bruna',
        cicloMedioDias: 28,
        cicloMedioLegenda: 'Ciclo exato',
        retornoPrevisto: { tipo: 'data', diaBase: 15, direcao: 'futuro' },
      },
      {
        etiqueta: 'Não retornou',
        fase: 'Perdido',
        servico: 'Hidratação capilar',
        profissional: 'Paula',
        cicloMedioDias: 30,
        cicloMedioLegenda: 'Inativo há 4 ciclos',
        retornoPrevisto: { tipo: 'texto', texto: 'Inativa · campanha de resgate' },
      },
      {
        etiqueta: 'Primeira vez',
        fase: 'Novo',
        servico: 'Design de sobrancelhas',
        profissional: 'Paula',
        cicloMedioDias: null,
        cicloMedioLegenda: 'Histórico em formação',
        retornoPrevisto: { tipo: 'texto', texto: 'Sugerir retorno em ~45 dias' },
      },
    ],
    perfilDestaque: {
      consentimentoLgpd: {
        texto: 'Consentimento ativo para WhatsApp e lembretes automáticos de agendamento.',
        canal: 'Link da bio do Instagram',
      },
      fichaTecnica: {
        titulo: 'Preferências de atendimento',
        preferencias: [
          { rotulo: 'Preferência principal', valor: 'Acabamento discreto, tom neutro' },
          { rotulo: 'Duração habitual', valor: 'Sessões de 2 horas' },
        ],
      },
      galeria: [
        { data: '12 de setembro', legenda: 'Sessão de manutenção' },
        { data: '22 de agosto', legenda: 'Sessão completa' },
        { data: '1 de agosto', legenda: 'Primeira sessão do mês' },
        { data: '10 de julho', legenda: 'Sessão de manutenção' },
      ],
      linhaDoTempo: [
        {
          tipo: 'whatsapp',
          descricao: 'Lembrete automático enviado · cliente respondeu "Confirmadíssimo!"',
        },
        {
          tipo: 'avaliacao',
          descricao: '5 estrelas · recebida via link de satisfação pós-atendimento',
        },
        {
          tipo: 'cadastro',
          descricao: 'Primeira visita e cadastro inicial pela página pública',
        },
      ],
    },
  },
  whatsapp: {
    saude: {
      taxaEntregaPercentual: 99.4,
      variacaoTaxaEntrega: '+0,2% comparado a ontem',
      denunciasSpam: 0,
    },
    breakdownEnvios: [
      { rotulo: 'Lembretes e confirmações automáticas', quantidade: 42 },
      { rotulo: 'Notificações de sinal Pix e recibos', quantidade: 16 },
      { rotulo: 'Mensagens manuais (chat humano)', quantidade: 10 },
    ],
    historicoRecente: [
      {
        horario: 'Hoje, 11:42',
        destinatario: 'Juliana Mendes',
        tipo: 'Lembrete de atendimento (2h antes)',
        status: 'Entregue e lido',
      },
      {
        horario: 'Hoje, 11:38',
        destinatario: 'Camila Rocha',
        tipo: 'Comprovante de sinal Pix',
        status: 'Entregue e lido',
      },
      {
        horario: 'Hoje, 11:15',
        destinatario: 'Beatriz Silveira',
        tipo: 'Confirmação de agendamento',
        status: 'Entregue e lido',
      },
    ],
  },
  plano: {
    atual: {
      proximaCobranca: {
        data: '15 de outubro de 2026',
        diasRestantes: 28,
      },
    },
    formaPagamento: {
      bandeira: 'Mastercard',
      final: '8821',
      titular: 'CARLA R. SILVA',
      validade: '08/28',
    },
    faturas: [
      {
        data: '15/09/2026',
        periodo: '15/set a 14/out de 2026',
        formaPagamento: 'Mastercard •••• 8821',
        status: 'Pago',
      },
      {
        data: '15/08/2026',
        periodo: '15/ago a 14/set de 2026',
        formaPagamento: 'Mastercard •••• 8821',
        status: 'Pago',
      },
      {
        data: '15/07/2026',
        periodo: '15/jul a 14/ago de 2026',
        formaPagamento: 'Pix Automático',
        status: 'Pago',
      },
      {
        data: '15/06/2026',
        periodo: '15/jun a 14/jul de 2026',
        formaPagamento: 'Pix Automático',
        status: 'Pago',
      },
    ],
    cancelamento: {
      acessoAte: '14 de outubro de 2026',
      mensagem:
        'Seus dados de clientes e o histórico de agendamentos nunca são apagados e podem ser exportados a qualquer momento em formato CSV ou Excel.',
    },
  },
} as const satisfies ConteudoDemo;
