const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lê o destino do link da busca geral (/agendamentos?data=AAAA-MM-DD&agendamento=<id>).
 * Devolve null se a data não existir no calendário ou o id não for um UUID.
 */
export function lerDestinoAgenda(
  data: string | null,
  agendamento: string | null,
): { data: string; agendamentoId: string } | null {
  if (!data || !agendamento) return null;
  const partes = DATA.exec(data);
  if (!partes || !UUID.test(agendamento)) return null;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return { data, agendamentoId: agendamento };
}
