/** Regras do CRM (sub-projeto 2B). Função pura: datas em YYYY-MM-DD no fuso do negócio. */
export type Fase = 'novo' | 'recorrente' | 'fiel' | 'em_risco' | 'perdido';
export const FASE_ROTULO: Record<Fase, string> = {
  novo: 'Novo', recorrente: 'Recorrente', fiel: 'Fiel / VIP', em_risco: 'Em risco', perdido: 'Perdido',
};

export interface Visita { date: string; receita: number; servico: string; profissional: string; professionalId?: string; serviceId?: string; duracao?: number }
export interface ResumoCliente {
  visitas: number;
  cicloMedio: number | null;
  ultimaVisita: (Visita & { diasAtras: number }) | null;
  retornoPrevisto: { data: string | null; venceuHa: number | null; texto: string };
  fase: Fase;
  ltv: number;
  ticketMedio: number | null;
  etiquetasAuto: string[];
}

const DIA = 86_400_000;
const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const diasEntre = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DIA);
const somarDias = (d: string, n: number): string => new Date(utc(d) + n * DIA).toISOString().slice(0, 10);
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const centavos = (v: number) => Math.round(v * 100);

export function resumirCliente(visitas: Visita[], hoje: string, aniversario: string | null): ResumoCliente {
  const ordenadas = [...visitas].sort((a, b) => a.date.localeCompare(b.date));
  const n = ordenadas.length;
  const intervalos: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = diasEntre(ordenadas[i - 1].date, ordenadas[i].date);
    if (d > 0) intervalos.push(d);
  }
  const cicloMedio = intervalos.length ? Math.round(intervalos.reduce((s, x) => s + x, 0) / intervalos.length) : null;
  const ultima = n ? ordenadas[n - 1] : null;
  const diasAtras = ultima ? diasEntre(ultima.date, hoje) : null;

  let retornoPrevisto: ResumoCliente['retornoPrevisto'];
  if (!ultima) retornoPrevisto = { data: null, venceuHa: null, texto: '—' };
  else if (cicloMedio === null) retornoPrevisto = { data: null, venceuHa: null, texto: 'Sugerir retorno em ~45 dias' };
  else {
    const data = somarDias(ultima.date, cicloMedio);
    const falta = diasEntre(hoje, data);
    retornoPrevisto = falta < 0
      ? { data, venceuHa: -falta, texto: `Venceu há ${-falta} ${-falta === 1 ? 'dia' : 'dias'}` }
      : { data, venceuHa: null, texto: falta === 0 ? `${ddmm(data)} · hoje` : `${ddmm(data)} · em ${falta} ${falta === 1 ? 'dia' : 'dias'}` };
  }

  const limite = cicloMedio !== null ? 1.5 * cicloMedio : 45;
  let fase: Fase;
  if (ultima && (diasAtras as number) > 120) fase = 'perdido';
  else if (ultima && (diasAtras as number) > limite) fase = 'em_risco';
  else if (n <= 1) fase = 'novo';
  else if (n >= 5) fase = 'fiel';
  else fase = 'recorrente';

  const ltvCents = ordenadas.reduce((s, x) => s + centavos(x.receita), 0);
  const etiquetasAuto: string[] = [];
  if (aniversario && aniversario.slice(5, 7) === hoje.slice(5, 7)) etiquetasAuto.push(`Aniversário ${ddmm(aniversario)}`);
  if (n === 1) etiquetasAuto.push('Primeira vez');
  if (fase === 'em_risco') etiquetasAuto.push('Resgatável');

  return {
    visitas: n,
    cicloMedio,
    ultimaVisita: ultima ? { ...ultima, diasAtras: diasAtras as number } : null,
    retornoPrevisto,
    fase,
    ltv: ltvCents / 100,
    ticketMedio: n ? Math.round(ltvCents / n) / 100 : null,
    etiquetasAuto,
  };
}

export function taxaRetencao(datasPorCliente: Map<string, string[]>, hoje: string): number | null {
  const inicioRecente = somarDias(hoje, -90);
  const inicioAnterior = somarDias(hoje, -180);
  let base = 0;
  let voltaram = 0;
  for (const datas of datasPorCliente.values()) {
    const anterior = datas.some((d) => d >= inicioAnterior && d < inicioRecente);
    if (!anterior) continue;
    base++;
    if (datas.some((d) => d >= inicioRecente && d <= hoje)) voltaram++;
  }
  return base ? Math.round((voltaram / base) * 100) : null;
}
