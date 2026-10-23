import { diasEntre, type Visita } from '../crm/crmMetrics.js';
import { zonedToUtc, todayInTimezone } from '../../utils/businessDate.js';
import { ValidationError } from '../../utils/errors.js';
import { RODAPE_SAIR, type Segmento, type StatusCampanha, type StatusGravado } from './campanhas.types.js';

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  em_risco: 'Não vêm há mais de 30 dias (Em risco)',
  reativacao: 'Inativas há mais de 60 dias (Reativação)',
  aniversariantes: 'Aniversariantes do mês',
  vips: 'Top 10% mais frequentes (VIPs)',
  todas: 'Todas as clientes',
};

export const NOME_CURTO_SEGMENTO: Record<Segmento, string> = {
  em_risco: 'Em risco',
  reativacao: 'Reativação',
  aniversariantes: 'Aniversariantes',
  vips: 'VIPs',
  todas: 'Todas',
};

/** Ex.: "Reativação · 21/10". */
export function nomeAutomatico(segmento: Segmento, hojeYmd: string): string {
  return `${NOME_CURTO_SEGMENTO[segmento]} · ${hojeYmd.slice(8, 10)}/${hojeYmd.slice(5, 7)}`;
}

export interface ClienteDoPublico {
  id: string;
  nome: string;
  telefone: string;
  birthDate: string | null;
  diasSemVir: number | null;
  visitas12m: number;
  profissionalPreferida: { id: string; nome: string } | null;
  ultimoServico: { id: string; nome: string; duracao: number } | null;
}

/** Resumo do histórico da cliente usado para montar o público. */
export function resumoParaPublico(
  visitas: Visita[],
  hojeYmd: string,
): Pick<ClienteDoPublico, 'diasSemVir' | 'visitas12m' | 'profissionalPreferida' | 'ultimoServico'> {
  if (visitas.length === 0) return { diasSemVir: null, visitas12m: 0, profissionalPreferida: null, ultimoServico: null };
  const ordenadas = [...visitas].sort((a, b) => a.date.localeCompare(b.date));
  const ultima = ordenadas[ordenadas.length - 1];

  // Profissional com mais visitas; empate → a da visita mais recente.
  const contagem = new Map<string, { nome: string; n: number; recente: string }>();
  for (const v of ordenadas) {
    if (!v.professionalId) continue;
    const atual = contagem.get(v.professionalId);
    contagem.set(v.professionalId, { nome: v.profissional, n: (atual?.n ?? 0) + 1, recente: v.date });
  }
  let preferida: { id: string; nome: string; n: number; recente: string } | null = null;
  for (const [id, c] of contagem) {
    if (!preferida || c.n > preferida.n || (c.n === preferida.n && c.recente >= preferida.recente)) preferida = { id, ...c };
  }

  return {
    diasSemVir: diasEntre(ultima.date, hojeYmd),
    visitas12m: ordenadas.filter((v) => diasEntre(v.date, hojeYmd) < 365).length,
    profissionalPreferida: preferida ? { id: preferida.id, nome: preferida.nome } : null,
    ultimoServico: { id: ultima.serviceId ?? '', nome: ultima.servico, duracao: ultima.duracao ?? 0 },
  };
}

export function filtrarPublico(
  clientes: ClienteDoPublico[],
  f: { segmento: Segmento; professionalId: string | null; serviceId: string | null },
  hojeYmd: string,
): ClienteDoPublico[] {
  let lista: ClienteDoPublico[];
  switch (f.segmento) {
    case 'em_risco':
      lista = clientes.filter((c) => c.diasSemVir !== null && c.diasSemVir >= 31 && c.diasSemVir <= 60);
      break;
    case 'reativacao':
      lista = clientes.filter((c) => c.diasSemVir !== null && c.diasSemVir > 60);
      break;
    case 'aniversariantes':
      lista = clientes.filter((c) => c.birthDate !== null && c.birthDate.slice(5, 7) === hojeYmd.slice(5, 7));
      break;
    case 'vips': {
      const ativas = clientes.filter((c) => c.visitas12m >= 1).sort((a, b) => b.visitas12m - a.visitas12m);
      const corte = ativas.length ? ativas[Math.ceil(ativas.length * 0.1) - 1].visitas12m : 0;
      lista = ativas.filter((c) => c.visitas12m >= corte);
      break;
    }
    default:
      lista = [...clientes];
  }
  if (f.professionalId) lista = lista.filter((c) => c.profissionalPreferida?.id === f.professionalId);
  if (f.serviceId) lista = lista.filter((c) => c.ultimoServico?.id === f.serviceId);
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Status mostrado: deriva "enviando" e "concluida" do que ainda resta na fila. */
export function statusCampanha(
  c: { status: StatusGravado; inicioEm: Date },
  restantes: number,
  agora: Date,
): StatusCampanha {
  if (c.status !== 'agendada') return c.status;
  if (c.inicioEm.getTime() > agora.getTime()) return 'agendada';
  return restantes > 0 ? 'enviando' : 'concluida';
}

/** Valida data/hora de início (fuso do negócio) e devolve o instante UTC. */
export function validarInicio(data: string, hora: string, tz: string, agora: Date): Date {
  if (hora < '08:00' || hora > '19:30') throw new ValidationError('Escolha um horário entre 08:00 e 19:30');
  const hoje = todayInTimezone(tz, agora);
  // Datas passadas caem na checagem de instante abaixo.
  if (diasEntre(hoje, data) > 30) throw new ValidationError('Escolha uma data nos próximos 30 dias');
  const inicio = zonedToUtc(data, hora, tz);
  if (inicio.getTime() <= agora.getTime()) throw new ValidationError('Escolha um horário no futuro');
  return inicio;
}

export function comRodape(texto: string): string {
  return texto.trim() + '\n\n' + RODAPE_SAIR;
}
