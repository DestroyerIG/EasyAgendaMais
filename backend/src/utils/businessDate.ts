// Data "de hoje" no fuso do negócio, no formato YYYY-MM-DD (o locale en-CA formata assim).
export const todayInTimezone = (timezone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
