const precisaAspas = /[;"\r\n]/;
const iniciaFormula = /^[=+\-@\t\r]/;
const formatar = (v: string | number | null): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
  // Proteção contra injeção de fórmula (Excel/Sheets): prefixa apóstrofo antes do escape.
  const seguro = iniciaFormula.test(v) ? `'${v}` : v;
  return precisaAspas.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};
export const linhaCsv = (campos: Array<string | number | null>): string => campos.map(formatar).join(';');
