// Data "de hoje" no fuso do negócio, no formato YYYY-MM-DD (o locale en-CA formata assim).
export const todayInTimezone = (timezone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// Converte data (YYYY-MM-DD) + hora (HH:MM) de parede no fuso do negócio em um instante UTC real.
export const zonedToUtc = (dateYMD: string, hhmm: string, timezone: string): Date => {
  const [y, mo, d] = dateYMD.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const alvo = Date.UTC(y, mo - 1, d, h, mi);
  const offsetEm = (instante: number): number => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(instante)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instante;
  };
  const primeiro = alvo - offsetEm(alvo);
  return new Date(alvo - offsetEm(primeiro));
};
