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
 */

// ─── Hoje (hoje-desktop.html, hoje-mobile.html) ────────────────────────────────

export interface HojePendencia {
  icone: string;
  titulo: string;
  descricao: string;
  rotuloBotao: string;
}

export interface HojeContent {
  metaFaturamentoDiaria: {
    valorMeta: number;
    percentualAtingido: number;
  };
  // Legenda do cartão "Agendamentos hoje" (hoje-desktop.html / hoje-mobile.html);
  // não há campo equivalente no sistema real ainda.
  agendamentosLegenda: string;
  taxaOcupacao: {
    percentual: number;
    variacao: string;
    comparacaoLabel: string;
  };
  receitaRecuperada: {
    valor: number;
    origemLabel: string;
  };
  profissionaisAtivasHoje: number;
  pendencias: HojePendencia[];
}

// ─── Agenda (agenda-desktop.html, agenda-mobile.html, agendamento-detalhes.html) ─

export interface AgendaDetalhes {
  numero: string;
  cicloMedioDias: number;
  cicloMedioSelo: string;
  totalVisitas: number;
  ultimaVisitaResumo: string;
  comprovantePix: string;
  origem: string;
  criadoEm: string;
  lembreteWhatsappEnviado: boolean;
  clienteRecorrente: boolean;
}

export interface AgendaContent {
  // A duração de cada atendimento decide a altura do bloco na linha do tempo e o
  // "60 min" embaixo da hora no cartão do celular (agenda-desktop.html,
  // agenda-mobile.html, que escrevem uma duração diferente por cartão). O DTO de
  // /appointments não devolve a duração do serviço, então toda a tela cai neste
  // valor único. Quando o DTO passar a trazer service_duration_minutes, use-o e
  // apague esta chave.
  duracaoPadraoMinutos: number;
  detalhes: AgendaDetalhes;
}

// ─── Clientes (clientes-lista.html, cliente-ficha.html) ────────────────────────

export interface ClienteFaseResumo {
  fase: string;
  quantidade: number;
}

export interface ClienteExemplo {
  nome: string;
  telefone: string;
  etiqueta: string;
  fase: string;
  ultimaVisita: string;
  profissional: string;
  cicloMedioDias: number | null;
  cicloMedioLegenda: string;
  retornoPrevisto: string;
  ltvAcumulado: number;
  totalAtendimentos: number;
}

export interface ClientePreferenciaAtendimento {
  rotulo: string;
  valor: string;
}

export interface ClienteFichaTecnica {
  titulo: string;
  alerta: {
    titulo: string;
    descricao: string;
  };
  preferencias: ClientePreferenciaAtendimento[];
  observacoes: string;
}

export interface ClienteGaleriaItem {
  data: string;
  legenda: string;
  responsavel: string;
}

export interface ClienteLinhaDoTempoItem {
  data: string;
  tipo: 'agendamento' | 'whatsapp' | 'financeiro' | 'avaliacao' | 'falta' | 'cadastro';
  descricao: string;
}

export interface ClientePerfilDestaque {
  nome: string;
  telefone: string;
  whatsappVerificado: boolean;
  tagPreferenciaProfissional: string;
  aniversario: string;
  consentimentoLgpd: {
    texto: string;
    autorizadoEm: string;
    canal: string;
  };
  metricas: {
    cicloMedioDias: number;
    pontualidadePercentual: number;
    ticketMedio: number;
    gastoAcumulado: number;
    frequenciaVisitas: number;
    clienteDesde: string;
    faltas: number;
    faltaObservacao: string;
  };
  fichaTecnica: ClienteFichaTecnica;
  galeria: ClienteGaleriaItem[];
  linhaDoTempo: ClienteLinhaDoTempoItem[];
  avaliacao: {
    nota: number;
    comentario: string;
  };
  postoAtendimento: string;
  referenciaCaixa: string;
}

export interface ClientesContent {
  fasesResumo: ClienteFaseResumo[];
  exemplos: ClienteExemplo[];
  perfilDestaque: ClientePerfilDestaque;
}

// ─── Caixa (caixa.html) ─────────────────────────────────────────────────────────

export interface CaixaAbertura {
  horario: string;
  responsavel: string;
  saldoInicial: number;
}

export interface CaixaMetricas {
  entradas: number;
  entradasQuantidade: number;
  saidas: number;
  saidasQuantidade: number;
  saldo: number;
  comandasTotal: number;
  comandasFechadas: number;
  comandasAbertas: number;
  comandasFalta: number;
}

