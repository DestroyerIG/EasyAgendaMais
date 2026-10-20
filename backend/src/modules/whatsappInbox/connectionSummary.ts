import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRepository } from './inbox.repository.js';
import { grupoEnvio, mascararTelefone, rotuloOrigem, saudeEnvios } from './inbox.rules.js';
import { LIMITE_DIARIO, type Origem, type ResumoConexaoDto, type StatusMensagem } from './inbox.types.js';

const DIA_MS = 86_400_000;

export const resumoConexao = async (businessId: string, agora: Date = new Date()): Promise<ResumoConexaoDto> => {
  const cfg = await getBusinessScheduleSettings(businessId);
  const tz = cfg.timezone || 'America/Sao_Paulo';
  const inicio = zonedToUtc(todayInTimezone(tz, agora), '00:00', tz);

  const [status, negocio, envios, historico] = await Promise.all([
    whatsappService.getStatus(businessId),
    inboxRepository.dadosConexao(businessId),
    inboxRepository.enviosDesde(businessId, inicio),
    inboxRepository.historicoEnvios(businessId, 20),
  ]);

  let total = 0;
  let falhas = 0;
  const grupos = { automaticas: 0, pix: 0, manuais: 0 };
  for (const e of envios) {
    total += e.n;
    if (e.status === 'falhou') falhas += e.n;
    const g = grupoEnvio(e.origin as Origem);
    if (g) grupos[g] += e.n;
  }

  const conectado = status.status === 'connected';
  const desde = negocio.whatsappConnectedAt;
  const decorrido = desde ? agora.getTime() - desde.getTime() : null;

  return {
    conectado,
    numero: status.connectedNumber ?? negocio.whatsapp ?? null,
    conectadoDesde: desde ? desde.toISOString() : null,
    diasConectado: decorrido === null ? null : Math.max(0, Math.floor(decorrido / DIA_MS)),
    semInterrupcoes: conectado && decorrido !== null && decorrido >= DIA_MS,
    enviosHoje: {
      total, falhas, limite: LIMITE_DIARIO,
      percentual: Math.round((total / LIMITE_DIARIO) * 100),
      disponiveis: Math.max(0, LIMITE_DIARIO - total),
      grupos,
    },
    saude: saudeEnvios(total, falhas),
    historico: historico.map((m) => ({
      id: m.id,
      criadaEm: m.createdAt.toISOString(),
      cliente: m.conversation?.client?.name ?? null,
      telefone: mascararTelefone(m.conversation?.phone ?? m.phoneKey),
      tipo: rotuloOrigem(m.origin as Origem),
      status: m.status as StatusMensagem,
    })),
  };
};
