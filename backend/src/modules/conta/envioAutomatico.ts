import logger from '../../utils/logger.js';
import { estadoContaService } from './estadoConta.service.js';
import { podeEnviarOrigem } from './estadoConta.rules.js';

/**
 * Envio automático de WhatsApp liberado para o negócio nesta origem (regra em `podeEnviarOrigem`).
 * Sem conseguir ler o estado da conta, não libera e registra aviso: nunca envia às cegas.
 */
export async function envioAutomaticoLiberado(businessId: string, origem: string, agora?: Date): Promise<boolean> {
  try {
    return podeEnviarOrigem(await estadoContaService.doNegocio(businessId, agora), origem);
  } catch (err) {
    logger.warn({ err, businessId, origem }, 'contingencia: estado da conta ilegível; envio automático pulado nesta rodada');
    return false;
  }
}
