const precisaAspas = /[;"\r\n]/;
const formatar = (v: string | number | null): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toFixed(2).replace('.', ',');
  return precisaAspas.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
export const linhaCsv = (campos: Array<string | number | null>): string => campos.map(formatar).join(';');
