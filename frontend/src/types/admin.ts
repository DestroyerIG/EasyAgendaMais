// Tipos da API do SuperAdmin (painel H2). Os nomes seguem o backend (painel.service / painel.rules).
// Datas chegam como string ISO.

export type StatusAdmin =
  | 'ativo'
  | 'teste'
  | 'carencia'
  | 'bloqueado_cobranca'
  | 'teste_encerrado'
  | 'bloqueado_admin'
  | 'cancelado';

export type TipoAlerta = 'cobranca' | 'teste_sem_onboarding' | 'whatsapp' | 'sem_agendamento';

export type SegmentoAdmin = 'barbearia' | 'unhas' | 'cilios_sobrancelhas' | 'cabelo' | 'estetica' | 'outro';

export type CategoriaAuditoria = 'todos' | 'financeiro' | 'sistema' | 'operador';

export interface ConversaoLinha {
  criados: number;
  pagantes: number;
  taxaPct: number | null;
}

export interface NegocioEmRisco {
  id: string;
  nome: string;
  dono: string;
  whatsapp: string;
  segmento: string;
  plano: string;
  tipo: TipoAlerta;
  desde: string;
  /** Preço do plano: MRR de fato quando `pagante`; nos demais, valor em potencial. */
  mrr: number;
  /** Ativo ou em carência. */
  pagante: boolean;
}

// GET /admin/metrics
export interface AdminVisaoGeral {
  atualizadoEm: string;
  mrr: {
    mrr: number;
    mrrMesAnterior: number;
    variacaoPct: number | null;
    novos: number;
    churn: number;
  };
  testes: {
    ativos: number;
    vencendo48h: number;
    novosNaSemana: number;
  };
  conversao: {
    geral: ConversaoLinha;
    segmentos: Array<ConversaoLinha & { segmento: string; ticketMedio: number | null }>;
  };
  cancelamentos: {
    cancelamentosMes: number;
    churnContas: number;
    receitaCancelada: number;
    retencaoPct: number | null;
  };
  emRisco: NegocioEmRisco[];
  disparos24h: Array<{ origem: string; enviados: number; falhos: number }>;
}

export interface NegocioListado {
  id: string;
  nome: string;
  dono: string;
  email: string;
  whatsapp: string;
  endereco: string | null;
  segmento: string;
  plano: string;
  preco: number;
  status: StatusAdmin;
  /** false quando o negócio nunca configurou o WhatsApp. */
  temInstanciaWhatsapp: boolean;
  whatsappConectado: boolean;
  whatsappConectadoEm: string | null;
  agendamentos30d: number;
  ultimaAtividadeEm: string | null;
  diasRestantesTeste: number | null;
}

export interface CartoesGestao {
  base: number;
  pagantes: number;
  mrr: number;
  ticketMedio: number | null;
  testes: number;
  testesVencemHoje: number;
  conversaoPct: number | null;
  inadimplentes: number;
  valorPendente: number;
  bloqueioTotal: number;
}

export interface FiltrosNegocios {
  busca?: string;
  segmento?: string;
  status?: StatusAdmin;
  plano?: string;
}

export type LimitePagina = 6 | 20 | 50 | 100;

// GET /admin/tenants
export interface ListaNegocios {
  data: NegocioListado[];
  meta: PaginationMeta;
  /** null quando o envelope não traz os cartões. */
  cartoes: CartoesGestao | null;
  segmentos: Array<{ segmento: string; total: number }>;
}

export type StatusFatura = 'pago' | 'em_aberto' | 'vencido' | 'cancelado' | 'estornado';

export interface FaturaAdmin {
  id: string;
  data: string;
  referencia: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  valor: number;
  forma: 'pix' | 'card';
  formaDetalhe: string;
  status: StatusFatura;
  tipo: 'mensalidade' | 'upgrade';
  url: string | null;
}

// GET /admin/tenants/:id
export interface DetalheNegocio {
  negocio: NegocioListado & {
    cpfCnpj: string | null;
    slug: string | null;
    criadoEm: string;
    suspensoMotivo: string | null;
    statusAssinatura: string;
    fimDoPeriodo: string | null;
    temAssinaturaGateway: boolean;
    jaPagou: boolean;
    usuarioDonoId: string | null;
    /** Regra calculada no backend (a mesma da rota de estender o teste). */
    podeEstenderTeste: boolean;
  };
  ltv: { total: number; ciclos: number; desde: string | null };
  proximaCobranca: { data: string; valor: number } | null;
  /** null quando as faturas não puderam ser lidas (ex.: negócio bloqueado pelo admin). */
  faturas: FaturaAdmin[] | null;
  uso: {
    profissionaisAtivas: number;
    agendamentosMes: number;
    agendamentosComSinalMes: number;
    clientes: number;
    clientesNovosMes: number;
    lembretesLigados: boolean;
    enviosMes: { enviados: number; falhos: number };
    limiteProfissionais: number | null;
    paginaPublica: string | null;
  };
}

// GET /admin/tenants/:id/auditoria
export interface RegistroAuditoria {
  id: string;
  criadoEm: string;
  acao: string;
  status: string;
  ator: string | null;
  detalhes: unknown;
  ip: string | null;
}

export interface FiltrosAuditoria {
  categoria?: CategoriaAuditoria;
  page?: number;
  limit?: number;
}

// PATCH /admin/tenants/:id/trial
export interface TesteEstendido {
  tenantId: string;
  fimDoTeste: string;
}

// Usados pelas páginas de cupons e de auditoria geral (reestilizadas na Tarefa 10).
export interface AdminAuditLog {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_user_email: string | null;
  actor_business_id: string | null;
  actor_tenant_name: string | null;
  target_user_id: string | null;
  target_user_email: string | null;
  target_business_id: string | null;
  target_tenant_name: string | null;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: string | number;
  max_uses: number | null;
  current_uses: number;
  valid_until: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminCouponPayload {
  code?: string;
  description?: string | null;
  discount_type?: 'percent' | 'fixed';
  discount_value?: number;
  max_uses?: number | null;
  valid_until?: string | null;
  active?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedAdminResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AdminActionPayload {
  confirmation: 'CONFIRM';
  reason?: string;
}
