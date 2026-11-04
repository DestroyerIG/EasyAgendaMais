import type { PlanId } from '../types/domain.js';

// Fonte única dos planos: preço cobrado (Pix e checkout), nome, limite de profissionais e a
// matriz de recursos da tela de comparação. O painel lê por GET /billing/plans; a landing usa a
// cópia em frontend/src/lib/planCatalog.ts, e um teste de igualdade quebra se as duas divergirem.

export type DisponibilidadeRecurso = boolean | 'em_breve' | string;

export interface RecursoMatriz {
  id: string;
  grupo: string;
  titulo: string;
  basico: DisponibilidadeRecurso;
  profissional: DisponibilidadeRecurso;
  premium: DisponibilidadeRecurso;
}

export interface PlanoCatalogo {
  id: PlanId;
  nome: string;
  /** null no plano sob consulta (Salão): o valor é combinado com cada negócio. */
  preco: number | null;
  sobConsulta: boolean;
  limiteProfissionais: number | null;
  publico: string;
  descricao: string;
  destaques: string[];
}

export const PLAN_ORDER: readonly PlanId[] = Object.freeze(['basico', 'profissional', 'premium']);

export const PLAN_CATALOG: Readonly<Record<PlanId, PlanoCatalogo>> = Object.freeze({
  basico: {
    id: 'basico',
    nome: 'Solo',
    preco: 49.9,
    sobConsulta: false,
    limiteProfissionais: 1,
    publico: 'Autônomas',
    descricao: 'Para profissionais autônomas que gerenciam seus próprios atendimentos.',
    destaques: [
      'Página com galeria',
      'Bot de WhatsApp',
      'Lembrete e confirmação',
      'Sinal via Pix',
      'Hora de voltar',
      'Lista de espera',
      'Campanhas',
      'Ficha de clientes',
      'Caixa',
    ],
  },
  profissional: {
    id: 'profissional',
    nome: 'Equipe',
    preco: 99.9,
    sobConsulta: false,
    limiteProfissionais: 5,
    publico: 'Estúdios',
    descricao: 'Para estúdios e espaços com equipe integrada em atendimento compartilhado.',
    destaques: ['Comissões', 'App da profissional', 'Relatórios e exportação'],
  },
  premium: {
    id: 'premium',
    nome: 'Salão',
    preco: null,
    sobConsulta: true,
    limiteProfissionais: null,
    publico: 'Salões',
    descricao: 'Gestão completa para grandes salões, múltiplas unidades e parcerias.',
    destaques: ['Clube e pacotes', 'Salão-parceiro'],
  },
});

// Recursos "em breve" do plano (aparecem nos cartões com selo). Ficam separados de
// `destaques` para a tela poder marcar cada um.
export const PLAN_EM_BREVE: Readonly<Record<PlanId, string[]>> = Object.freeze({
  basico: [],
  profissional: [],
  premium: ['Várias unidades'],
});

export const FEATURE_MATRIX: readonly RecursoMatriz[] = Object.freeze([
  { id: 'pagina', grupo: 'Agendamento e recepção', titulo: 'Página com galeria e agendamento online', basico: true, profissional: true, premium: true },
  { id: 'whatsapp', grupo: 'Agendamento e recepção', titulo: 'Bot de WhatsApp, lembretes e confirmação', basico: true, profissional: true, premium: true },
  { id: 'ficha', grupo: 'Agendamento e recepção', titulo: 'Ficha de clientes e sinal via Pix', basico: true, profissional: true, premium: true },
  { id: 'retorno', grupo: 'Agendamento e recepção', titulo: 'Hora de voltar', basico: true, profissional: true, premium: true },
  { id: 'lista_espera', grupo: 'Agendamento e recepção', titulo: 'Lista de espera com aviso automático', basico: true, profissional: true, premium: true },
  { id: 'campanhas', grupo: 'Agendamento e recepção', titulo: 'Campanhas no WhatsApp', basico: true, profissional: true, premium: true },
  { id: 'caixa', grupo: 'Equipe e operação', titulo: 'Controle de caixa', basico: true, profissional: true, premium: true },
  { id: 'profissionais', grupo: 'Equipe e operação', titulo: 'Profissionais na grade', basico: '1', profissional: 'Até 5', premium: 'Ilimitadas' },
  { id: 'comissoes', grupo: 'Equipe e operação', titulo: 'Comissões', basico: false, profissional: true, premium: true },
  { id: 'reports', grupo: 'Equipe e operação', titulo: 'Relatórios e exportação', basico: false, profissional: true, premium: true },
  { id: 'acesso_profissionais', grupo: 'Equipe e operação', titulo: 'App da profissional', basico: false, profissional: true, premium: true },
  { id: 'salao_parceiro', grupo: 'Expansão e gestão avançada', titulo: 'Salão-parceiro', basico: false, profissional: false, premium: true },
  { id: 'clube', grupo: 'Expansão e gestão avançada', titulo: 'Clube e pacotes de serviços', basico: false, profissional: false, premium: true },
  { id: 'unidades', grupo: 'Expansão e gestão avançada', titulo: 'Gestão de várias unidades', basico: false, profissional: false, premium: 'em_breve' },
]);

// Valor antigo do Salão: vale para quem já estava no Salão antes de ele virar sob consulta e ainda não
// tem valor combinado (config/valorPlano.ts). Não aparece em tela de venda.
export const VALOR_SALAO_LEGADO = 199.9;

// Referência interna por plano. O valor que um negócio paga sai de valorMensal (config/valorPlano.ts).
export const PLAN_PRICES: Readonly<Record<PlanId, number>> = Object.freeze({
  basico: PLAN_CATALOG.basico.preco as number,
  profissional: PLAN_CATALOG.profissional.preco as number,
  premium: VALOR_SALAO_LEGADO,
});

// Limite numérico para o cadastro de profissionais (null no catálogo = sem limite).
export const professionalLimit = (plan: PlanId): number =>
  PLAN_CATALOG[plan].limiteProfissionais ?? Number.POSITIVE_INFINITY;

export const getPlanCatalog = () => ({
  planos: PLAN_ORDER.map((id) => ({ ...PLAN_CATALOG[id], emBreve: PLAN_EM_BREVE[id] })),
  matriz: FEATURE_MATRIX,
});
