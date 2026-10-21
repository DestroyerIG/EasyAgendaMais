import { z } from 'zod';
import type { ConfigRegras, Regra } from './automacoes.types.js';

export const TEXTO_PADRAO: Record<Regra, string> = {
  confirmacao: 'Olá {primeiro_nome}! Tudo bem? Seu agendamento de {servico} está marcado para amanhã às {horario}. Responda 1 para Confirmar ou 2 para Reagendar.',
  sinal_pix: 'Sua vaga para {servico} está pré-reservada por {prazo} min! Para garantir, pague o sinal de R$ {valor_sinal} pelo Pix abaixo:\n\n{pix_copia_e_cola}',
  retorno: 'Oi {primeiro_nome}! Já faz {dias} dias do seu {ultimo_servico}. Vamos manter o cuidado impecável? Reserve sua manutenção: {link_agenda}',
  lista_espera: 'Abriu uma vaga {data} às {horario} com {profissional}! A primeira a agendar fica com o horário: {link}',
  lembrete: 'Seu horário amanhã é às {horario}. Estamos na {endereco}. Trajeto Waze/Maps: {link_mapa}. Chegue com 5 min de antecedência!',
  aniversario: 'Parabéns pelo seu dia, {primeiro_nome}! 🎉 Você ganhou {presente} para comemorar em grande estilo esta semana: {link}',
  avaliacao: 'Como foi sua experiência no {negocio} hoje? Responda com uma nota de 1 a 5 ⭐',
};

// Texto atual de runReminderJob (cronService), sem mudança
export const TEXTO_PADRAO_LEMBRETE_2H =
  '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👤 Profissional: {profissional}\n⏰ {horario}\n\nTe esperamos!';

