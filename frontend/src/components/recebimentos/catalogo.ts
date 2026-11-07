// Gateways de recebimento exibidos em Ajustes. Só o Mercado Pago está disponível.

export interface GatewayCatalogo {
  id: string;
  nome: string;
  logo: string;
  situacao: 'disponivel' | 'em_breve';
  conexao: 'autorizacao' | 'chave' | 'usuario';
  passos: Array<{ titulo: string; texto: string; links?: Array<{ rotulo: string; url: string }> }>;
  avisos: string[];
  campos?: Array<{ id: string; rotulo: string; ajuda: string }>;
}

export const URL_MERCADO_PAGO = 'https://www.mercadopago.com.br/';
export const URL_TAXAS_MERCADO_PAGO = 'https://www.mercadopago.com.br/costs-section';

export const AVISOS_MERCADO_PAGO = [
  'As taxas são cobradas pelo Mercado Pago e saem do valor do sinal.',
  'No cartão, o dinheiro pode levar mais tempo para ficar disponível.',
  'No cartão, o cliente pode contestar a compra no banco, e o valor pode voltar para ele.',
];

export const GATEWAYS: GatewayCatalogo[] = [
  {
    id: 'mercadopago',
    nome: 'Mercado Pago',
    logo: '/images/gateways/mercadopago.svg',
    situacao: 'disponivel',
    conexao: 'autorizacao',
    passos: [
      {
        titulo: 'Tenha uma conta no Mercado Pago',
        texto: 'Entre na sua conta ou crie uma, se ainda não tiver.',
        links: [
          { rotulo: 'Entrar no Mercado Pago', url: URL_MERCADO_PAGO },
          { rotulo: 'Criar conta', url: URL_MERCADO_PAGO },
        ],
      },
      {
        titulo: 'Cadastre uma chave Pix na conta',
        texto: 'No app ou no site do Mercado Pago, cadastre uma chave Pix na conta. Essa é a chave da conta do Mercado Pago, não a de "Minha página".',
        links: [{ rotulo: 'Abrir o Mercado Pago', url: URL_MERCADO_PAGO }],
      },
      {
        titulo: 'Conecte sua conta',
        texto: 'Você entra no site do Mercado Pago, autoriza o acesso e volta para esta tela. Não precisa digitar chave, token nem código.',
      },
      {
        titulo: 'Escolha o que o cliente pode usar',
        texto: 'O Pix já vem marcado. O cartão é opcional.',
      },
      {
        titulo: 'Pronto',
        texto: 'Os novos sinais passam a ser confirmados sozinhos.',
      },
    ],
    avisos: AVISOS_MERCADO_PAGO,
  },
  { id: 'asaas', nome: 'Asaas', logo: '/images/gateways/asaas.svg', situacao: 'em_breve', conexao: 'chave', passos: [], avisos: [] },
  { id: 'infinitepay', nome: 'InfinitePay', logo: '/images/gateways/infinitepay.png', situacao: 'em_breve', conexao: 'usuario', passos: [], avisos: [] },
  { id: 'pagbank', nome: 'PagBank', logo: '/images/gateways/pagbank.svg', situacao: 'em_breve', conexao: 'chave', passos: [], avisos: [] },
];

