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

export const separarPorPeriodo = (horarios: string[]): { manha: string[]; tarde: string[] } => ({
  manha: horarios.filter((h) => Number(h.slice(0, 2)) < 12),
  tarde: horarios.filter((h) => Number(h.slice(0, 2)) >= 12),
});
