import type { EstadoOnboarding, HorariosInput, PrimeiroPasso } from './onboarding.types.js';

// Regras puras do onboarding guiado (fase 6). Etapas 1 a 3 obrigatórias; 6 = concluído.

export const ETAPA_CONCLUIDA = 6;
export const ULTIMA_OBRIGATORIA = 3;

export function estadoOnboarding(b: { onboardingEtapa: number; onboardingConcluidoEm: Date | null }): EstadoOnboarding {
  const pendente = b.onboardingConcluidoEm === null;
  const etapa = pendente ? Math.min(Math.max(b.onboardingEtapa, 1), 5) : ETAPA_CONCLUIDA;
  return { pendente, bloqueante: pendente && etapa <= ULTIMA_OBRIGATORIA, etapa };
}

/** Salvar uma etapa leva à seguinte, sem voltar o progresso de quem já foi além. */
export const etapaDepoisDe = (atual: number, salva: number) => Math.min(Math.max(atual, salva + 1), 5);

/** Pode concluir (pular 4 e 5) só depois das obrigatórias. */
export const podeConcluir = (etapa: number) => etapa > ULTIMA_OBRIGATORIA;

const minutos = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Mensagens de erro dos horários (vazio = ok). */
export function errosDosHorarios(h: HorariosInput): string[] {
  const erros: string[] = [];
  const abre = minutos(h.abertura);
  const fecha = minutos(h.fechamento);
  if (fecha <= abre) erros.push('O fechamento precisa ser depois da abertura.');
  if (h.pausa) {
    const ini = minutos(h.pausa.inicio);
    const fim = minutos(h.pausa.fim);
    if (fim <= ini) erros.push('O fim da pausa precisa ser depois do início.');
    else if (ini < abre || fim > fecha) erros.push('A pausa precisa ficar dentro do horário de atendimento.');
  }
  return erros;
}

export const precisaDePix = (servicos: Array<{ sinalPct?: number | null }>) => servicos.some((s) => (s.sinalPct ?? 0) > 0);

/** Endereço da página a partir do nome: minúsculas, sem acento, só letras, números e hífen. */
export function slugDoNome(nome: string): string {
  const base = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `${base || 'meu'}-negocio`;
}

/** O que ainda falta depois do onboarding (cartão "Termine de configurar" da tela Hoje). */
export function primeirosPassos(b: {
  slug: string | null; whatsappConectado: boolean; temChavePix: boolean; temSinal: boolean;
}): PrimeiroPasso[] {
  const passos: PrimeiroPasso[] = [];
  if (!b.slug) passos.push({ id: 'pagina', titulo: 'Publicar sua página de agendamento', href: '/minha-pagina' });
  if (!b.whatsappConectado) passos.push({ id: 'whatsapp', titulo: 'Conectar o WhatsApp', href: '/whatsapp' });
  if (b.temSinal && !b.temChavePix) passos.push({ id: 'pix', titulo: 'Cadastrar a chave Pix para receber o sinal', href: '/configuracoes/recebimentos' });
  return passos;
}
