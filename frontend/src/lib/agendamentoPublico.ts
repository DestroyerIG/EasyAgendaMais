// Formatações da página pública de agendamento. Datas sempre no fuso do navegador, em YYYY-MM-DD.

const paraIso = (data: Date): string => {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
};

const deIso = (iso: string): Date => new Date(`${iso}T00:00:00`);

export const hojeIso = (): string => paraIso(new Date());

/** Os próximos dias a partir de hoje, para a faixa de escolha do dia. */
export const proximosDias = (quantidade: number, inicio: Date = new Date()): string[] =>
  Array.from({ length: quantidade }, (_, i) =>
    paraIso(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)),
  );

/** 150 → "2h30"; 60 → "1h00"; 45 → "45 min". */
export const formatarDuracao = (minutos: number): string => {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;
};

/** "14:00" + 150 min → "16:30"; passa da meia-noite dando a volta no relógio. */
export const horaDeTermino = (inicio: string, minutos: number): string => {
  const [hora, minuto] = inicio.split(':').map(Number);
  const total = (hora * 60 + minuto + minutos) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const semPonto = (texto: string): string => texto.replace('.', '');
const maiuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

/** "Ter" */
export const diaDaSemanaCurto = (iso: string): string =>
  maiuscula(semPonto(deIso(iso).toLocaleDateString('pt-BR', { weekday: 'short' })));

/** "22" */
export const diaDoMes = (iso: string): string => String(deIso(iso).getDate());

/** "Setembro 2026" */
export const mesEAno = (iso: string): string => {
  const data = deIso(iso);
  return `${maiuscula(data.toLocaleDateString('pt-BR', { month: 'long' }))} ${data.getFullYear()}`;
};

/** "terça, 22 de setembro" */
export const dataPorExtenso = (iso: string): string => {
  const data = deIso(iso);
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  return `${semana}, ${data.getDate()} de ${data.toLocaleDateString('pt-BR', { month: 'long' })}`;
};

/** "terça, 22/09" */
export const dataCurta = (iso: string): string => {
  const data = deIso(iso);
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
  return `${semana}, ${data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};

export const separarPorPeriodo = <T extends { horario: string }>(horarios: T[]): { manha: T[]; tarde: T[] } => ({
  manha: horarios.filter((h) => Number(h.horario.slice(0, 2)) < 12),
  tarde: horarios.filter((h) => Number(h.horario.slice(0, 2)) >= 12),
});

/** "19:00" → "19h"; "19:30" → "19h30". */
export const horaCurta = (hora: string): string => {
  const [h, m] = hora.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

const textoIcs = (texto: string): string => texto.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Evento de calendário, no horário local de quem abre, para "Adicionar à agenda do celular". */
export const gerarIcs = ({ titulo, data, horario, duracaoMinutos, local }: {
  titulo: string; data: string; horario: string; duracaoMinutos: number; local: string | null;
}): string => {
  const [ano, mes, dia] = data.split('-').map(Number);
  const [hora, minuto] = horario.split(':').map(Number);
  const carimbo = (d: Date) => `${paraIso(d).replace(/-/g, '')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const inicio = new Date(ano, mes - 1, dia, hora, minuto);
  const fim = new Date(ano, mes - 1, dia, hora, minuto + duracaoMinutos);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EasyAgenda+//Agendamento//PT-BR', 'BEGIN:VEVENT',
    `UID:${carimbo(inicio)}-${duracaoMinutos}@easyagenda`, `DTSTAMP:${carimbo(new Date())}`,
    `DTSTART:${carimbo(inicio)}`, `DTEND:${carimbo(fim)}`, `SUMMARY:${textoIcs(titulo)}`,
    ...(local ? [`LOCATION:${textoIcs(local)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
};