export const VARIAVEIS: Record<Regra, string[]> = {
  confirmacao: ['nome', 'primeiro_nome', 'servico', 'horario', 'data', 'profissional', 'negocio'],
  sinal_pix: ['nome', 'servico', 'valor_sinal', 'pix_copia_e_cola', 'prazo', 'horario', 'data'],
  retorno: ['primeiro_nome', 'dias', 'ultimo_servico', 'profissional', 'horarios_livres', 'link_agenda', 'negocio'],
  lista_espera: ['primeiro_nome', 'data', 'horario', 'profissional', 'servico', 'link'],
  lembrete: ['nome', 'nome_cliente', 'primeiro_nome', 'servico', 'profissional', 'horario', 'data', 'endereco', 'link_mapa'],
  aniversario: ['primeiro_nome', 'presente', 'link', 'negocio'],
  avaliacao: ['primeiro_nome', 'negocio', 'servico', 'link_avaliacao'],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CONFIG_SCHEMA: { [R in Regra]: z.ZodType<ConfigRegras[R]> } = {
  confirmacao: z.object({
    hora: z.string().regex(HHMM).refine((h) => h >= '07:00' && h <= '12:00', 'Entre 07:00 e 12:00'),
  }),
  sinal_pix: z.object({ toleranciaMin: z.union([z.literal(15), z.literal(30), z.literal(60)]) }),
  retorno: z.object({ modo: z.enum(['ciclo', 'dias']), dias: z.number().int().min(7).max(180) }),
  lista_espera: z.object({ quantas: z.union([z.literal(1), z.literal(3), z.literal(5)]) }),
  lembrete: z.object({ modo: z.enum(['2h', 'vespera']), hora: z.string().regex(HHMM) }),
  aniversario: z.object({ presente: z.string().trim().min(1).max(80) }),
  avaliacao: z.object({
    horas: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    linkGoogle: z.string().trim().url().max(500).nullable(),
  }),
};

const PADRAO: { [R in Regra]: ConfigRegras[R] } = {
  confirmacao: { hora: '09:00' },
  sinal_pix: { toleranciaMin: 15 },
  retorno: { modo: 'ciclo', dias: 21 },
  lista_espera: { quantas: 3 },
  lembrete: { modo: '2h', hora: '18:00' },
  aniversario: { presente: 'R$ 20 OFF em qualquer serviço' },
  avaliacao: { horas: 2, linkGoogle: null },
};

export function configPadrao<R extends Regra>(regra: R): ConfigRegras[R] {
  return { ...PADRAO[regra] };
}

/** Mescla o bruto com o padrão; campo inválido volta ao padrão. */
export function lerConfig<R extends Regra>(regra: R, bruto: unknown): ConfigRegras[R] {
  const resultado = configPadrao(regra) as Record<string, unknown>;
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return resultado as ConfigRegras[R];
  const schema = CONFIG_SCHEMA[regra] as z.ZodType<unknown>;
  for (const campo of Object.keys(resultado)) {
    if (!(campo in bruto)) continue;
    const tentativa = schema.safeParse({ ...resultado, [campo]: (bruto as Record<string, unknown>)[campo] });
    if (tentativa.success) resultado[campo] = (tentativa.data as Record<string, unknown>)[campo];
  }
  return resultado as ConfigRegras[R];
}

const SO_PONTUACAO = /[^\p{L}\p{N}]/gu;

/**
 * Troca {chave} conhecida (presente em vars, mesmo vazia); mantém as desconhecidas.
 * Remove a linha cuja variável ficou vazia e que sobrou só com rótulo (até 20 chars, sem dígitos)
 * ou sem letras/dígitos.
 */
export function renderizarTexto(texto: string, vars: Record<string, string | null | undefined>): string {
  const linhas = texto.split('\n').map((linha) => {
    let tinhaVariavel = false;
    let ficouVazia = false;
    const nova = linha.replace(/\{(\w+)\}/g, (original, chave: string) => {
      if (!Object.prototype.hasOwnProperty.call(vars, chave)) return original;
      tinhaVariavel = true;
      const valor = vars[chave] ?? '';
      if (valor === '') ficouVazia = true;
      return valor;
    });
    if (tinhaVariavel && ficouVazia) {
      const semPontuacao = nova.replace(SO_PONTUACAO, '');
      if (semPontuacao.length === 0) return null;
      if (nova.trim().length <= 20 && !/\d/.test(nova)) return null;
    }
    return nova;
  });
  return linhas
    .filter((l): l is string => l !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const normalizar = (t: string): string =>
  t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

export function respostaConfirmacao(texto: string): 'sim' | 'nao' | null {
  const t = normalizar(texto);
  if (['1', 'sim', 'confirmo', 'confirmar', 'confirmado'].includes(t)) return 'sim';
  if (['2', 'nao', 'reagendar', 'reagendo'].includes(t)) return 'nao';
  return null;
}

export function notaAvaliacao(texto: string): 1 | 2 | 3 | 4 | 5 | null {
  const t = texto.replace(SO_PONTUACAO, '');
  return /^[1-5]$/.test(t) ? (Number(t) as 1 | 2 | 3 | 4 | 5) : null;
}

/** Aniversário em hojeYmd (YYYY-MM-DD). 29/02 comemora em 28/02 nos anos não bissextos. */
export function aniversarianteEm(birthDate: Date, hojeYmd: string): boolean {
  const mes = birthDate.getUTCMonth() + 1;
  const dia = birthDate.getUTCDate();
  const [a, m, d] = hojeYmd.split('-').map(Number);
  if (m === mes && d === dia) return true;
  const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  return mes === 2 && dia === 29 && !bissexto && m === 2 && d === 28;
}

export function periodoDoHorario(hhmm: string): 'manha' | 'tarde' | 'noite' {
  if (hhmm < '12:00') return 'manha';
  if (hhmm < '18:00') return 'tarde';
  return 'noite';
}

export function entradaCompativel(
  e: { serviceId: string; professionalId: string | null; desiredDate: string | null; period: string; duracaoServico: number },
  vaga: { serviceId: string; professionalId: string; data: string; hora: string; duracao: number },
): boolean {
  if (e.serviceId !== vaga.serviceId && e.duracaoServico > vaga.duracao) return false;
  if (e.professionalId && e.professionalId !== vaga.professionalId) return false;
  if (e.desiredDate && e.desiredDate !== vaga.data) return false;
  if (e.period !== 'qualquer' && e.period !== periodoDoHorario(vaga.hora)) return false;
  return true;
}

export function seloTaxa(pct: number): 'Excelente' | 'Boa' | 'Baixa' {
  if (pct >= 80) return 'Excelente';
  if (pct >= 50) return 'Boa';
  return 'Baixa';
}
