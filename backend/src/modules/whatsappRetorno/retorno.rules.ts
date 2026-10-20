import { zonedToUtc } from '../../utils/businessDate.js';

export interface Encaixe { inicio: string; curto: string; longo: string }

const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Vaga (data YYYY-MM-DD + hora HH:MM de parede no fuso do negócio) no formato curto, longo e instante UTC. */
export function formatarEncaixe(data: string, hhmm: string, tz: string): Encaixe {
  const [a, m, d] = data.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return {
    inicio: zonedToUtc(data, hhmm, tz).toISOString(),
    curto: `${DIAS_CURTO[dow]} ${hhmm}`,
    longo: `${DIAS_LONGO[dow]} (${String(d).padStart(2, '0')}/${MESES[m - 1]}) às ${hhmm}`,
  };
}

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? '';

const NUMEROS = ['1️⃣', '2️⃣'];

export function montarMensagemRetorno(d: {
  nome: string; negocio: string; servico: string; profissional: string; dias: number; encaixes: Encaixe[]; link: string | null;
}): string {
  const encaixes = d.encaixes.slice(0, 2);
  // Parágrafos separados por linha em branco; *trecho* é negrito no WhatsApp.
  const paragrafos = [
    `Oi, ${primeiroNome(d.nome)}! 💕 Aqui é da equipe do *${d.negocio.trim()}*.`,
    `Notamos que já faz *${d.dias}* dias desde o seu último atendimento de ${d.servico} com *${primeiroNome(d.profissional)}* e você deve estar precisando daquele cuidado especial ✨`,
  ];
  if (encaixes.length === 0) {
    paragrafos.push('Me conta o melhor dia para você que eu encontro um horário!');
  } else {
    paragrafos.push([
      encaixes.length === 1 ? 'Temos uma opção para você nesta semana:' : `Temos ${encaixes.length} opções para você nesta semana:`,
      ...encaixes.map((e, i) => `${NUMEROS[i]} *${e.longo}*`),
    ].join('\n'));
    paragrafos.push('Posso garantir seu horário em algum desses? Se preferir outro dia, é só me avisar!');
  }
  if (d.link) paragrafos.push(`Se preferir, agende sozinha por aqui: ${d.link}`);
  return paragrafos.join('\n\n');
}
