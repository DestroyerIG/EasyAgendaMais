import type { CatalogoPlanos, PlanoCatalogo } from '@/lib/billing';
import type { PlanId } from '@/lib/plans';

// Cópia do backend/src/config/planCatalog.ts; o teste de igualdade quebra se divergirem.
export const CATALOGO_PLANOS: CatalogoPlanos = {
  planos: [
    {
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
        'Lista de espera',
        'Campanhas',
        'Ficha de clientes',
        'Caixa',
      ],
      emBreve: [],
    },
    {
      id: 'profissional',
      nome: 'Equipe',
      preco: 99.9,
      limiteProfissionais: 5,
      publico: 'Estúdios',
      descricao: 'Para estúdios e espaços com equipe integrada em atendimento compartilhado.',
      destaques: ['Comissões', 'App da profissional', 'Relatórios e exportação'],
      emBreve: [],
    },
    {
      id: 'premium',
      nome: 'Salão',
      preco: 199.9,
      limiteProfissionais: null,
      publico: 'Salões',
      descricao: 'Gestão completa para grandes salões, múltiplas unidades e parcerias.',
      destaques: ['Clube e pacotes', 'Salão-parceiro'],
      emBreve: ['Várias unidades'],
    },
  ],
  matriz: [
    { id: 'pagina', grupo: 'Agendamento e recepção', titulo: 'Página com galeria e agendamento online', basico: true, profissional: true, premium: true },
    { id: 'whatsapp', grupo: 'Agendamento e recepção', titulo: 'Bot de WhatsApp, lembretes e confirmação', basico: true, profissional: true, premium: true },
    { id: 'ficha', grupo: 'Agendamento e recepção', titulo: 'Ficha de clientes e sinal via Pix', basico: true, profissional: true, premium: true },
    { id: 'retorno', grupo: 'Agendamento e recepção', titulo: 'Hora de voltar (radar de retorno)', basico: true, profissional: true, premium: true },
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
  ],
};

export const planoDoCatalogo = (id: PlanId): PlanoCatalogo =>
  CATALOGO_PLANOS.planos.find((p) => p.id === id) ?? CATALOGO_PLANOS.planos[0];

export const rotuloEquipe = (limite: number | null): string => {
  if (limite === null) return 'Profissionais ilimitadas';
  return limite === 1 ? '1 profissional' : `Até ${limite} profissionais`;
};
