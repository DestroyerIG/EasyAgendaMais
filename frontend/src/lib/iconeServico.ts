// Ícone do serviço pelo nome (Material Symbols). O serviço não tem categoria, então o nome decide;
// a ordem importa: "barba" antes de "corte", "sobrancelha" antes de "design".
const REGRAS: Array<[RegExp, string]> = [
  [/\b(unha|manicure|pedicure|esmalt|gel|fibra|alongamento de unha|blindagem|spa dos pes|cuticula)/, 'brush'],
  [/\b(cilio|lash|lifting)/, 'visibility'],
  [/\b(sobrancelha|brow|henna|micropigment)/, 'face'],
  [/\b(barba|bigode|navalha)/, 'face_6'],
  [/\b(maquiagem|make)/, 'palette'],
  [/\b(depila|cera|laser)/, 'self_care'],
  [/\b(massagem|drenagem|limpeza de pele|peeling|facial|estetica|spa)/, 'spa'],
  [/\b(colora|tintura|luzes|mecha|balayage|reflexo|tonaliz)/, 'colorize'],
  [/\b(escova|progressiva|hidrata|cauteriza|botox|selagem|lavagem|penteado|tratamento capilar)/, 'air'],
  [/\b(corte|cabelo|degrade|pezinho|franja|tesoura)/, 'content_cut'],
];

export const ICONE_SERVICO_PADRAO = 'health_and_beauty';

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function iconeDoServico(nome: string): string {
  const n = normalizar(nome);
  return REGRAS.find(([re]) => re.test(n))?.[1] ?? ICONE_SERVICO_PADRAO;
}