export interface CaixaFormaPagamento {
  rotulo: string;
  percentual: number;
  valor: number;
  quantidade: number;
}

export interface CaixaComanda {
  hora: string;
  cliente: string;
  telefone: string;
  profissional: string;
  formaPagamento: string;
  total: number;
  status: 'Fechada' | 'Aberta' | 'Falta';
}

export interface CaixaDespesa {
  nome: string;
  valor: number;
  descricao: string;
  horario: string;
  lancadoPor: string;
  formaPagamento: string;
}

export interface CaixaConferenciaDinheiro {
  fundoInicial: number;
  entradasDinheiro: number;
  saidasDinheiro: number;
  totalEsperado: number;
  bateCaixa: boolean;
}

export interface CaixaContent {
  abertura: CaixaAbertura;
  metricas: CaixaMetricas;
  formasPagamento: CaixaFormaPagamento[];
  comandas: CaixaComanda[];
  despesas: CaixaDespesa[];
  conferenciaDinheiro: CaixaConferenciaDinheiro;
}

// ─── WhatsApp (whatsapp-conexao.html) ──────────────────────────────────────────

export interface WhatsappConsumoDiario {
  enviadas: number;
  limiteDiario: number;
  percentualUtilizado: number;
  disponivelHoje: number;
}

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
  telefoneMascarado: string;
  tipo: string;
  status: string;
}

export interface WhatsappContent {
  consumoDiario: WhatsappConsumoDiario;
  saude: WhatsappSaude;
  breakdownEnvios: WhatsappBreakdownItem[];
  historicoRecente: WhatsappHistoricoItem[];
  solicitacaoAumentoLimite: {
    disponivel: boolean;
    limiteSugerido: number;
  };
}

// ─── Plano (ajustes-plano.html) ────────────────────────────────────────────────

export type PlanoNome = 'Solo' | 'Equipe' | 'Salão';

export interface PlanoRecursoIncluso {
  icone: string;
  titulo: string;
  descricao: string;
}

export interface PlanoAtual {
  nome: PlanoNome;
  ciclo: string;
  preco: number;
  proximaCobranca: {
    data: string;
    diasRestantes: number;
  };
  recursosInclusos: PlanoRecursoIncluso[];
}

export interface PlanoFormaPagamento {
  bandeira: string;
  final: string;
  titular: string;
  validade: string;
  debitoAutomaticoAtivo: boolean;
  pixAutomaticoAtivo: boolean;
}

export interface PlanoFatura {
  data: string;
  referencia: string;
  periodo: string;
  valor: number;
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
  hoje: HojeContent;
  agenda: AgendaContent;
  clientes: ClientesContent;
  caixa: CaixaContent;
  whatsapp: WhatsappContent;
  plano: PlanoContent;
}

