/**
 * Conteúdo de exemplo das telas do painel.
 *
 * NADA AQUI VEM DO BANCO. São os valores que as telas de referência do Stitch
 * mostram, usados nos blocos cujas funções ainda não existem (sub-projetos D a I:
 * clube e pacotes, relatórios, página pública, sinal Pix).
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
  plano: PlanoContent;
}

export const conteudoDemo = {
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
