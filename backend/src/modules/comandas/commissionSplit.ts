/**
 * Reparte a comissão de um tipo (em reais) entre as linhas, em centavos inteiros, half-up,
 * com o resto na última linha: a soma das partes é exatamente a comissão total.
 * Devolve as partes em reais, na mesma ordem das linhas.
 */
export function splitCommission(lineCents: number[], commissionReais: number): number[] {
  const total = lineCents.reduce((a, b) => a + b, 0);
  const comm = Math.round(commissionReais * 100);
  if (lineCents.length === 0) return [];
  if (total <= 0) return lineCents.map(() => 0);
  const partes: number[] = [];
  let acumulado = 0;
  lineCents.forEach((linha, idx) => {
    const parte = idx === lineCents.length - 1
      ? comm - acumulado
      : Math.floor((comm * linha) / total + 0.5);
    acumulado += parte;
    partes.push(parte);
  });
  return partes.map((p) => p / 100);
}
