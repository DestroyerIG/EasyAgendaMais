import { buscaRepository } from './busca.repository.js';
import type { ResultadoBusca } from './busca.types.js';
import { semAcento, digitos } from '../../utils/textoBusca.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';

const MAX_CLIENTES = 5;
const MAX_IDS_PARA_AGENDAMENTOS = 50;
const MAX_AGENDAMENTOS = 5;
const MIN_DIGITOS_TELEFONE = 3;

export const buscaService = {
  async buscar(businessId: string, q: string): Promise<ResultadoBusca> {
    const termo = semAcento(q);
    // Só símbolos (ex.: "()") não casa com nada útil.
    if (!/[\p{L}\p{N}]/u.test(termo)) return { clientes: [], agendamentos: [] };
    const num = digitos(q);
    // Telefone só entra quando o termo é só dígitos e sinais (mesma regra do front); e-mail ou nome com número não casa.
    const usaTelefone = /^[\d()+\-. ]+$/.test(q.trim()) && num.length >= MIN_DIGITOS_TELEFONE;

    const todos = await buscaRepository.clientesAtivos(businessId);
    const achados = todos
      .filter((c) => semAcento(c.name).includes(termo) || semAcento(c.email ?? '').includes(termo)
        || (usaTelefone && digitos(c.phone).includes(num)))
      .map((c) => ({ ...c, comeca: semAcento(c.name).startsWith(termo) }))
      .sort((a, b) => Number(b.comeca) - Number(a.comeca) || a.name.localeCompare(b.name, 'pt-BR'));

    if (achados.length === 0) return { clientes: [], agendamentos: [] };

    const ids = achados.slice(0, MAX_IDS_PARA_AGENDAMENTOS).map((c) => c.id);
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const hoje = todayInTimezone(timezone);
    const [futuros, passados] = await Promise.all([
      buscaRepository.agendamentosFuturos(businessId, ids, hoje),
      buscaRepository.agendamentosPassados(businessId, ids, hoje),
    ]);

    return {
      clientes: achados.slice(0, MAX_CLIENTES).map((c) => ({ id: c.id, nome: c.name, telefone: c.phone })),
      agendamentos: [...futuros, ...passados].slice(0, MAX_AGENDAMENTOS),
    };
  },
};
