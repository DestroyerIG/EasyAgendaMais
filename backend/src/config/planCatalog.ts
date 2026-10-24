import type { PlanId } from '../types/domain.js';

// Fonte única dos planos: preço cobrado (Pix e checkout), nome, limite de profissionais e a
// matriz de recursos da tela de comparação. O frontend lê por GET /billing/plans; a landing
// (frontend/src/lib/plans.ts) tem um teste que confere que os preços batem com este arquivo.

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
  preco: number;
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
    limiteProfissionais: 1,
    publico: 'Autônomas',
    descricao: 'Para profissionais autônomas que gerenciam seus próprios atendimentos.',
    destaques: [
      'Página com galeria',
      'Bot de WhatsApp',
      'Lembrete e confirmação',
      'Sinal via Pix',
      'Hora de voltar',
      'Ficha de clientes',
      'Caixa',
    ],
  },
  profissional: {
    id: 'profissional',
    nome: 'Equipe',
    preco: 99.9,
    limiteProfissionais: 5,
    publico: 'Estúdios',
    descricao: 'Para estúdios e espaços com equipe integrada em atendimento compartilhado.',
    destaques: ['Até 5 profissionais', 'Comissões', 'Relatórios e exportação'],
  },
  premium: {
    id: 'premium',
    nome: 'Salão',
    preco: 199.9,
    limiteProfissionais: null,
    publico: 'Salões',
    descricao: 'Gestão completa para grandes salões, múltiplas unidades e parcerias.',
    destaques: ['Profissionais ilimitadas', 'Suporte prioritário'],
  },
});

// Recursos "em breve" do plano (aparecem nos cartões com selo). Ficam separados de
// `destaques` para a tela poder marcar cada um.
export const PLAN_EM_BREVE: Readonly<Record<PlanId, string[]>> = Object.freeze({
  basico: [],
  profissional: ['Acesso das profissionais'],
  premium: ['Clube e pacotes', 'Salão-parceiro', 'Várias unidades'],
});

export const FEATURE_MATRIX: readonly RecursoMatriz[] = Object.freeze([
  { id: 'pagina', grupo: 'Agendamento e recepção', titulo: 'Página com galeria e agendamento online', basico: true, profissional: true, premium: true },
  { id: 'whatsapp', grupo: 'Agendamento e recepção', titulo: 'Bot de WhatsApp, lembretes e confirmação', basico: true, profissional: true, premium: true },
  { id: 'ficha', grupo: 'Agendamento e recepção', titulo: 'Ficha de clientes e sinal via Pix', basico: true, profissional: true, premium: true },
  { id: 'retorno', grupo: 'Agendamento e recepção', titulo: 'Hora de voltar (radar de retorno)', basico: true, profissional: true, premium: true },
  { id: 'caixa', grupo: 'Equipe e operação', titulo: 'Controle de caixa', basico: true, profissional: true, premium: true },
  { id: 'profissionais', grupo: 'Equipe e operação', titulo: 'Profissionais na grade', basico: '1', profissional: 'Até 5', premium: 'Ilimitadas' },
  { id: 'comissoes', grupo: 'Equipe e operação', titulo: 'Comissões', basico: false, profissional: true, premium: true },
  { id: 'reports', grupo: 'Equipe e operação', titulo: 'Relatórios e exportação', basico: false, profissional: true, premium: true },
  { id: 'acesso_profissionais', grupo: 'Equipe e operação', titulo: 'Acesso das profissionais', basico: false, profissional: 'em_breve', premium: 'em_breve' },
  { id: 'salao_parceiro', grupo: 'Expansão e gestão avançada', titulo: 'Salão-parceiro', basico: false, profissional: false, premium: 'em_breve' },
  { id: 'clube', grupo: 'Expansão e gestão avançada', titulo: 'Clube e pacotes de serviços', basico: false, profissional: false, premium: 'em_breve' },
  { id: 'unidades', grupo: 'Expansão e gestão avançada', titulo: 'Gestão de várias unidades', basico: false, profissional: false, premium: 'em_breve' },
  { id: 'suporte', grupo: 'Expansão e gestão avançada', titulo: 'Suporte prioritário', basico: false, profissional: false, premium: true },
]);

export const PLAN_PRICES: Readonly<Record<PlanId, number>> = Object.freeze({
  basico: PLAN_CATALOG.basico.preco,
  profissional: PLAN_CATALOG.profissional.preco,
  premium: PLAN_CATALOG.premium.preco,
});

// Limite numérico para o cadastro de profissionais (null no catálogo = sem limite).
export const professionalLimit = (plan: PlanId): number =>
  PLAN_CATALOG[plan].limiteProfissionais ?? Number.POSITIVE_INFINITY;

export const getPlanCatalog = () => ({
  planos: PLAN_ORDER.map((id) => ({ ...PLAN_CATALOG[id], emBreve: PLAN_EM_BREVE[id] })),
  matriz: FEATURE_MATRIX,
});
