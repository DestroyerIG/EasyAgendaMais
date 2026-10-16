import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { proximasVagas } from '../dashboard/today.service.js';
import { inboxRepository } from './inbox.repository.js';
import type { RespostaRapidaDto } from './inbox.types.js';

const TIPOS_PIX: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', telefone: 'Telefone',
  random: 'Aleatória', aleatoria: 'Aleatória', evp: 'Aleatória',
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaAbreviado = (ymd: string) => DIAS[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;

const ok = (chave: RespostaRapidaDto['chave'], rotulo: string, texto: string): RespostaRapidaDto =>
  ({ chave, rotulo, disponivel: true, texto, motivo: null });
const falta = (chave: RespostaRapidaDto['chave'], rotulo: string, motivo: string): RespostaRapidaDto =>
  ({ chave, rotulo, disponivel: false, texto: null, motivo });

export const respostasRapidas = async (businessId: string, agora: Date = new Date()): Promise<RespostaRapidaDto[]> => {
  const [dados, cfg, vagas] = await Promise.all([
    inboxRepository.dadosRespostas(businessId),
    getBusinessScheduleSettings(businessId),
    proximasVagas(businessId, agora),
  ]);
  const hoje = todayInTimezone(cfg.timezone || 'America/Sao_Paulo', agora);
  const chave = dados.pixKey?.trim();
  const endereco = dados.endereco?.trim();
  const politica = dados.politica?.trim();
  const tipo = TIPOS_PIX[(dados.pixKeyType ?? '').toLowerCase()] ?? 'Pix';

  return [
    chave ? ok('pix', 'Chave Pix', `Segue a chave Pix do ${dados.negocio}:\nChave ${tipo}: ${chave}`)
      : falta('pix', 'Chave Pix', 'Cadastre a chave Pix em Ajustes'),
    endereco ? ok('como_chegar', 'Como chegar', `${endereco}\nNo mapa: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`)
      : falta('como_chegar', 'Como chegar', 'Cadastre o endereço em Ajustes'),
    vagas.length > 0
      ? ok('horarios', 'Horários livres', `Temos estes horários livres:\n${vagas.map((v) =>
        `• ${v.data === hoje ? 'Hoje' : diaAbreviado(v.data)} ${v.inicio} com ${v.profissional}`).join('\n')}\nQual fica melhor para você?`)
      : falta('horarios', 'Horários livres', 'Sem horários livres nos próximos 7 dias'),
    politica ? ok('politica', 'Política', politica)
      : falta('politica', 'Política', 'Cadastre o texto em Automações › Mensagens'),
  ];
};