export const conteudoDemo = {
  hoje: {
    metaFaturamentoDiaria: {
      valorMeta: 1800,
      percentualAtingido: 81,
    },
    agendamentosLegenda: '2 horários livres à tarde',
    taxaOcupacao: {
      percentual: 84,
      variacao: '+6%',
      comparacaoLabel: 'vs média de terça',
    },
    receitaRecuperada: {
      valor: 2980,
      origemLabel: 'via lembretes automáticos de WhatsApp',
    },
    profissionaisAtivasHoje: 3,
    pendencias: [
      {
        icone: 'event_busy',
        titulo: '2 horários vagos à tarde com Bruna',
        descricao: '14:30 e 16:45 sem agendamento',
        rotuloBotao: 'Oferecer à lista de espera',
      },
      {
        icone: 'schedule_send',
        titulo: '9 clientes com manutenção vencendo',
        descricao: 'Serviços no prazo ideal de retorno',
        rotuloBotao: 'Disparar lembrete',
      },
      {
        icone: 'qr_code_2',
        titulo: '3 sinais Pix aguardando pagamento',
        descricao: 'Expira em 30 minutos (R$ 110 pendentes)',
        rotuloBotao: 'Ver pendências',
      },
      {
        icone: 'star_half',
        titulo: '1 avaliação desfavorável registrada',
        descricao: 'Cliente Camila Dias · Ontem às 18:30',
        rotuloBotao: 'Ver e responder',
      },
    ],
  },
  agenda: {
    duracaoPadraoMinutos: 60,
    detalhes: {
      numero: '4892',
      cicloMedioDias: 21,
      cicloMedioSelo: 'Ideal para o serviço',
      totalVisitas: 8,
      ultimaVisitaResumo: 'há 19 dias (Camila)',
      comprovantePix: '#PIX-99824-A1',
      origem: 'Página Pública (Link da Bio)',
      criadoEm: '14/09 às 21:14',
      lembreteWhatsappEnviado: true,
      clienteRecorrente: true,
    },
  },
  clientes: {
    fasesResumo: [
      { fase: 'Todas', quantidade: 248 },
      { fase: 'Novo', quantidade: 24 },
      { fase: 'Recorrente', quantidade: 88 },
      { fase: 'Fiel', quantidade: 65 },
      { fase: 'Em risco', quantidade: 42 },
      { fase: 'Perdido', quantidade: 29 },
    ],
    exemplos: [
      {
        nome: 'Mariana Souza',
        telefone: '(11) 98741-2039',
        etiqueta: 'Clube VIP',
        fase: 'Fiel',
        ultimaVisita: '12 de setembro (há 5 dias)',
        profissional: 'Camila',
        cicloMedioDias: 21,
        cicloMedioLegenda: 'Muito pontual',
        retornoPrevisto: '3 de outubro (em 16 dias)',
        ltvAcumulado: 1820,
        totalAtendimentos: 14,
      },
      {
        nome: 'Rafaela Diniz',
        telefone: '(11) 97120-4491',
        etiqueta: 'Fidelidade',
        fase: 'Recorrente',
        ultimaVisita: '17 de setembro (hoje)',
        profissional: 'Camila',
        cicloMedioDias: 20,
        cicloMedioLegenda: 'Padrão regular',
        retornoPrevisto: '7 de outubro (em 20 dias)',
        ltvAcumulado: 1120,
        totalAtendimentos: 9,
      },
      {
        nome: 'Beatriz Costa',
        telefone: '(11) 96328-1190',
        etiqueta: 'Resgatável',
        fase: 'Em risco',
        ultimaVisita: '5 de agosto (há 43 dias)',
        profissional: 'Camila',
        cicloMedioDias: 21,
        cicloMedioLegenda: 'Ciclo estourado',
        retornoPrevisto: 'Venceu há 22 dias',
        ltvAcumulado: 890,
        totalAtendimentos: 7,
      },
      {
        nome: 'Letícia Albuquerque',
        telefone: '(11) 99812-7801',
        etiqueta: 'Preferencial',
        fase: 'Fiel',
        ultimaVisita: '17 de setembro (hoje)',
        profissional: 'Bruna',
        cicloMedioDias: 28,
        cicloMedioLegenda: 'Ciclo exato',
        retornoPrevisto: '15 de outubro (em 28 dias)',
        ltvAcumulado: 2340,
        totalAtendimentos: 12,
      },
      {
        nome: 'Carla Silveira',
        telefone: '(11) 95530-9921',
        etiqueta: 'Não retornou',
        fase: 'Perdido',
        ultimaVisita: '14 de maio (há 126 dias)',
        profissional: 'Paula',
        cicloMedioDias: 30,
        cicloMedioLegenda: 'Inativo há 4 ciclos',
        retornoPrevisto: 'Inativa · campanha de resgate',
        ltvAcumulado: 420,
        totalAtendimentos: 3,
      },
      {
        nome: 'Juliana Paes',
        telefone: '(11) 94451-8819',
        etiqueta: 'Primeira vez',
        fase: 'Novo',
        ultimaVisita: '17 de setembro (hoje)',
        profissional: 'Paula',
        cicloMedioDias: null,
        cicloMedioLegenda: 'Histórico em formação',
        retornoPrevisto: 'Sugerir retorno em ~45 dias',
        ltvAcumulado: 160,
        totalAtendimentos: 1,
      },
    ],
    perfilDestaque: {
      nome: 'Mariana Souza',
      telefone: '(83) 99876-5432',
      whatsappVerificado: true,
      tagPreferenciaProfissional: 'Prefere Camila',
      aniversario: 'Aniversário em 3 dias (20 de setembro)',
      consentimentoLgpd: {
        texto: 'Consentimento ativo para WhatsApp e lembretes automáticos de agendamento.',
        autorizadoEm: '12/03/2026',
        canal: 'Link da bio do Instagram',
      },
      metricas: {
        cicloMedioDias: 21,
        pontualidadePercentual: 92,
        ticketMedio: 130,
        gastoAcumulado: 1820,
        frequenciaVisitas: 14,
        clienteDesde: 'janeiro de 2026',
        faltas: 1,
        faltaObservacao: 'Avisou com antecedência · 0 no-show',
      },
      fichaTecnica: {
        titulo: 'Preferências de atendimento',
        alerta: {
          titulo: 'Alergia e restrição',
          descricao:
            'Sensível a um dos produtos de preparo padrão. Usar apenas a alternativa hipoalergênica indicada no cadastro.',
        },
        preferencias: [
          { rotulo: 'Preferência principal', valor: 'Acabamento discreto, tom neutro' },
          { rotulo: 'Duração habitual', valor: 'Sessões de 2 horas' },
        ],
        observacoes:
          'Cliente sensível ao toque prolongado; preferir ritmo mais lento no início do atendimento.',
      },
      galeria: [
        { data: '12 de setembro', legenda: 'Sessão de manutenção', responsavel: 'Camila' },
        { data: '22 de agosto', legenda: 'Sessão completa', responsavel: 'Camila' },
        { data: '1 de agosto', legenda: 'Primeira sessão do mês', responsavel: 'Camila' },
        { data: '10 de julho', legenda: 'Sessão de manutenção', responsavel: 'Camila' },
      ],
      linhaDoTempo: [
        {
          data: '17 de setembro (hoje)',
          tipo: 'agendamento',
          descricao: 'Sinal Pix de R$ 30,00 confirmado · restante de R$ 100,00 no local',
        },
        {
          data: '16 de setembro (ontem)',
          tipo: 'whatsapp',
          descricao: 'Lembrete automático enviado · cliente respondeu "Confirmadíssimo!"',
        },
        {
          data: '12 de setembro',
          tipo: 'financeiro',
          descricao: 'Atendimento concluído · R$ 135,00 pago integralmente via Pix',
        },
        {
          data: '12 de setembro',
          tipo: 'avaliacao',
          descricao: '5 estrelas · recebida via link de satisfação pós-atendimento',
        },
        {
          data: '22 de agosto',
          tipo: 'financeiro',
          descricao: 'Atendimento rápido concluído com Camila · R$ 70,00 pago em cartão de débito',
        },
        {
          data: '15 de julho',
          tipo: 'falta',
          descricao:
            'Falta justificada com 24h de antecedência · sinal remanejado para a sessão seguinte',
        },
        {
          data: '12 de março de 2026',
          tipo: 'cadastro',
          descricao: 'Primeira visita e cadastro inicial pela página pública',
        },
      ],
      avaliacao: {
        nota: 5,
        comentario: 'Atendimento excelente, resultado dura o mês todo.',
      },
      postoAtendimento: 'Estação 2',
      referenciaCaixa: 'Caixa Diário #219',
    },
  },
  caixa: {
    abertura: {
      horario: '07:45',
      responsavel: 'Carla',
      saldoInicial: 150,
    },
    metricas: {
      entradas: 1845,
      entradasQuantidade: 14,
      saidas: 120,
      saidasQuantidade: 2,
      saldo: 1875,
      comandasTotal: 16,
      comandasFechadas: 13,
      comandasAbertas: 2,
      comandasFalta: 1,
    },
    formasPagamento: [
      { rotulo: 'Pix', percentual: 45.5, valor: 840, quantidade: 6 },
      { rotulo: 'Sinais Pix', percentual: 13.0, valor: 240, quantidade: 8 },
      { rotulo: 'Débito', percentual: 20.9, valor: 385, quantidade: 3 },
      { rotulo: 'Crédito', percentual: 14.1, valor: 260, quantidade: 2 },
      { rotulo: 'Dinheiro', percentual: 6.5, valor: 120, quantidade: 1 },
      { rotulo: 'Clube e pacotes', percentual: 6.0, valor: 110, quantidade: 1 },
    ],
    comandas: [
      {
        hora: '10:00',
        cliente: 'Mariana Souza',
        telefone: '(83) 98412-2201',
        profissional: 'Camila',
        formaPagamento: 'Pix no balcão',
        total: 115,
        status: 'Fechada',
      },
      {
        hora: '10:15',
        cliente: 'Letícia Albuquerque',
        telefone: '(83) 97103-9944',
        profissional: 'Bruna',
        formaPagamento: 'Crédito 1x',
        total: 210,
        status: 'Fechada',
      },
      {
        hora: '11:30',
        cliente: 'Beatriz Costa',
        telefone: '(83) 99344-1299',
        profissional: 'Camila',
        formaPagamento: 'Em atendimento',
        total: 110,
        status: 'Aberta',
      },
      {
        hora: '12:00',
        cliente: 'Juliana Mendes',
        telefone: '(83) 98823-1100',
        profissional: 'Bruna',
        formaPagamento: 'Sinal Pix + débito',
        total: 105,
        status: 'Fechada',
      },
      {
        hora: '12:30',
        cliente: 'Camila Prado',
        telefone: '(83) 99120-8844',
        profissional: 'Paula',
        formaPagamento: 'Não compareceu',
        total: 140,
        status: 'Falta',
      },
      {
        hora: '13:15',
        cliente: 'Renata Vasconcelos',
        telefone: '(83) 99711-5432',
        profissional: 'Camila',
        formaPagamento: 'Dinheiro em espécie',
        total: 120,
        status: 'Fechada',
      },
    ],
    despesas: [
      {
        nome: 'Fornecedor de insumos',
        valor: 80,
        descricao: 'Materiais de uso diário para os atendimentos',
        horario: '09:10',
        lancadoPor: 'Carla',
        formaPagamento: 'Débito do estúdio',
      },
      {
        nome: 'Café e água',
        valor: 40,
        descricao: 'Café expresso em grãos e galão de água',
        horario: '10:45',
        lancadoPor: 'Carla',
        formaPagamento: 'Pix do estúdio',
      },
    ],
    conferenciaDinheiro: {
      fundoInicial: 150,
      entradasDinheiro: 120,
      saidasDinheiro: 0,
      totalEsperado: 270,
      bateCaixa: true,
    },
  },
  whatsapp: {
    consumoDiario: {
      enviadas: 68,
      limiteDiario: 250,
      percentualUtilizado: 27,
      disponivelHoje: 182,
    },
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
        telefoneMascarado: '+55 83 99611-****',
        tipo: 'Lembrete de atendimento (2h antes)',
        status: 'Entregue e lido',
      },
      {
        horario: 'Hoje, 11:38',
        destinatario: 'Camila Rocha',
        telefoneMascarado: '+55 83 98842-****',
        tipo: 'Comprovante de sinal Pix',
        status: 'Entregue e lido',
      },
      {
        horario: 'Hoje, 11:15',
        destinatario: 'Beatriz Silveira',
        telefoneMascarado: '+55 83 99105-****',
        tipo: 'Confirmação de agendamento',
        status: 'Entregue e lido',
      },
    ],
    solicitacaoAumentoLimite: {
      disponivel: true,
      limiteSugerido: 500,
    },
  },
  plano: {
    atual: {
      nome: 'Equipe',
      ciclo: 'Mensal',
      preco: 99.9,
      proximaCobranca: {
        data: '15 de outubro de 2026',
        diasRestantes: 28,
      },
      recursosInclusos: [
        {
          icone: 'group',
          titulo: 'Até 5 profissionais na grade',
          descricao: 'Carla Silva, Bruno Santos e 3 vagas livres',
        },
        {
          icone: 'smart_toy',
          titulo: 'Lembretes automáticos ilimitados',
          descricao: 'Lembretes e confirmações ativas por WhatsApp',
        },
        {
          icone: 'loyalty',
          titulo: 'Clube de assinaturas e pacotes',
          descricao: 'Recorrência automática de clientes no balcão',
        },
        {
          icone: 'qr_code_2',
          titulo: 'Sinal Pix no agendamento',
          descricao: 'Prevenção contra faltas e no-shows',
        },
      ],
    },
    formaPagamento: {
      bandeira: 'Mastercard',
      final: '8821',
      titular: 'CARLA R. SILVA',
      validade: '08/28',
      debitoAutomaticoAtivo: true,
      pixAutomaticoAtivo: true,
    },
    faturas: [
      {
        data: '15/09/2026',
        referencia: 'Mensalidade EasyAgenda+ Equipe',
        periodo: '15/set a 14/out de 2026',
        valor: 99.9,
        formaPagamento: 'Mastercard •••• 8821',
        status: 'Pago',
      },
      {
        data: '15/08/2026',
        referencia: 'Mensalidade EasyAgenda+ Equipe',
        periodo: '15/ago a 14/set de 2026',
        valor: 99.9,
        formaPagamento: 'Mastercard •••• 8821',
        status: 'Pago',
      },
      {
        data: '15/07/2026',
        referencia: 'Mensalidade EasyAgenda+ Equipe',
        periodo: '15/jul a 14/ago de 2026',
        valor: 99.9,
        formaPagamento: 'Pix Automático',
        status: 'Pago',
      },
      {
        data: '15/06/2026',
        referencia: 'Mensalidade EasyAgenda+ Equipe',
        periodo: '15/jun a 14/jul de 2026',
        valor: 99.9,
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
